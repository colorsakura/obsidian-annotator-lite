import { App, MarkdownView, TFile, type WorkspaceLeaf } from 'obsidian';
import type { Annotation, Bookmark, NavigationTarget } from '../types/annotations';
import type { AnnotationService } from './AnnotationService';
import type { ReaderEventBus } from './ReaderEventBus';
import type { ReaderSessionStore } from './ReaderSessionStore';
import type { ReaderAPI } from './ReaderAPI';
import type { TargetResolver } from './TargetResolver';
import type { ViewCoordinator } from './ViewCoordinator';
import type { QueryClient } from '@tanstack/react-query';
import { annotationKeys } from '../hooks/useAnnotations';
import type { HighlightColor } from '../constants';
import { ANNOTATOR_ID_PROPERTY } from '../constants';
import type { AnnotatorLiteSettings } from './Settings';
import type { ReadingHistoryService } from './ReadingHistoryService';
import type { BookmarkService } from './BookmarkService';
import { ensureFrontmatterId } from '../utils/frontmatter';
import { createLogger } from '../utils/logger';

const log = createLogger('ReaderController');

export interface ReaderController {
  openFromMarkdownLeaf(leaf: WorkspaceLeaf): Promise<void>;
  openFromSourceFile(sourceFile: TFile): Promise<void>;

  closeCurrentSession(): void;

  revealReader(): void;
  toggleOutline(): Promise<void>;
  toggleAnnotations(): Promise<void>;

  navigateToTarget(target: NavigationTarget): void;
  navigateToAnnotation(annotationId: string): Promise<void>;

  addAnnotation(annotation: Annotation): Promise<void>;
  updateAnnotation(id: string, updates: Partial<Annotation>): Promise<void>;
  deleteAnnotation(id: string): Promise<void>;

  addBookmark(cfiRange: string, title: string, pageLabel?: string): Promise<void>;
  addCurrentBookmark(): Promise<void>;
  deleteBookmark(id: string): Promise<void>;
  updateBookmark(id: string, updates: Partial<Bookmark>): Promise<void>;
  getBookmarks(): Bookmark[];
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
  /** 持久化操作串行队列：防止并发的 vault.process 互相覆盖 */
  private persistQueue: Promise<void> = Promise.resolve();
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
    private bookmarkService: BookmarkService,
    private getFrontmatter: (file: TFile, key: string) => unknown,
    private queryClient: QueryClient,
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
    const startTime = performance.now();
    const target = this.targetResolver.resolve(sourceFile);
    if (!target) return;

