import type { Annotation, NavigationTarget } from '../types/annotations';
import type { ReaderSectionState } from '../services/ReaderSessionStore';
import { AnnotationManager } from './annotationManager';
import { SelectionDetector } from './selectionDetector';
import { AnnotationRenderer } from './AnnotationRenderer';
import { BookLoader, type BookLoaderCallbacks } from './BookLoader';
import { FoliateViewAdapter } from './FoliateViewAdapter';
import {
  installKeyboardNavigation,
  navigateFoliate,
  goToSection,
  goToNextPage,
  goToPrevPage,
} from './foliateNavigation';
import { applyReaderFlowMode, applyColumnMode, applyFontSize } from './readerSettings';
import { disableAndroidPatches } from './androidPatches';
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
 * 核心阅读引擎门面。
 * 协调 BookLoader、FoliateViewAdapter、AnnotationManager、AnnotationRenderer、
 * SelectionDetector 的生命周期。生命周期：idle → loading → ready → closed
 */
export class ReaderEngine {
  private state: EngineState = 'idle';
  private viewAdapter: FoliateViewAdapter | null = null;
  private fileType: 'pdf' | 'epub' = 'epub';
  private sectionInfo: ReaderSectionState = { currentIndex: 0, totalSections: 0 };
  private settings: ReaderSettings = { flowMode: 'paginated', columnMode: 'double', fontSize: 100 };
  private cleanupFns: Array<() => void> = [];
  private filePath = '';

  private annotations: AnnotationManager;
  private selectionDetector: SelectionDetector;
  private annotationRenderer: AnnotationRenderer;
  private bookLoader: BookLoader;

  constructor(
    private container: HTMLElement,
    private bus: EngineEventBus,
    /** 可选注入，便于测试 mock */
    selectionDetector?: SelectionDetector,
    /** 可选注入 AnnotationRenderer，默认创建实例 */
    annotationRenderer?: AnnotationRenderer,
  ) {
    this.annotations = new AnnotationManager(bus);
    this.selectionDetector = selectionDetector ?? new SelectionDetector(bus);
    this.annotationRenderer = annotationRenderer ?? new AnnotationRenderer();
    this.bookLoader = new BookLoader();
  }

  // ── 状态查询 ──────────────────────────────────────────

  getState(): EngineState {
    return this.state;
  }
  getIsLoaded(): boolean {
    return this.state === 'ready';
  }
  getAnnotations(): Annotation[] {
    return this.annotations.getAnnotations();
  }
  getView(): HTMLElement | null {
    return this.viewAdapter?.view ?? null;
  }
  getSectionInfo(): ReaderSectionState {
    return { ...this.sectionInfo };
  }

  // ── 生命周期 ──────────────────────────────────────────

  /**
   * 加载书籍文件。仅允许从 idle 或 closed 状态打开。
   * @param filePath vault 中的文件路径
   * @param fileType 文件类型
   * @param opts 可选的阅读设置和高亮颜色
   */
  async open(filePath: string, fileType: 'pdf' | 'epub', opts?: OpenOptions): Promise<void> {
    if (this.state === 'loading' || this.state === 'ready') {
      throw new Error(`Cannot open: engine is in '${this.state}' state`);
    }
    this.state = 'loading';
    this.filePath = filePath;
    if (opts?.settings) this.settings = { ...this.settings, ...opts.settings };

    try {
      const app = (window as any).app;
      if (!app) throw new Error('Obsidian App instance not available on window.app');

      // 将 NavigationTarget 转为 CFI 字符串（lastLocation）
      const lastLocation = opts?.initialNav?.href;

      const result = await this.bookLoader.load(
        app,
        this.container,
        filePath,
        fileType,
        this._buildCallbacks(),
        {
          flowMode: this.settings.flowMode,
          columnMode: this.settings.columnMode,
          fontSize: this.settings.fontSize,
          getAnnotations: () => this.getAnnotations(),
          lastLocation,
        },
      );

      this.viewAdapter = result.viewAdapter;
      this.fileType = result.fileType;

      this.annotationRenderer.install(this.viewAdapter, () => this.getAnnotations());
      this.selectionDetector.install(this.viewAdapter.view, fileType, () => this.getAnnotations());
      this.cleanupFns.push(
        installKeyboardNavigation(this.container, () => this.viewAdapter?.view ?? null),
      );

      this.state = 'ready';
      log.debug('engine ready:', filePath, 'type:', fileType);
    } catch (err) {
      this.state = 'idle';
      this.viewAdapter = null;
      log.error('Failed to open book:', err);
      throw err;
    }
  }

