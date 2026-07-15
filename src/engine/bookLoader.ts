import { TFile, type App } from 'obsidian';
import type { BookMetadata, OutlineItem, Annotation } from '../types/annotations';
import type { ReaderFlowMode, ColumnMode } from '../constants';
import { createLogger } from '../utils/logger';

const log = createLogger('BookLoader');

/** 回调接口：bookLoader 在加载过程中通知调用方 */
export interface BookLoaderCallbacks {
  onOutlineLoaded: (items: OutlineItem[]) => void;
  onMetadataLoaded: (metadata: BookMetadata) => void;
  onSectionChanged: (
    currentIndex: number,
    totalSections: number,
    currentLabel?: string,
    canGoPrev?: boolean,
    canGoNext?: boolean,
    cfi?: string,
  ) => void;
}

/** loadBook 额外选项 */
export interface BookLoaderOptions {
  flowMode?: ReaderFlowMode;
  columnMode?: ColumnMode;
  fontSize?: number;
  /** 标注查询回调：供 create-overlay 事件使用，在 view.init() 前安装 */
  getAnnotations?: () => Annotation[];
}

/** loadBook 返回值 */
export interface BookLoaderResult {
  view: HTMLElement;
  fileType: 'pdf' | 'epub';
}

/**
 * 从 vault 加载书籍文件并创建 foliate-view 元素。
 *
 * 流程：检查文件存在 → 读取二进制 → 创建 <foliate-view> → 启用 Android 补丁 →
 * open() → 应用设置 → 提取元数据 → wrapSectionLoadForAndroid → 安装 relocate 监听 →
 * 初始化 renderer。
 *
 * @param app Obsidian App 实例
 * @param container 挂载 foliate-view 的容器元素
 * @param filePath vault 中的文件路径
 * @param fileType 文件类型（'pdf' | 'epub'）
 * @param callbacks 加载过程中的回调
 * @param options 可选的阅读设置（flowMode、columnMode、fontSize）
 */
export async function loadBook(
  app: App,
  container: HTMLElement,
  filePath: string,
  fileType: 'pdf' | 'epub',
  callbacks: BookLoaderCallbacks,
  options?: BookLoaderOptions,
): Promise<BookLoaderResult> {
  // 1. 检查文件是否存在
  const tfile = app.vault.getAbstractFileByPath(filePath);
  if (!(tfile instanceof TFile)) {
    throw new Error('File not found');
  }

  // 2. 确保 foliate-js 自定义元素已注册（必须在 createElement 之前）
  // view.js 注册 <foliate-view> 自定义元素，PDF/EPUB 都需要
  await import('foliate-js/view.js');
  if (fileType === 'pdf') {
    await import('foliate-js/pdf.js');
  }

  // 3. 创建 <foliate-view> 元素
  const view = document.createElement('foliate-view') as HTMLElement;
  Object.assign(view.style, {
    width: '100%',
    height: '100%',
    minHeight: '300px',
    display: 'block',
  });
  container.innerHTML = '';
  container.appendChild(view);

  // relocate 监听清理函数
  let cleanupRelocate: (() => void) | undefined;
  // create-overlay 监听清理函数
  let cleanupOverlay: (() => void) | undefined;
  // cover URL 用于后续清理
  let coverUrl: string | null = null;

  try {
    // 3. 读取二进制文件
    const data = await app.vault.readBinary(tfile as any);

    // 4. 启用 Android 补丁（必须在 open() 之前，以拦截 blob URL 创建）
    const { enableAndroidPatches } = await import('./androidPatches');
    enableAndroidPatches();

    // 5. 打开书籍文件
    const blob = new Blob([data]);
    const fileObj = new File([blob], tfile.name);

    if (fileType === 'pdf') {
      const { makePDF } = await import('foliate-js/pdf.js'); // cache hit（上面已导入）
      const book = await makePDF(fileObj);
      book.rendition.spread = options?.columnMode === 'single' ? 'none' : undefined;
      await (view as any).open(book);
    } else {
      await (view as any).open(fileObj);

      // 6. 应用 EPUB 阅读设置
      if (options) {
        const { applyReaderFlowMode, applyColumnMode, applyFontSize } =
          await import('./readerSettings');
        if (options.flowMode) applyReaderFlowMode(view, options.flowMode);
        if (options.columnMode) applyColumnMode(view, options.columnMode);
        if (options.fontSize) applyFontSize(view, options.fontSize);
      }

      // 7. 应用主题
      const { applyTheme, isDarkMode } = await import('./theme');
      applyTheme(view, isDarkMode());
    }

    // 8. 提取元数据
    const book = (view as any).book;
    if (book) {
      const { loadBookMetadata } = await import('../viewers/foliate/foliateBookMetadata');
      const { info, coverUrl: newCover } = await loadBookMetadata(book, null);
      coverUrl = newCover;

      callbacks.onOutlineLoaded(info.outline);
      callbacks.onMetadataLoaded(info.metadata);

      // 9. 为 Android 包装 section.load()
      if (book.sections) {
        const { wrapSectionLoadForAndroid } = await import('./androidPatches');
        await Promise.all(book.sections.map((s: any) => wrapSectionLoadForAndroid(s)));
      }

      if (info.totalSections > 0) {
        callbacks.onSectionChanged(0, info.totalSections);
      }
    }

    // 10. 安装 relocate 监听
    const { installRelocateListener } = await import('../viewers/foliate/foliateNavigation');
    cleanupRelocate = installRelocateListener(view, callbacks.onSectionChanged);

    // 10.5. 安装 create-overlay 监听（在 view.init() 之前，避免错过初始渲染事件）
    if (options?.getAnnotations) {
      const { installCreateOverlayListener } = await import(
        '../viewers/foliate/foliateAnnotations'
      );
      cleanupOverlay = installCreateOverlayListener(view, options.getAnnotations);
    }

    // 11. 初始化 renderer
    try {
      await (view as any).init({ showTextStart: true });
    } catch {
      try {
        await (view as any).goTo(0);
      } catch {
        /* ignore */
      }
    }

    log.debug('book loaded:', tfile.name, 'type:', fileType, 'size:', data.byteLength, 'bytes');

    return { view, fileType };
  } catch (err) {
    // 失败时清理 view
    log.error('Failed to load file:', err);
    try {
      cleanupRelocate?.();
      cleanupOverlay?.();
      (view as any).close?.();
    } catch {
      /* ignore cleanup errors */
    }
    if (view.parentNode) {
      view.parentNode.removeChild(view);
    }
    if (coverUrl) {
      URL.revokeObjectURL(coverUrl);
    }
    throw err;
  }
}
