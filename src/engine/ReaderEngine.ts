import type { Annotation, NavigationTarget } from '../types/annotations';
import type { ReaderSectionState } from '../services/ReaderSessionStore';
import { AnnotationManager } from './annotationManager';
import { SelectionDetector } from './selectionDetector';
import type {
  EngineEventBus,
  EngineState,
  ReaderSettings,
  OpenOptions,
  AddAnnotationParams,
} from './engineTypes';
import { createLogger } from '../utils/logger';

const log = createLogger('ReaderEngine');

/**
 * 核心阅读引擎，整合 AnnotationManager、SelectionDetector 和 bookLoader。
 *
 * 生命周期：idle → loading → ready → closed
 *
 * 职责：
 * - 加载书籍文件（通过动态导入 bookLoader）
 * - 管理标注 CRUD（委托 AnnotationManager）
 * - 检测文本选择（委托 SelectionDetector）
 * - 导航控制（委托 foliateNavigation）
 * - 阅读设置应用
 */
export class ReaderEngine {
  private state: EngineState = 'idle';
  private view: HTMLElement | null = null;
  private fileType: 'pdf' | 'epub' = 'epub';
  private annotations: AnnotationManager;
  private selectionDetector: SelectionDetector;
  private sectionInfo: ReaderSectionState = { currentIndex: 0, totalSections: 0 };
  private settings: ReaderSettings = { flowMode: 'paginated', columnMode: 'double', fontSize: 100 };
  private cleanupFns: Array<() => void> = [];
  /** 标注 overlay 同步映射表（id → cfiRange），用于增量更新 */
  private appliedOverlayMap: Map<string, string> = new Map();
  private filePath = '';

  constructor(
    private container: HTMLElement,
    private bus: EngineEventBus,
  ) {
    this.annotations = new AnnotationManager(bus);
    this.selectionDetector = new SelectionDetector(bus);
  }

  // ── 状态查询 ──────────────────────────────────────────

  /** 返回当前引擎状态 */
  getState(): EngineState {
    return this.state;
  }

  /** 书籍是否已加载完成 */
  getIsLoaded(): boolean {
    return this.state === 'ready';
  }

  /** 返回当前标注列表的副本 */
  getAnnotations(): Annotation[] {
    return this.annotations.getAnnotations();
  }

  /** 返回 foliate-view 元素（未加载时为 null） */
  getView(): HTMLElement | null {
    return this.view;
  }

  /** 返回当前章节信息的副本 */
  getSectionInfo(): ReaderSectionState {
    return { ...this.sectionInfo };
  }

  // ── 生命周期 ──────────────────────────────────────────

