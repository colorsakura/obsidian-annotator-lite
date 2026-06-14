import type { ReaderFlowMode, ColumnMode } from '../constants';

type FoliateRendererElement = HTMLElement & {
  setStyles?: (styles: string | string[]) => void;
};
type FoliateViewElement = HTMLElement & {
  renderer?: FoliateRendererElement;
  isFixedLayout?: boolean;
};

/**
 * 应用阅读模式（分页/滚动）到 foliate-view 的 renderer。
 * 仅对 EPUB reflowable 生效；PDF fixed-layout 和非 paginator 元素忽略。
 */
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

/**
 * 应用分栏模式（单列/双列）到 foliate-view。
 * EPUB reflowable 使用 CSS multi-column；PDF fixed-layout 通过 rendition.spread 控制。
 */
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

/**
 * 应用字体大小到 foliate-view 的 renderer。
 * 仅对 EPUB reflowable（paginator）生效。
 */
export function applyFontSize(view: HTMLElement, fontSize: number): void {
  const { renderer } = view as FoliateViewElement;
  if (!renderer || renderer.tagName.toLowerCase() !== 'foliate-paginator') return;

  renderer.setStyles?.(`html { font-size: ${fontSize}% !important; }`);
}

/** PDF 双列/单列切换：关闭后重新打开书籍以应用 rendition.spread */
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
