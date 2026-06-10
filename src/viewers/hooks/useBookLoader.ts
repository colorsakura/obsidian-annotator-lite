import { useCallback, useEffect, useRef, useState } from 'react';
import { TFile } from 'obsidian';
import type { BookMetadata, OutlineItem } from '../../types/annotations';
import { useObsidianApp } from '../../hooks/useObsidianApp';
import { loadBookMetadata } from '../foliate/foliateBookMetadata';
import { applyReaderFlowMode, applyColumnMode, applyFontSize } from './useReaderSettings';
import { wrapSectionLoadForAndroid } from './useAndroidPatches';

type ReaderFlowMode = 'paginated' | 'scrolled';
type ColumnMode = 'single' | 'double';

export interface BookLoaderCallbacks {
  onOutlineLoaded?: (items: OutlineItem[]) => void;
  onBookMetadataLoaded?: (metadata: BookMetadata) => void;
  onSectionChanged?: (
    currentIndex: number,
    totalSections: number,
    currentLabel?: string,
    canGoPrev?: boolean,
    canGoNext?: boolean,
  ) => void;
}

export interface BookLoaderResult {
  view: HTMLElement | null;
  isLoaded: boolean;
}

/**
 * 加载书籍文件并创建 foliate-view 元素。
 *
 * 负责：读取二进制文件 → 创建 <foliate-view> → open() → 提取元数据 →
 * wrapSectionLoadForAndroid → 初始化 renderer。
 */
export function useBookLoader(
  containerRef: React.RefObject<HTMLDivElement | null>,
  file: string,
  options: {
    flowMode: ReaderFlowMode;
    columnMode: ColumnMode;
    fontSize: number;
  },
  callbacks: BookLoaderCallbacks,
): BookLoaderResult {
  const app = useObsidianApp();
  const viewRef = useRef<HTMLElement | null>(null);
  const loadedFileRef = useRef<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const loadingRef = useRef(false);
  const coverUrlRef = useRef<string | null>(null);

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Create <foliate-view> element (lazy, created once)
  const getView = useCallback((): HTMLElement | null => {
    if (viewRef.current) return viewRef.current;
    const el = document.createElement('foliate-view') as HTMLElement;
    Object.assign(el.style, {
      width: '100%',
      height: '100%',
      minHeight: '300px',
      display: 'block',
    });
    viewRef.current = el;
    return viewRef.current;
  }, []);

  // Load file
  useEffect(() => {
    if (!app || !file || loadingRef.current) return;
    if (loadedFileRef.current === file) return;

    const loadFile = async () => {
      loadingRef.current = true;
      setIsLoaded(false);

      const tfile = app.vault.getAbstractFileByPath(file);
      if (!(tfile instanceof TFile)) {
        loadingRef.current = false;
        return;
      }

      try {
        const data = await app.vault.readBinary(tfile as any);
        const view = getView();
        if (!view) {
          loadingRef.current = false;
          return;
        }

        // Mount view into container
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          containerRef.current.appendChild(view);
        }

        // Open the book
        const blob = new Blob([data]);
        const fileObj = new File([blob], tfile.name);
        const ext = tfile.name.split('.').pop()?.toLowerCase();

        if (ext === 'pdf') {
          const { makePDF } = await import('foliate-js/pdf.js');
          const book = await makePDF(fileObj);
          book.rendition.spread = optionsRef.current.columnMode === 'single' ? 'none' : undefined;
          await (view as any).open(book);
        } else {
          await (view as any).open(fileObj);
          applyReaderFlowMode(view, optionsRef.current.flowMode);
          applyColumnMode(view, optionsRef.current.columnMode);
          applyFontSize(view, optionsRef.current.fontSize);
        }

        // Extract TOC, cover, metadata
        const book = (view as any).book;
        if (book) {
          const { info, coverUrl: newCover } = await loadBookMetadata(book, coverUrlRef.current);
          coverUrlRef.current = newCover;

          callbacksRef.current.onOutlineLoaded?.(info.outline);
          callbacksRef.current.onBookMetadataLoaded?.(info.metadata);

          // Rewire section .load() to preload HTML for srcdoc injection
          if (book.sections) {
            await Promise.all(book.sections.map((s: any) => wrapSectionLoadForAndroid(s)));
          }

          if (info.totalSections > 0) {
            callbacksRef.current.onSectionChanged?.(0, info.totalSections);
          }
        }

        // Initialize renderer
        try {
          await (view as any).init({ showTextStart: true });
        } catch {
          try {
            await (view as any).goTo(0);
          } catch {
            /* ignore */
          }
        }

        loadedFileRef.current = file;
        setIsLoaded(true);
      } catch (err) {
        console.error('[annotator-lite] Failed to load file:', err);
      } finally {
        loadingRef.current = false;
      }
    };

    loadFile();
  }, [app, file, getView, containerRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (coverUrlRef.current) {
        URL.revokeObjectURL(coverUrlRef.current);
        coverUrlRef.current = null;
      }
      const view = viewRef.current;
      if (view) {
        try {
          (view as any).close?.();
        } catch {
          /* ignore */
        }
        viewRef.current = null;
        loadedFileRef.current = null;
      }
    };
  }, []);

  return {
    view: viewRef.current,
    isLoaded,
  };
}