  /**
   * 加载书籍文件，从 idle 状态转换到 ready。
   *
   * @param filePath vault 中的文件路径
   * @param fileType 文件类型
   * @param opts 可选的阅读设置和高亮颜色
   */
  async open(filePath: string, fileType: 'pdf' | 'epub', opts?: OpenOptions): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot open: engine is in '${this.state}' state, expected 'idle'`);
    }

    this.state = 'loading';
    this.filePath = filePath;
    this.fileType = fileType;

    // 合并设置
    if (opts?.settings) {
      this.settings = { ...this.settings, ...opts.settings };
    }

    try {
      // 动态导入 bookLoader
      const { loadBook } = await import('./bookLoader');

      // 获取 Obsidian App 实例（全局模式）
      const app = (window as any).app;
      if (!app) {
        throw new Error('Obsidian App instance not available on window.app');
      }

      // 构造回调，将 bookLoader 事件转发到 bus
      const callbacks = {
        onOutlineLoaded: (
          items: Parameters<import('./bookLoader').BookLoaderCallbacks['onOutlineLoaded']>[0],
        ) => {
          this.bus.emit('outline-loaded', { items });
        },
        onMetadataLoaded: (
          metadata: Parameters<import('./bookLoader').BookLoaderCallbacks['onMetadataLoaded']>[0],
        ) => {
          this.bus.emit('metadata-loaded', { metadata });
        },
        onSectionChanged: (
          currentIndex: number,
          totalSections: number,
          currentLabel?: string,
          canGoPrev?: boolean,
          canGoNext?: boolean,
          cfi?: string,
        ) => {
          this.sectionInfo = { currentIndex, totalSections, currentLabel, canGoPrev, canGoNext };
          this.bus.emit('section-changed', { section: { ...this.sectionInfo } });
          if (cfi) {
            this.bus.emit('location-changed', { cfi, sectionIndex: currentIndex });
          }
        },
      };

      // 加载书籍，传入 getAnnotations 回调以便在 view.init() 前安装 create-overlay 监听
      const result = await loadBook(app, this.container, filePath, fileType, callbacks, {
        flowMode: this.settings.flowMode,
        columnMode: this.settings.columnMode,
        fontSize: this.settings.fontSize,
        getAnnotations: () => this.getAnnotations(),
      });

      this.view = result.view;
      this.fileType = result.fileType;

      // 安装选择检测器
      this.selectionDetector.install(this.view, this.fileType, () => this.getAnnotations());

      // 安装键盘导航
      const { installKeyboardNavigation } = await import('./foliateKeyboard');
      const cleanupKeyboard = installKeyboardNavigation(this.container, () => this.view);
      this.cleanupFns.push(cleanupKeyboard);

      // 安装 draw-annotation 事件处理
      const { installAnnotationRendering } = await import('./foliateAnnotations');
      const cleanupAnnotations = installAnnotationRendering(this.view);
      this.cleanupFns.push(cleanupAnnotations);

      this.state = 'ready';
      log.debug('engine ready:', filePath, 'type:', fileType);
    } catch (err) {
      // 失败时回退到 idle 状态
      this.state = 'idle';
      this.view = null;
      log.error('Failed to open book:', err);
      throw err;
    }
  }

  /**
   * 释放资源，转换到 closed 状态。
   * 幂等：多次调用不会报错。
   */
  close(): void {
    if (this.state === 'closed') return;

    // 卸载选择检测器
    this.selectionDetector.uninstall();

    // 执行所有清理函数
    for (const fn of this.cleanupFns) {
      try {
        fn();
      } catch {
        /* ignore cleanup errors */
      }
    }
    this.cleanupFns = [];

    // 关闭 foliate-view
    if (this.view) {
      try {
        (this.view as any).close?.();
      } catch {
        /* ignore */
      }
      // 从 DOM 移除
      if (this.view.parentNode) {
        this.view.parentNode.removeChild(this.view);
      }
      this.view = null;
    }

    // 清理 overlay 映射
    this.appliedOverlayMap.clear();

    this.state = 'closed';
    log.debug('engine closed');
  }

  // ── 标注操作 ──────────────────────────────────────────

  /**
   * 替换全部标注（初始加载时使用）。
   */
  setAnnotations(list: Annotation[]): void {
    this.annotations.setAnnotations(list);
    this.syncOverlays();
  }

  /**
   * 创建新标注并同步 overlay。
   */
  addAnnotation(params: AddAnnotationParams): Annotation {
    const annotation = this.annotations.addAnnotation(params, this.filePath);
    this.syncOverlays();
    return annotation;
  }

  /**
   * 删除标注并同步 overlay。
   */
  deleteAnnotation(id: string): void {
    this.annotations.deleteAnnotation(id);
    this.syncOverlays();
  }

  // ── 导航 ──────────────────────────────────────────────

  /**
   * 导航到指定目标（CFI href 或页码）。
   * 引擎未就绪时抛出异常。
   */
  async navigate(target: NavigationTarget): Promise<void> {
    this.ensureReady();
    const { navigateFoliate } = await import('./foliateNavigation');
    navigateFoliate(this.view!, target);
  }

  /**
   * 导航到指定章节索引。
   */
  async goToSection(index: number): Promise<void> {
    this.ensureReady();
    const { goToSection } = await import('./foliateNavigation');
    goToSection(this.view!, index);
  }

  /**
   * 翻到下一页/屏。
   */
  async goNext(): Promise<void> {
    this.ensureReady();
    const { goToNextPage } = await import('./foliateNavigation');
    goToNextPage(this.view!);
  }

  /**
   * 翻到上一页/屏。
   */
  async goPrev(): Promise<void> {
    this.ensureReady();
    const { goToPrevPage } = await import('./foliateNavigation');
    goToPrevPage(this.view!);
  }

  // ── 设置 ──────────────────────────────────────────────

  /**
   * 更新阅读设置。idle 和 ready 状态下均可调用；
   * ready 状态下会立即应用到 foliate-view。
   */
  updateSettings(partial: Partial<ReaderSettings>): void {
    this.settings = { ...this.settings, ...partial };
    if (this.state === 'ready' && this.view) {
      // 异步应用设置，不阻塞调用方
      this.applySettings(partial).catch((err) => {
        log.error('Failed to apply settings:', err);
      });
    }
  }

  // ── 私有辅助 ──────────────────────────────────────────

  /** 确保引擎处于 ready 状态，否则抛出异常 */
  private ensureReady(): void {
    if (this.state !== 'ready') {
      throw new Error(`Engine not ready (current state: '${this.state}')`);
    }
  }

  /** 动态导入并应用阅读设置到 foliate-view */
  private async applySettings(partial: Partial<ReaderSettings>): Promise<void> {
    if (!this.view) return;

    const { applyReaderFlowMode, applyColumnMode, applyFontSize } =
      await import('./readerSettings');

    if (partial.flowMode) applyReaderFlowMode(this.view, partial.flowMode);
    if (partial.columnMode) applyColumnMode(this.view, partial.columnMode);
    if (partial.fontSize !== undefined) applyFontSize(this.view, partial.fontSize);
  }

  /** 动态导入并同步标注 overlay 到 foliate-view */
  private syncOverlays(): void {
    if (!this.view || this.state !== 'ready') return;

    // 异步执行 overlay 同步
    import('./foliateAnnotations')
      .then(({ applyAnnotationOverlays }) =>
        applyAnnotationOverlays(this.view!, this.getAnnotations(), this.appliedOverlayMap),
      )
      .catch((err) => {
        log.error('Failed to sync overlays:', err);
      });
  }
}
