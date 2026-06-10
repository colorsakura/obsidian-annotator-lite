import type { Annotation } from '../../types/annotations';
import { DEFAULT_HIGHLIGHT_COLOR } from '../../constants';

/**
 * Install draw-annotation and create-overlay event handlers on a foliate-view element.
 * Returns a cleanup function that removes the listeners.
 */
export function installAnnotationRendering(
  view: HTMLElement,
  getAnnotations: () => Annotation[],
): () => void {
  const viewApi = view as any;

  const handleDrawAnnotation = async ({ detail }: any) => {
    const { draw, annotation } = detail;
    const color = annotation.color || DEFAULT_HIGHLIGHT_COLOR;
    const { Overlayer } = await import('foliate-js/overlayer.js');
    draw(Overlayer.highlight, { color });
  };

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

  // Clean up any previous listeners
  const prevDraw = (view as any)._drawListener;
  const prevOverlay = (view as any)._overlayListener;
  if (prevDraw) view.removeEventListener('draw-annotation', prevDraw);
  if (prevOverlay) view.removeEventListener('create-overlay', prevOverlay);

  view.addEventListener('draw-annotation', handleDrawAnnotation);
  view.addEventListener('create-overlay', handleCreateOverlay);
  (view as any)._drawListener = handleDrawAnnotation;
  (view as any)._overlayListener = handleCreateOverlay;

  return () => {
    view.removeEventListener('draw-annotation', handleDrawAnnotation);
    view.removeEventListener('create-overlay', handleCreateOverlay);
    delete (view as any)._drawListener;
    delete (view as any)._overlayListener;
  };
}

/**
 * Apply annotation overlays that haven't been applied yet.
 * Uses appliedIds to track which annotations have already been added.
 */
export async function applyAnnotationOverlays(
  view: HTMLElement,
  annotations: Annotation[],
  appliedIds: Set<string>,
): Promise<void> {
  const viewApi = view as any;

  for (const a of annotations) {
    if (!a.cfiRange || appliedIds.has(a.id)) continue;
    appliedIds.add(a.id);
    try {
      await viewApi.addAnnotation({
        value: a.cfiRange,
        text:
          (a.target?.[0]?.selector?.find((s) => s.type === 'TextQuoteSelector') as any)?.exact ||
          '',
        color: a.color || DEFAULT_HIGHLIGHT_COLOR,
      });
    } catch {
      // Annotation may not be renderable yet; remove from set so it gets retried
      appliedIds.delete(a.id);
    }
  }
}
