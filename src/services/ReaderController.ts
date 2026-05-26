import { App, MarkdownView, TFile, type WorkspaceLeaf } from 'obsidian';
import type { AnnotatorLiteSettings } from '../settings';
import type { Annotation, BookMetadata, NavigationTarget, OutlineItem } from '../types/annotations';
import type { AnnotationIndexService } from '../datacore';
import type { AnnotationRepository } from './AnnotationRepository';
import type { ReaderSectionState, ReaderSessionStore } from './ReaderSessionStore';
import type { TargetResolver } from './TargetResolver';
import type { ViewCoordinator } from './ViewCoordinator';

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

export class DefaultReaderController implements ReaderController {
  private currentReaderSourcePath: string | null = null;
  private persistInProgress = false;
  /** Unsubscribe from session store when session ends. */
  private unsubscribeSession: (() => void) | null = null;
  /** Whether callbacks for outline/annotations view have been wired. */
  private outlineCallbacksWired = false;
  private annotationsCallbacksWired = false;

  constructor(
    private app: App,
    private settingsProvider: () => AnnotatorLiteSettings,
    private targetResolver: TargetResolver,
    private annotationRepository: AnnotationRepository,
    private sessionStore: ReaderSessionStore,
    private viewCoordinator: ViewCoordinator,
    private annotationIndex: AnnotationIndexService,
  ) {}

  async openFromMarkdownLeaf(leaf: WorkspaceLeaf): Promise<void> {
    if (!(leaf.view instanceof MarkdownView)) return;

    const sourceFile = leaf.view.file;
    if (!sourceFile) return;

    await this.openFromSourceFile(sourceFile);
  }

  async openFromSourceFile(
    sourceFile: TFile,
    initialNavigationTarget?: NavigationTarget | null,
  ): Promise<void> {
    const target = this.targetResolver.resolve(sourceFile);
    if (!target) return;

    let annotations: Annotation[] = [];
    try {
      annotations = await this.annotationRepository.load(sourceFile, target.targetUri);
    } catch (e) {
      console.warn('[Annotator Lite] 加载标注数据失败:', e);
    }

    // Start session (clears previous session + subscribe cleanup)
    // target.type may be null for unsupported types; but target is only returned
    // if resolved successfully, so it should always be a valid type here.
    if (!target.type) return;
    this.sessionStore.startSession({ ...target, type: target.type }, annotations);
    this.currentReaderSourcePath = target.sourcePath;

    // Subscribe to session changes and push to views
    this.startSessionSync();

    const readerView = await this.viewCoordinator.openReader();
    if (!readerView) return;

    readerView.setSettings(this.settingsProvider());
    readerView.setTargetFile(
      target.targetPath,
      target.sourcePath,
      annotations,
      initialNavigationTarget,
    );
    readerView.setOnOutlineLoaded((items) => {
      this.sessionStore.setOutline(items);
    });
    readerView.setOnBookMetadataLoaded((metadata) => {
      this.sessionStore.setMetadata(metadata);
    });
    readerView.setOnSectionChanged((section) => {
      this.sessionStore.setSection(section);
    });
    readerView.setOnAnnotationsChanged((changedAnnotations) => {
      this.handleAnnotationsChanged(changedAnnotations);
    });
    readerView.setOnClose(() => {
      this.closeCurrentSession();
    });
    readerView.setOnSwitchToOutline(() => {
      void this.toggleOutline();
    });
    readerView.setOnSwitchToAnnotations(() => {
      void this.toggleAnnotations();
    });
  }

  closeCurrentSession(): void {
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    this.viewCoordinator.closeCompanionViews();
    this.currentReaderSourcePath = null;
    this.outlineCallbacksWired = false;
    this.annotationsCallbacksWired = false;
    this.sessionStore.clearSession();
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
    const outlineView = this.viewCoordinator.getOutlineView();
    if (!outlineView) return;

    // Wire callbacks once per session (toggle keeps the same view instance)
    if (!this.outlineCallbacksWired) {
      this.outlineCallbacksWired = true;
      outlineView.setOnNavigate((target) => {
        this.navigateToTarget(target);
      });
      outlineView.setOnSwitchToReader(() => {
        this.revealReader();
      });
    }

    // Push initial data from session
    const state = this.sessionStore.getSnapshot();
    if (state) {
      outlineView.setOutline(state.outline);
      if (state.metadata) {
        outlineView.setBookMetadata(state.metadata);
      }
    }
  }

