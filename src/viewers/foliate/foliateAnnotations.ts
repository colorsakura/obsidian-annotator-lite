import type { Annotation } from '../../types/annotations';
import { DEFAULT_HIGHLIGHT_COLOR } from '../../constants';

/**
 * 安装 create-overlay 事件处理（在 view.init() 之前调用，避免错过初始渲染事件）。
 * 当 foliate-js 渲染新页面时触发，为该页面的标注创建高亮 overlay。
 */
export function installCreateOverlayListener(
  view: HTMLElement,
  getAnnotations: () => Annotation[],
): () => void {
  const viewApi = view as any;

  const handleCreateOverlay = async ({ detail }: any) => {
    const { index } = detail;
    const annotations = getAnnotations();
    if (!annotations.length) return;

    for (const a of annotations) {
      if (!a.cfiRange) continue;
      try {
        const resolved = await viewApi.resolveNavigation(a.cfiRange);
        if (resolved && resolved.index === index) {
          await viewApi.addAnnotation({
            value: a.cfiRange,
            text:
              (a.target?.[0]?.selector?.find((s) => s.type === 'TextQuoteSelector') as any)
                ?.exact || '',
            color: a.color || DEFAULT_HIGHLIGHT_COLOR,
          });
        }
      } catch {
        // skip
      }
    }
  };

  view.addEventListener('create-overlay', handleCreateOverlay);
  return () => {
    view.removeEventListener('create-overlay', handleCreateOverlay);
  };
}

/**
 * Install draw-annotation event handler on a foliate-view element.
 * Returns a cleanup function that removes the listener.
 */
export function installAnnotationRendering(view: HTMLElement): () => void {
  const handleDrawAnnotation = async ({ detail }: any) => {
    const { draw, annotation } = detail;
    const color = annotation.color || DEFAULT_HIGHLIGHT_COLOR;
    const { Overlayer } = await import('foliate-js/overlayer.js');
    draw(Overlayer.highlight, { color });
  };

  // Clean up any previous listener
  const prevDraw = (view as any)._drawListener;
  if (prevDraw) view.removeEventListener('draw-annotation', prevDraw);

  view.addEventListener('draw-annotation', handleDrawAnnotation);
  (view as any)._drawListener = handleDrawAnnotation;

  return () => {
    view.removeEventListener('draw-annotation', handleDrawAnnotation);
    delete (view as any)._drawListener;
  };
}

/**
 * Apply annotation overlays that haven't been applied yet.
 * Uses appliedMap to track which annotations have already been added (id → cfiRange).
 * Also removes overlays for annotations that are no longer in the list.
 */
export async function applyAnnotationOverlays(
  view: HTMLElement,
  annotations: Annotation[],
  appliedMap: Map<string, string>,
): Promise<void> {
  const viewApi = view as any;

  // Build a set of current annotation IDs for quick lookup
  const currentIds = new Set(annotations.map((a) => a.id));

  // Remove overlays for annotations that were applied but are no longer present
  for (const [id, cfiRange] of appliedMap) {
    if (currentIds.has(id)) continue;
    try {
      await viewApi.deleteAnnotation({ value: cfiRange });
    } catch {
      // ignore removal errors
    }
    appliedMap.delete(id);
  }

  // Add new annotations
  for (const a of annotations) {
    if (!a.cfiRange || appliedMap.has(a.id)) continue;
    appliedMap.set(a.id, a.cfiRange);
    try {
      await viewApi.addAnnotation({
        value: a.cfiRange,
        text:
          (a.target?.[0]?.selector?.find((s) => s.type === 'TextQuoteSelector') as any)?.exact ||
          '',
        color: a.color || DEFAULT_HIGHLIGHT_COLOR,
      });
    } catch {
      // Annotation may not be renderable yet; remove from map so it gets retried
      appliedMap.delete(a.id);
    }
  }
}
