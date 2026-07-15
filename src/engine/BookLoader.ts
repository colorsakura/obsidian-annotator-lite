import { TFile, type App } from 'obsidian';
import type { BookMetadata, OutlineItem, Annotation } from '../types/annotations';
import type { ReaderFlowMode, ColumnMode } from '../constants';
import { createLogger } from '../utils/logger';
import { FoliateViewAdapter } from './FoliateViewAdapter';
import { openEpubBook, openPdfBook } from './bookFormats';

const log = createLogger('BookLoader');

/** 回调接口：BookLoader 在加载过程中通知调用方 */
export interface BookLoaderCallbacks {
  onOutlineLoaded: (items: OutlineItem[]) => void;
  onMetadataLoaded: (metadata: BookMetadata) => void;
  onSectionChanged: (
    idx: number,
    total: number,
    label?: string,
    canPrev?: boolean,
    canNext?: boolean,
    cfi?: string,
  ) => void;
}

/** load() 额外选项 */
export interface BookLoaderOptions {
  flowMode?: ReaderFlowMode;
  columnMode?: ColumnMode;
  fontSize?: number;
  getAnnotations?: () => Annotation[];
}

/** load() 返回值 */
export interface BookLoaderResult {
  viewAdapter: FoliateViewAdapter;
  fileType: 'pdf' | 'epub';
}

/**
 * 书籍加载管道。
 * 流程：check → register → create view → patches → open → metadata → sections → relocate → overlay → init
 */
export class BookLoader {
  async load(
    app: App,
    container: HTMLElement,
    filePath: string,
    fileType: 'pdf' | 'epub',
    callbacks: BookLoaderCallbacks,
    options?: BookLoaderOptions,
  ): Promise<BookLoaderResult> {
    const tfile = app.vault.getAbstractFileByPath(filePath);
    if (!(tfile instanceof TFile)) throw new Error('File not found');

    await import('foliate-js/view.js');
    if (fileType === 'pdf') await import('foliate-js/pdf.js');

    const viewAdapter = this._createView(container);
    let cleanupRelocate: (() => void) | undefined;
    let cleanupOverlay: (() => void) | undefined;
    let coverUrl: string | null = null;

    try {
      const data = await app.vault.readBinary(tfile as any);
      const { enableAndroidPatches } = await import('./androidPatches');
      enableAndroidPatches();

      const blob = new Blob([data]);
      const fileObj = new File([blob], tfile.name);
      if (fileType === 'pdf') {
        await openPdfBook(viewAdapter, fileObj, options?.columnMode);
      } else {
        await openEpubBook(viewAdapter, fileObj, options);
      }

      const { info, coverUrl: cUrl } = await this._extractMeta(viewAdapter, coverUrl);
      coverUrl = cUrl;
      callbacks.onOutlineLoaded(info.outline);
      callbacks.onMetadataLoaded(info.metadata);

      await this._wrapAndroidSections(viewAdapter);
      if (info.totalSections > 0) callbacks.onSectionChanged(0, info.totalSections);

      const { installRelocateListener } = await import('./foliateNavigation');
      cleanupRelocate = installRelocateListener(viewAdapter.view, callbacks.onSectionChanged);

      if (options?.getAnnotations) {
        const { installCreateOverlayListener } = await import('./foliateAnnotations');
        cleanupOverlay = installCreateOverlayListener(viewAdapter.view, options.getAnnotations);
      }

      await this._initView(viewAdapter);
      log.debug('book loaded:', tfile.name, 'type:', fileType, 'size:', data.byteLength);

      return { viewAdapter, fileType };
    } catch (err) {
      log.error('Failed to load file:', err);
      try {
        cleanupRelocate?.();
        cleanupOverlay?.();
        viewAdapter.close();
      } catch {
        /* ignore */
      }
      if (viewAdapter.view.parentNode) viewAdapter.view.parentNode.removeChild(viewAdapter.view);
      if (coverUrl) URL.revokeObjectURL(coverUrl);
      throw err;
    }
  }

  private _createView(container: HTMLElement): FoliateViewAdapter {
    const view = document.createElement('foliate-view') as HTMLElement;
    Object.assign(view.style, {
      width: '100%',
      height: '100%',
      minHeight: '300px',
      display: 'block',
    });
    container.innerHTML = '';
    container.appendChild(view);
    return new FoliateViewAdapter(view);
  }

  private async _extractMeta(
    viewAdapter: FoliateViewAdapter,
    existingCoverUrl: string | null,
  ): Promise<{
    info: { outline: OutlineItem[]; metadata: BookMetadata; totalSections: number };
    coverUrl: string | null;
  }> {
    const { loadBookMetadata } = await import('./foliateBookMetadata');
    const book = (viewAdapter.view as any).book;
    if (!book)
      return {
        info: {
          outline: [],
          metadata: { coverUrl: null, title: null, author: null },
          totalSections: 0,
        },
        coverUrl: null,
      };
    return loadBookMetadata(book, existingCoverUrl);
  }

  private async _wrapAndroidSections(viewAdapter: FoliateViewAdapter): Promise<void> {
    const book = (viewAdapter.view as any).book;
    if (!book?.sections) return;
    const { wrapSectionLoadForAndroid } = await import('./androidPatches');
    await Promise.all(book.sections.map((s: any) => wrapSectionLoadForAndroid(s)));
  }

  private async _initView(viewAdapter: FoliateViewAdapter): Promise<void> {
    try {
      await viewAdapter.init({ showTextStart: true });
    } catch {
      try {
        viewAdapter.goTo(0);
      } catch {
        /* ignore */
      }
    }
  }
}
