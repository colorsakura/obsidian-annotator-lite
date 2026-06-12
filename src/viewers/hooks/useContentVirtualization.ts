import { useEffect, useRef } from 'react';

/**
 * 为滚动模式下的 foliate-js iframe 注入 CSS `content-visibility: auto`。
 *
 * 原理：foliate-js 滚动模式将整个章节渲染进单个 iframe。
 * 当容器 resize（侧边栏开关、窗口缩放）时，`expand()` 调用
 * `documentElement.getBoundingClientRect()` 强制浏览器对整个 DOM 树做同步布局。
 * 对于长章节（数千 DOM 节点），每次 reflow 都很昂贵。
 *
 * `content-visibility: auto` 让浏览器跳过屏幕外元素的 layout 和 paint，
 * 使 reflow 成本从 O(全部 DOM) 降到 O(可见区域)。
 * `contain-intrinsic-size: auto 200px` 为屏幕外元素提供合理尺寸估算，
 * 保证 `getBoundingClientRect()` 仍能返回正确的文档总高度。
 */

/** 需要虚拟化的块级元素选择器 */
const BLOCK_SELECTOR = [
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'ul', 'ol', 'li', 'table', 'figure', 'figcaption',
  'pre', 'hr', 'address', 'article', 'section', 'aside', 'details', 'summary',
  'dd', 'dl', 'dt', 'fieldset', 'form', 'footer', 'header', 'main', 'nav',
].join(', ');

const VIRTUALIZATION_CSS = `${BLOCK_SELECTOR} {
  content-visibility: auto;
  contain-intrinsic-size: auto 200px;
}`;

/** 已注入 CSS 的 document 集合，避免重复注入 */
const patchedDocs = new WeakSet<Document>();

/**
 * 向 iframe document 注入虚拟化 CSS（幂等）。
 */
function injectVirtualizationCSS(doc: Document): void {
  if (patchedDocs.has(doc)) return;
  patchedDocs.add(doc);
  const style = doc.createElement('style');
  style.textContent = VIRTUALIZATION_CSS;
  doc.head?.appendChild(style);
}

/**
 * Patch foliate-view 的 renderer，在每次 render 前注入 content-visibility CSS。
 * 只在滚动模式下生效。
 */
function patchRenderer(renderer: HTMLElement & { render(): void; scrolled?: boolean }): void {
  const originalRender = renderer.render;
  if (typeof originalRender !== 'function') return;

  renderer.render = function (this: typeof renderer) {
    // 仅在滚动模式下注入（分页模式不需要，CSS columns 自然限制渲染范围）
    if (this.getAttribute('flow') === 'scrolled') {
      try {
        const contents = (this as any).getContents?.();
        const doc = contents?.[0]?.doc as Document | undefined;
        if (doc) injectVirtualizationCSS(doc);
      } catch {
        // getContents 可能在 renderer 未就绪时抛出，忽略即可
      }
    }
    return originalRender.call(this);
  } as typeof originalRender;
}

/**
 * React hook：为 foliate-view 的滚动模式启用 content-visibility 虚拟化。
 *
 * 在书籍加载完成后 patch renderer 的 render() 方法。
 * 后续每次 render（包括 resize 触发的 reflow）都会自动注入 CSS，
 * 使浏览器跳过屏幕外内容的 layout/paint。
 */
export function useContentVirtualization(view: HTMLElement | null, isLoaded: boolean): void {
  const patchedRef = useRef(false);

  useEffect(() => {
    if (!view || !isLoaded || patchedRef.current) return;

    const renderer = (view as any).renderer as
      | (HTMLElement & { render(): void })
      | undefined;
    if (!renderer || typeof renderer.render !== 'function') return;

    patchRenderer(renderer);
    patchedRef.current = true;
  }, [view, isLoaded]);
}