    log.debug('openFromSourceFile:', {
      sourcePath: sourceFile.path,
      targetPath: target.targetPath,
      type: target.type,
    });

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
      log.warn('加载标注数据失败:', e);
    }

    if (!target.type) return;

    // 将标注数据预热到 QueryClient 缓存
    if (target.sourcePath) {
      this.queryClient.setQueryData(annotationKeys.byFile(target.sourcePath), annotations);
    }

    // Start session with id
    this.sessionStore.startSession({ ...target, type: target.type, id });

    // 加载持久化的书签
    try {
      const bookmarks = await this.bookmarkService.getBookmarks(id);
      this.sessionStore.setBookmarks(bookmarks);
    } catch (e) {
      log.warn('加载书签数据失败:', e);
    }

    // Set navigation target in the store
    if (navigationTarget) {
      this.sessionStore.setNavigationTarget(navigationTarget);
    }

    this.currentReaderSourcePath = target.sourcePath;

    const readerView = await this.viewCoordinator.openReader(targetLeaf);
    if (!readerView) return;

    log.debug(
      'Reader opened in',
      Math.round(performance.now() - startTime),
      'ms, annotations:',
      annotations.length,
    );

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

    // 清理 QueryClient 缓存（避免内存泄漏）
    if (this.currentReaderSourcePath) {
      this.queryClient.removeQueries({
        queryKey: annotationKeys.byFile(this.currentReaderSourcePath),
      });
    }

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
    this.bus.on('view:session-close', () => {
      this.closeCurrentSession();
    });
    // 监听位置变化
    this.bus.on('view:location-changed', ({ cfi }) => {
      this.lastKnownCfi = cfi;
    });
    // 监听书签事件
    this.bus.on('view:bookmark-add', ({ cfiRange, title, pageLabel }) => {
      void this.addBookmark(cfiRange, title, pageLabel);
    });
    this.bus.on('view:bookmark-delete', ({ id }) => {
      void this.deleteBookmark(id);
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
      log.warn('无法获取当前 Markdown 视图');
      return;
    }
    const sourceFile = activeView.file;

    let annotations: Annotation[] = [];
    try {
      annotations = await this.annotationService.load(sourceFile, null);
    } catch (e) {
      log.warn('加载标注数据失败:', e);
      return;
    }

    const annotation = annotations.find((a) => a.id === annotationId);
    if (!annotation) {
      log.warn('未找到标注:', annotationId);
      return;
    }
    if (!annotation.cfiRange) {
      log.warn('标注缺少 cfiRange:', annotationId);
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
    // 更新 QueryClient 缓存
    this.queryClient.setQueryData(annotationKeys.byFile(sourceFile.path), annotations);
    this.navigateToTarget(navTarget);
    this.viewCoordinator.revealReader();
  }

  /** 将持久化操作加入串行队列，防止并发的 vault.process 互相覆盖 */
  private enqueuePersist<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.persistQueue = this.persistQueue.then(async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  async addAnnotation(annotation: Annotation): Promise<void> {
    if (!this.currentReaderSourcePath) return;
    return this.enqueuePersist(async () => {
      const key = annotationKeys.byFile(this.currentReaderSourcePath!);
      const current = this.queryClient.getQueryData<Annotation[]>(key) ?? [];
      // 幂等：如果乐观写已经加过了，不重复添加
      const exists = current.some((a) => a.id === annotation.id);
      const next = exists ? current : [...current, annotation];
      await this.annotationService.persist(next, this.currentReaderSourcePath!);
    });
  }

  async updateAnnotation(id: string, updates: Partial<Annotation>): Promise<void> {
    if (!this.currentReaderSourcePath) return;
    return this.enqueuePersist(async () => {
      const key = annotationKeys.byFile(this.currentReaderSourcePath!);
      const current = this.queryClient.getQueryData<Annotation[]>(key) ?? [];
      const idx = current.findIndex((a) => a.id === id);
      if (idx === -1) return;
      const next = [...current];
      next[idx] = { ...next[idx], ...updates, updated: new Date().toISOString() };
      await this.annotationService.persist(next, this.currentReaderSourcePath!);
    });
  }

  async deleteAnnotation(id: string): Promise<void> {
    if (!this.currentReaderSourcePath) return;
    return this.enqueuePersist(async () => {
      const key = annotationKeys.byFile(this.currentReaderSourcePath!);
      const current = this.queryClient.getQueryData<Annotation[]>(key) ?? [];
      const next = current.filter((a) => a.id !== id);
      await this.annotationService.persist(next, this.currentReaderSourcePath!);
    });
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
      log.warn('保存阅读进度失败:', e);
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

  // ─── 书签操作 ───────────────────────────────────────────────────────

  async addBookmark(cfiRange: string, title: string, pageLabel?: string): Promise<void> {
    const state = this.sessionStore.getSnapshot();
    if (!state?.target.id) return;

    const bookmark: Bookmark = {
      id: generateBookmarkId(),
      cfiRange,
      title,
      pageLabel,
      created: new Date().toISOString(),
    };

    // 先更新内存（即时 UI 响应）
    this.sessionStore.addBookmark(bookmark);

    // 异步持久化
    try {
      await this.bookmarkService.addBookmark(state.target.id, bookmark);
    } catch (e) {
      log.warn('持久化书签失败:', e);
    }
  }

  async addCurrentBookmark(): Promise<void> {
    if (!this.lastKnownCfi) {
      log.warn('无法添加书签：没有当前位置信息');
      return;
    }

    const state = this.sessionStore.getSnapshot();
    if (!state) return;

    // 使用当前章节标签作为书签标题
    const title = state.section.currentLabel || new Date().toLocaleString();
    const pageLabel =
      state.section.totalSections > 0
        ? `${state.section.currentIndex + 1} / ${state.section.totalSections}`
        : undefined;

    await this.addBookmark(this.lastKnownCfi, title, pageLabel);
  }

  async deleteBookmark(id: string): Promise<void> {
    const state = this.sessionStore.getSnapshot();
    if (!state?.target.id) return;

    this.sessionStore.deleteBookmark(id);

    try {
      await this.bookmarkService.deleteBookmark(state.target.id, id);
    } catch (e) {
      log.warn('删除书签失败:', e);
    }
  }

  async updateBookmark(id: string, updates: Partial<Bookmark>): Promise<void> {
    const state = this.sessionStore.getSnapshot();
    if (!state?.target.id) return;

    this.sessionStore.updateBookmark(id, updates);

    try {
      await this.bookmarkService.updateBookmark(state.target.id, id, updates);
    } catch (e) {
      log.warn('更新书签失败:', e);
    }
  }

  getBookmarks(): Bookmark[] {
    return this.sessionStore.getSnapshot()?.bookmarks ?? [];
  }
}

/** 生成书签 ID */
function generateBookmarkId(): string {
  return 'bm_' + Math.random().toString(36).substring(2);
}
