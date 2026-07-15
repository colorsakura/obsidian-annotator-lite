import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock foliate-js overlayer
vi.mock('foliate-js/overlayer.js', () => ({
  Overlayer: {
    highlight: vi.fn(),
  },
}));

import {
  installCreateOverlayListener,
  installAnnotationRendering,
  applyAnnotationOverlays,
} from '../foliateAnnotations';

function createMockView(): HTMLElement {
  const view = document.createElement('div');
  Object.assign(view, {
    addAnnotation: vi.fn().mockResolvedValue(undefined),
    deleteAnnotation: vi.fn().mockResolvedValue(undefined),
    resolveNavigation: vi.fn().mockResolvedValue({ index: 0 }),
  });
  return view;
}

describe('foliateAnnotations', () => {
  describe('installCreateOverlayListener', () => {
    it('returns a cleanup function', () => {
      const view = createMockView();
      const getAnnotations = vi.fn().mockReturnValue([]);
      const cleanup = installCreateOverlayListener(view, getAnnotations);
      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('skips when annotations list is empty', async () => {
      const view = createMockView();
      const getAnnotations = vi.fn().mockReturnValue([]);
      const cleanup = installCreateOverlayListener(view, getAnnotations);

      // Fire create-overlay event
      const event = new CustomEvent('create-overlay', { detail: { index: 0 } });
      view.dispatchEvent(event);

      // Wait for async handler
      await new Promise((r) => setTimeout(r, 10));

      expect((view as any).addAnnotation).not.toHaveBeenCalled();

      cleanup();
    });

    it('adds annotations matching overlay index', async () => {
      const view = createMockView();
      const annotations = [
        {
          id: 'a1',
          cfiRange: 'cfi1',
          color: '#ff0',
          target: [
            {
              selector: [{ type: 'TextQuoteSelector', exact: 'highlighted text' }],
            },
          ],
        },
        {
          id: 'a2',
          cfiRange: 'cfi2',
          color: '#ff6b6b',
          target: [
            {
              selector: [{ type: 'TextQuoteSelector', exact: 'another text' }],
            },
          ],
        },
      ] as any[];
      const getAnnotations = vi.fn().mockReturnValue(annotations);
      const cleanup = installCreateOverlayListener(view, getAnnotations);

      // Mock resolveNavigation to match index 0
      (view as any).resolveNavigation.mockResolvedValue({ index: 0 });

      const event = new CustomEvent('create-overlay', { detail: { index: 0 } });
      view.dispatchEvent(event);

      await new Promise((r) => setTimeout(r, 10));

      expect((view as any).addAnnotation).toHaveBeenCalledTimes(2);

      cleanup();
    });

    it('handles resolveNavigation failures gracefully', async () => {
      const view = createMockView();
      (view as any).resolveNavigation.mockRejectedValue(new Error('fail'));
      const annotations = [{ id: 'a1', cfiRange: 'cfi1', color: '#ff0', target: [] }] as any[];
      const getAnnotations = vi.fn().mockReturnValue(annotations);
      const cleanup = installCreateOverlayListener(view, getAnnotations);

      const event = new CustomEvent('create-overlay', { detail: { index: 0 } });
      view.dispatchEvent(event);

      await new Promise((r) => setTimeout(r, 10));

      // Should not crash and should not call addAnnotation
      expect((view as any).addAnnotation).not.toHaveBeenCalled();

      cleanup();
    });
  });

  describe('installAnnotationRendering', () => {
    it('returns a cleanup function', () => {
      const view = document.createElement('div');
      const cleanup = installAnnotationRendering(view);
      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('removes previous _drawListener before installing', () => {
      const view = document.createElement('div');
      const oldFn = vi.fn();
      (view as any)._drawListener = oldFn;

      installAnnotationRendering(view);

      // Old listener should be removed
      expect((view as any)._drawListener).not.toBe(oldFn);
    });
  });

  describe('applyAnnotationOverlays', () => {
    it('removes overlays for removed annotations', async () => {
      const view = createMockView();
      const appliedMap = new Map([['old-id', 'cfi-old']]);

      await applyAnnotationOverlays(view, [], appliedMap);

      expect((view as any).deleteAnnotation).toHaveBeenCalledWith({ value: 'cfi-old' });
      expect(appliedMap.has('old-id')).toBe(false);
    });

    it('adds overlays for new annotations', async () => {
      const view = createMockView();
      const appliedMap = new Map<string, string>();
      const annotations = [
        {
          id: 'a1',
          cfiRange: 'cfi1',
          color: '#ff0',
          target: [
            {
              selector: [{ type: 'TextQuoteSelector', exact: 'hello' }],
            },
          ],
        },
      ] as any[];

      await applyAnnotationOverlays(view, annotations, appliedMap);

      expect((view as any).addAnnotation).toHaveBeenCalledWith(
        expect.objectContaining({ value: 'cfi1', color: '#ff0' }),
      );
      expect(appliedMap.has('a1')).toBe(true);
      expect(appliedMap.get('a1')).toBe('cfi1');
    });

    it('skips annotations already in appliedMap', async () => {
      const view = createMockView();
      const appliedMap = new Map([['a1', 'cfi1']]);
      const annotations = [
        {
          id: 'a1',
          cfiRange: 'cfi1',
          color: '#ff0',
          target: [],
        },
      ] as any[];

      await applyAnnotationOverlays(view, annotations, appliedMap);

      // Should not re-add
      expect((view as any).addAnnotation).not.toHaveBeenCalled();
    });

    it('keeps overlay in appliedMap and adds new ones', async () => {
      const view = createMockView();
      const appliedMap = new Map([['a1', 'cfi1']]);
      const annotations = [
        {
          id: 'a1',
          cfiRange: 'cfi1',
          color: '#ff0',
          target: [],
        },
        {
          id: 'a2',
          cfiRange: 'cfi2',
          color: '#ff6b6b',
          target: [],
        },
      ] as any[];

      await applyAnnotationOverlays(view, annotations, appliedMap);

      expect(appliedMap.has('a1')).toBe(true);
      expect(appliedMap.get('a2')).toBe('cfi2');
    });
  });
});
