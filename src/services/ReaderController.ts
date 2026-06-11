import { App, MarkdownView, TFile, type WorkspaceLeaf } from 'obsidian';
import type { Annotation, NavigationTarget } from '../types/annotations';
import type { AnnotationService } from './AnnotationService';
import type { ReaderEventBus } from './ReaderEventBus';
import type { ReaderSessionStore } from './ReaderSessionStore';
import type { ReaderAPI } from './ReaderAPI';
import type { TargetResolver } from './TargetResolver';
import type { ViewCoordinator } from './ViewCoordinator';
import type { HighlightColor } from '../constants';
import { ANNOTATOR_ID_PROPERTY } from '../constants';
import type { AnnotatorLiteSettings } from './Settings';
import type { ReadingHistoryService } from './ReadingHistoryService';
import { ensureFrontmatterId } from '../utils/frontmatter';

export interface ReaderController {
  openFromMarkdownLeaf(leaf: WorkspaceLeaf): Promise<void>;
  openFromSourceFile(sourceFile: TFile): Promise<void>;

  closeCurrentSession(): void;

  revealReader(): void;
  toggleOutline(): Promise<void>;
  toggleAnnotations(): Promise<void>;

  navigateToTarget(target: NavigationTarget): void;
  navigateToAnnotation(annotationId: string): Promise<void>;

  updateAnnotation(id: string, updates: Partial<Annotation>): Promise<void>;
  deleteAnnotation(id: string): Promise<void>;
}

/**
 * 阅读器控制器（瘦协调器）。
 *
 * 职责：
 * - 开关阅读会话（SessionStore.startSession / clearSession）
 * - 打开/切换视图（ViewCoordinator）
 * - 路由用户操作到 AnnotationService
 *
 * 数据同步：View 通过 useSessionStore() 直接订阅 SessionStore，
 * 不再需要 Controller 手动推送。
 */
export class DefaultReaderController implements ReaderController, ReaderAPI {
  private currentReaderSourcePath: string | null = null;
  private lastKnownCfi: string | null = null;
  private saveInterval: ReturnType<typeof setInterval> | null = null;
  readonly bus: ReaderEventBus;

  constructor(
    private app: App,
    private targetResolver: TargetResolver,
    private annotationService: AnnotationService,
    private sessionStore: ReaderSessionStore,
    private viewCoordinator: ViewCoordinator,
    bus: ReaderEventBus,
    private getHighlightColors: () => HighlightColor[],
    private getSettings: () => AnnotatorLiteSettings,
    private historyService: ReadingHistoryService,
    private getFrontmatter: (file: TFile, key: string) => unknown,
  ) {
    this.bus = bus;
  }

  async openFromMarkdownLeaf(leaf: WorkspaceLeaf): Promise<void> {
    if (!(leaf.view instanceof MarkdownView)) return;

    const sourceFile = leaf.view.file;
    if (!sourceFile) return;

    await this.openFromSourceFile(sourceFile, null, leaf);
  }

  async openFromSourceFile(
    sourceFile: TFile,
    initialNavigationTarget?: NavigationTarget | null,
    targetLeaf?: WorkspaceLeaf,
  ): Promise<void> {
    const target = this.targetResolver.resolve(sourceFile);
    if (!target) return;

    // 确保 frontmatter 有 id
    const existingId = this.getFrontmatter(sourceFile, ANNOTATOR_ID_PROPERTY) as string | null;
    const id = await ensureFrontmatterId(this.app.vault, sourceFile, existingId);

    // 读取历史记录
    let navigationTarget = initialNavigationTarget ?? null;
    if (!navigationTarget) {
      const record = await this.historyService.getRecord(id);
      if (record?.cfi) {
        navigationTarget = { href: record.cfi };
      }
    }

    let annotations: Annotation[] = [];
    try {
      annotations = await this.annotationService.load(sourceFile, target.targetUri);
    } catch (e) {
      console.warn('[Annotator Lite] 加载标注数据失败:', e);
    }

    if (!target.type) return;

    // Start session with id
    this.sessionStore.startSession({ ...target, type: target.type, id }, annotations);

    // Set navigation target in the store
    if (navigationTarget) {
      this.sessionStore.setNavigationTarget(navigationTarget);
    }

    this.currentReaderSourcePath = target.sourcePath;

    const readerView = await this.viewCoordinator.openReader(targetLeaf);
    if (!readerView) return;

    // Pass settings from plugin BEFORE setTargetFile (which resets to defaults)
    const settings = this.getSettings();
    readerView.highlightColors = this.getHighlightColors();
    readerView.defaultFlowMode = settings.defaultFlowMode;
    readerView.defaultColumnMode = settings.defaultColumnMode;
    readerView.defaultFontSize = settings.defaultFontSize;

    // Only pass file info — annotations/navigation come from the store
    readerView.setTargetFile(target.targetPath, target.sourcePath);

    // Wire view → controller events via bus
    this.wireViewEvents();

    // Start periodic save
    this.startPeriodicSave();
  }