  async toggleAnnotations(): Promise<void> {
    await this.viewCoordinator.toggleAnnotations();
    const annotationsView = this.viewCoordinator.getAnnotationsView();
    if (!annotationsView) return;

    // Wire callbacks once per session
    if (!this.annotationsCallbacksWired) {
      this.annotationsCallbacksWired = true;
      annotationsView.setOnNavigate((target) => {
        this.navigateToTarget(target);
      });
      annotationsView.setOnSwitchToReader(() => {
        this.revealReader();
      });
      annotationsView.setOnUpdateAnnotation((id, updates) => {
        void this.updateAnnotation(id, updates);
      });
      annotationsView.setOnDeleteAnnotation((id) => {
        void this.deleteAnnotation(id);
      });
    }

    // Push initial data from session
    const state = this.sessionStore.getSnapshot();
    if (state) {
      annotationsView.setAnnotations(state.annotations);
    }
  }

  navigateToTarget(target: NavigationTarget): void {
    this.sessionStore.setNavigationTarget(target);
    this.viewCoordinator.getReaderView()?.setNavigationTarget(target);
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
      annotations = await this.annotationRepository.load(sourceFile, null);
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

    // 如果阅读器不存在，或者阅读器存在但显示的是不同的书籍，都需要重新打开
    const needOpen =
      !this.viewCoordinator.getReaderView() || this.currentReaderSourcePath !== sourceFile.path;

    if (needOpen) {
      // 将导航目标作为初始目标传递，FoliateViewer 在 init() 后直接跳转，无闪现
      await this.openFromSourceFile(sourceFile, navTarget);
      return;
    }

    // 阅读器已打开且显示的是同一本书，直接导航
    if (this.currentReaderSourcePath === sourceFile.path) {
      this.sessionStore.setAnnotations(annotations);
    }
    this.navigateToTarget(navTarget);
    this.viewCoordinator.revealReader();
  }

  async updateAnnotation(id: string, updates: Partial<Annotation>): Promise<void> {
    const state = this.sessionStore.getSnapshot();
    if (!state || !this.currentReaderSourcePath) return;

    const idx = state.annotations.findIndex((a) => a.id === id);
    if (idx === -1) return;

    const updated = {
      ...state.annotations[idx],
      ...updates,
      updated: new Date().toISOString(),
    };
    const newAnnotations = [...state.annotations];
    newAnnotations[idx] = updated;

    await this.persistAnnotations(newAnnotations);
  }

  async deleteAnnotation(id: string): Promise<void> {
    if (!this.currentReaderSourcePath) return;

    const state = this.sessionStore.getSnapshot();
    if (!state) return;

    const newAnnotations = state.annotations.filter((a) => a.id !== id);
    await this.persistAnnotations(newAnnotations);
  }

  private handleAnnotationsChanged(changedAnnotations: Annotation[]): void {
    if (this.persistInProgress) return;

    const state = this.sessionStore.getSnapshot();
    if (!state) return;

    const oldAnnotations = state.annotations;
    const hasChanged =
      changedAnnotations.length !== oldAnnotations.length ||
      changedAnnotations.some(
        (a, i) => a.id !== oldAnnotations[i]?.id || a.text !== oldAnnotations[i]?.text,
      );

    if (!hasChanged) return;

    this.sessionStore.setAnnotations(changedAnnotations);
    void this.persistAnnotations(changedAnnotations);
  }

  /**
   * Subscribe session store → push state to side-panel views.
   * Called once when session starts; cleanup on session close.
   */
  private startSessionSync(): void {
    this.unsubscribeSession?.();
    this.unsubscribeSession = this.sessionStore.subscribe((state) => {
      if (!state) return;

      // Push to already-open views (if toggled)
      const outlineView = this.viewCoordinator.getOutlineView();
      if (outlineView) {
        outlineView.setOutline(state.outline);
        if (state.metadata) {
          outlineView.setBookMetadata(state.metadata);
        }
      }

      const annotationsView = this.viewCoordinator.getAnnotationsView();
      if (annotationsView) {
        annotationsView.setAnnotations(state.annotations);
      }
    });
  }

  private async persistAnnotations(annotations: Annotation[]): Promise<void> {
    if (!this.currentReaderSourcePath) {
      this.sessionStore.setAnnotations(annotations);
      return;
    }

    this.persistInProgress = true;

    try {
      const file = this.app.vault.getAbstractFileByPath(this.currentReaderSourcePath);
      if (!(file instanceof TFile)) {
        this.sessionStore.setAnnotations(annotations);
        return;
      }

      await this.annotationRepository.save(file, annotations);
      this.sessionStore.setAnnotations(annotations);
      this.annotationIndex.rebuildIndex(this.currentReaderSourcePath, annotations);
      this.viewCoordinator.getReaderView()?.setExternalAnnotations(annotations);
    } catch (e) {
      console.error('Failed to persist annotations:', e);
    } finally {
      this.persistInProgress = false;
    }
  }
}
