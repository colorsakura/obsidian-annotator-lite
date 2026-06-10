import { useEffect } from 'react';
import type { ReaderFlowMode, ColumnMode } from '../../constants';

type FoliateRendererElement = HTMLElement & {
  setStyles?: (styles: string | string[]) => void;
};
type FoliateViewElement = HTMLElement & {
  renderer?: FoliateRendererElement;
  isFixedLayout?: boolean;
};

export function applyReaderFlowMode(view: HTMLElement, flowMode: ReaderFlowMode): void {
  const { renderer, isFixedLayout } = view as FoliateViewElement;
  if (!renderer || isFixedLayout || renderer.tagName.toLowerCase() !== 'foliate-paginator') {
    return;
  }

  if (flowMode === 'scrolled') {
    renderer.setAttribute('flow', 'scrolled');
  } else {
    renderer.removeAttribute('flow');
  }
}

export function applyColumnMode(view: HTMLElement, columnMode: ColumnMode): void {
  const { renderer } = view as FoliateViewElement;
  if (!renderer) return;

  const tagName = renderer.tagName.toLowerCase();

  // EPUB reflowable — use CSS multi-column
  if (tagName === 'foliate-paginator') {
    if (columnMode === 'single') {
      renderer.setAttribute('max-column-count', '1');
    } else {
      renderer.removeAttribute('max-column-count');
    }
    return;
  }

  // PDF fixed-layout — control page spread via book rendition
  if (tagName === 'foliate-fxl') {
    void reopenPdfWithSpread(view, columnMode);
  }
}

export function applyFontSize(view: HTMLElement, fontSize: number): void {
  const { renderer } = view as FoliateViewElement;
  if (!renderer || renderer.tagName.toLowerCase() !== 'foliate-paginator') return;

  renderer.setStyles?.(`html { font-size: ${fontSize}% !important; }`);
}

async function reopenPdfWithSpread(view: HTMLElement, columnMode: ColumnMode): Promise<void> {
  const v = view as any;
  if (!v.book) return;

  const lastLocation = v.lastLocation;

  v.book.rendition = v.book.rendition || {};
  v.book.rendition.spread = columnMode === 'single' ? 'none' : undefined;

  v.close();
  await v.open(v.book);

  if (lastLocation) {
    try {
      await v.init({ lastLocation });
    } catch {
      await v.init({ showTextStart: true }).catch(() => {});
    }
  } else {
    await v.init({ showTextStart: true }).catch(() => {});
  }
}

// ─── React hooks ──────────────────────────────────────────────────────────

/**
 * 应用阅读模式（分页/滚动）设置。
 */
export function useFlowMode(
  view: HTMLElement | null,
  loaded: boolean,
  flowMode: ReaderFlowMode,
): void {
  useEffect(() => {
    if (!view || !loaded) return;
    applyReaderFlowMode(view, flowMode);
  }, [view, loaded, flowMode]);
}

/**
 * 应用分栏模式（单列/双列）设置。
 */
export function useColumnMode(
  view: HTMLElement | null,
  loaded: boolean,
  columnMode: ColumnMode,
): void {
  useEffect(() => {
    if (!view || !loaded) return;
    applyColumnMode(view, columnMode);
  }, [view, loaded, columnMode]);
}

/**
 * 应用字体大小设置。
 */
export function useFontSize(view: HTMLElement | null, loaded: boolean, fontSize: number): void {
  useEffect(() => {
    if (!view || !loaded) return;
    applyFontSize(view, fontSize);
  }, [view, loaded, fontSize]);
}