  closeCurrentSession(): void {
    // 保存最终位置
    void this.saveReadingProgress();

    // 停止定期保存
    this.stopPeriodicSave();

    this.viewCoordinator.closeCompanionViews();
    this.currentReaderSourcePath = null;
    this.lastKnownCfi = null;
    this.sessionStore.clearSession();
    this.bus.clear();
  }

  closeSession(): void {
    this.closeCurrentSession();
  }

  private wireViewEvents(): void {
    this.bus.on('view:outline-loaded', ({ items }) => {
      this.sessionStore.setOutline(items);
    });
    this.bus.on('view:metadata-loaded', ({ metadata }) => {
      this.sessionStore.setMetadata(metadata);
    });
    this.bus.on('view:section-changed', ({ section }) => {
      this.sessionStore.setSection(section);
    });
    this.bus.on('view:annotations-changed', ({ annotations }) => {
      this.annotationService.handleUserAnnotationsChanged(
        annotations,
        this.currentReaderSourcePath,
      );
    });
    this.bus.on('view:session-close', () => {
      this.closeCurrentSession();
    });
    // 监听位置变化
    this.bus.on('view:location-changed', ({ cfi }) => {
      this.lastKnownCfi = cfi;
    });
  }

  revealReader(): void {
    if (this.viewCoordinator.getReaderView()) {
      this.viewCoordinator.revealReader();
      return;
    }

    const activeLeaf = this.app.workspace.activeLeaf;
    if (activeLeaf?.view instanceof MarkdownView) {
      void this.openFromMarkdownLeaf(activeLeaf);
    }
  }

  async toggleOutline(): Promise<void> {
    await this.viewCoordinator.toggleOutline();
  }

  async toggleAnnotations(): Promise<void> {
    await this.viewCoordinator.toggleAnnotations();
  }

  async saveProgress(): Promise<void> {
    await this.saveReadingProgress();
  }

  navigateToTarget(target: NavigationTarget): void {
    this.sessionStore.setNavigationTarget(target);
  }

  async navigateToAnnotation(annotationId: string): Promise<void> {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView?.file) {
      console.warn('[Annotator Lite] 无法获取当前 Markdown 视图');
      return;
    }
    const sourceFile = activeView.file;

    let annotations: Annotation[] = [];
    try {
      annotations = await this.annotationService.load(sourceFile, null);
    } catch (e) {
      console.warn('[Annotator Lite] 加载标注数据失败:', e);
      return;
    }

    const annotation = annotations.find((a) => a.id === annotationId);
    if (!annotation) {
      console.warn('[Annotator Lite] 未找到标注:', annotationId);
      return;
    }
    if (!annotation.cfiRange) {
      console.warn('[Annotator Lite] 标注缺少 cfiRange:', annotationId);
      return;
    }

    const navTarget: NavigationTarget = { href: annotation.cfiRange };

    const needOpen =
      !this.viewCoordinator.getReaderView() || this.currentReaderSourcePath !== sourceFile.path;

    if (needOpen) {
      await this.openFromSourceFile(sourceFile, navTarget, activeView.leaf);
      return;
    }

    // Reader is open with the same book — just navigate
    this.sessionStore.setAnnotations(annotations);
    this.navigateToTarget(navTarget);
    this.viewCoordinator.revealReader();
  }

  async updateAnnotation(id: string, updates: Partial<Annotation>): Promise<void> {
    if (!this.currentReaderSourcePath) return;
    await this.annotationService.update(id, updates, this.currentReaderSourcePath);
  }

  async deleteAnnotation(id: string): Promise<void> {
    if (!this.currentReaderSourcePath) return;
    await this.annotationService.delete(id, this.currentReaderSourcePath);
  }

  private async saveReadingProgress(): Promise<void> {
    const state = this.sessionStore.getSnapshot();
    if (!state || !this.lastKnownCfi || !state.target.id) return;

    const { target, section } = state;
    const id = state.target.id;

    try {
      await this.historyService.saveRecord(id, {
        cfi: this.lastKnownCfi,
        sectionIndex: section.currentIndex,
        lastReadAt: new Date().toISOString(),
        readingTime: 0,
        targetFileName: target.targetPath.split('/').pop() ?? target.targetPath,
      });
    } catch (e) {
      console.warn('[Annotator Lite] 保存阅读进度失败:', e);
    }
  }

  private startPeriodicSave(): void {
    this.stopPeriodicSave();
    this.saveInterval = setInterval(() => {
      void this.saveReadingProgress();
    }, 30000);
  }

  private stopPeriodicSave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
  }
}
