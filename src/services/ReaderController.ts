import { App, MarkdownView, TFile, type WorkspaceLeaf } from 'obsidian';
import type { Annotation, NavigationTarget } from '../types/annotations';
import type { AnnotationService } from './AnnotationService';
import type { ReaderEventBus } from './ReaderEventBus';
import type { ReaderSessionStore } from './ReaderSessionStore';
import type { ReaderAPI } from './ReaderAPI';
import type { TargetResolver } from './TargetResolver';
import type { ViewCoordinator } from './ViewCoordinator';
import type { HighlightColor } from '../constants';
import type { AnnotatorLiteSettings } from './Settings';

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

    let annotations: Annotation[] = [];
    try {
      annotations = await this.annotationService.load(sourceFile, target.targetUri);
    } catch (e) {
      console.warn('[Annotator Lite] 加载标注数据失败:', e);
    }

    if (!target.type) return;

    // Start session — this is the single state source; views subscribe via useSessionStore
    this.sessionStore.startSession({ ...target, type: target.type }, annotations);

    // Set initial navigation target in the store (for "show annotation" links)
    if (initialNavigationTarget) {
      this.sessionStore.setNavigationTarget(initialNavigationTarget);
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
  }

  closeCurrentSession(): void {
    this.viewCoordinator.closeCompanionViews();
    this.currentReaderSourcePath = null;
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
}