  /** 释放资源，转换到 closed 状态。幂等。 */
  close(): void {
    if (this.state === 'closed') return;

    this.selectionDetector.uninstall();
    this.annotationRenderer.uninstall();
    this._runCleanupFns();

    if (this.viewAdapter) {
      try {
        this.viewAdapter.close();
      } catch {
        /* ignore */
      }
      if (this.viewAdapter.view.parentNode) {
        this.viewAdapter.view.parentNode.removeChild(this.viewAdapter.view);
      }
      this.viewAdapter = null;
    }

    this._disableAndroidPatches();
    this.state = 'closed';
    log.debug('engine closed');
  }

  // ── 标注操作 ──────────────────────────────────────────

  setAnnotations(list: Annotation[]): void {
    this.annotations.setAnnotations(list);
    this.annotationRenderer.syncOverlays(this.getAnnotations());
  }

  addAnnotation(params: AddAnnotationParams): Annotation {
    const a = this.annotations.addAnnotation(params, this.filePath);
    this.annotationRenderer.syncOverlays(this.getAnnotations());
    return a;
  }

  deleteAnnotation(id: string): void {
    this.annotations.deleteAnnotation(id);
    this.annotationRenderer.syncOverlays(this.getAnnotations());
  }

  // ── 导航 ──────────────────────────────────────────────

  async navigate(target: NavigationTarget): Promise<void> {
    this._ensureReady();
    navigateFoliate(this.viewAdapter!.view, target);
  }
  async goToSection(index: number): Promise<void> {
    this._ensureReady();
    goToSection(this.viewAdapter!.view, index);
  }
  async goNext(): Promise<void> {
    this._ensureReady();
    goToNextPage(this.viewAdapter!.view);
  }
  async goPrev(): Promise<void> {
    this._ensureReady();
    goToPrevPage(this.viewAdapter!.view);
  }

  // ── 设置 ──────────────────────────────────────────────

  updateSettings(partial: Partial<ReaderSettings>): void {
    this.settings = { ...this.settings, ...partial };
    if (this.state === 'ready' && this.viewAdapter) {
      this._applySettings(partial).catch((err) => log.error('Failed to apply settings:', err));
    }
  }

  // ── 私有方法 ──────────────────────────────────────────

  private _buildCallbacks(): BookLoaderCallbacks {
    return {
      onOutlineLoaded: (items) => this.bus.emit('outline-loaded', { items }),
      onMetadataLoaded: (metadata) => this.bus.emit('metadata-loaded', { metadata }),
      onSectionChanged: (idx, total, label, canPrev, canNext, cfi) => {
        this.sectionInfo = {
          currentIndex: idx,
          totalSections: total,
          currentLabel: label,
          canGoPrev: canPrev,
          canGoNext: canNext,
        };
        this.bus.emit('section-changed', { section: { ...this.sectionInfo } });
        if (cfi) this.bus.emit('location-changed', { cfi, sectionIndex: idx });
      },
    };
  }

  private _runCleanupFns(): void {
    for (const fn of this.cleanupFns) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    this.cleanupFns = [];
  }

  private _ensureReady(): void {
    if (this.state !== 'ready')
      throw new Error(`Engine not ready (current state: '${this.state}')`);
  }

  private async _applySettings(partial: Partial<ReaderSettings>): Promise<void> {
    if (!this.viewAdapter) return;
    const view = this.viewAdapter.view;
    if (partial.flowMode) applyReaderFlowMode(view, partial.flowMode);
    if (partial.columnMode) applyColumnMode(view, partial.columnMode);
    if (partial.fontSize !== undefined) applyFontSize(view, partial.fontSize);
  }

  private _disableAndroidPatches(): void {
    try {
      disableAndroidPatches();
    } catch {
      /* ignore */
    }
  }
}
