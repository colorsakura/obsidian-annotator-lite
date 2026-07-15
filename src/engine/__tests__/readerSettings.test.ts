import { describe, it, expect, vi } from 'vitest';
import { applyReaderFlowMode, applyColumnMode, applyFontSize } from '../readerSettings';

function createMockRenderer(
  tagName = 'foliate-paginator',
  extra: Record<string, any> = {},
): HTMLElement {
  const el = document.createElement(tagName);
  Object.assign(el, {
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    setStyles: vi.fn(),
    ...extra,
  });
  return el;
}

describe('readerSettings', () => {
  describe('applyReaderFlowMode', () => {
    it('sets scrolled flow mode on paginator', () => {
      const renderer = createMockRenderer('foliate-paginator');
      const view = Object.assign(document.createElement('div'), {
        renderer,
        isFixedLayout: false,
      });

      applyReaderFlowMode(view, 'scrolled');
      expect(renderer.setAttribute).toHaveBeenCalledWith('flow', 'scrolled');
    });

    it('removes flow attribute for paginated mode', () => {
      const renderer = createMockRenderer('foliate-paginator');
      const view = Object.assign(document.createElement('div'), {
        renderer,
        isFixedLayout: false,
      });

      applyReaderFlowMode(view, 'paginated');
      expect(renderer.removeAttribute).toHaveBeenCalledWith('flow');
    });

    it('ignores when no renderer', () => {
      const view = document.createElement('div');
      expect(() => applyReaderFlowMode(view, 'scrolled')).not.toThrow();
    });

    it('ignores fixed-layout documents', () => {
      const renderer = createMockRenderer('foliate-paginator');
      const view = Object.assign(document.createElement('div'), {
        renderer,
        isFixedLayout: true,
      });

      applyReaderFlowMode(view, 'scrolled');
      expect(renderer.setAttribute).not.toHaveBeenCalled();
    });

    it('ignores non-paginator elements', () => {
      const renderer = createMockRenderer('foliate-fxl');
      const view = Object.assign(document.createElement('div'), {
        renderer,
        isFixedLayout: false,
      });

      applyReaderFlowMode(view, 'scrolled');
      expect(renderer.setAttribute).not.toHaveBeenCalled();
    });
  });

  describe('applyColumnMode', () => {
    it('sets single column on paginator', () => {
      const renderer = createMockRenderer('foliate-paginator');
      const view = Object.assign(document.createElement('div'), { renderer });

      applyColumnMode(view, 'single');
      expect(renderer.setAttribute).toHaveBeenCalledWith('max-column-count', '1');
    });

    it('removes max-column-count for double column on paginator', () => {
      const renderer = createMockRenderer('foliate-paginator');
      const view = Object.assign(document.createElement('div'), { renderer });

      applyColumnMode(view, 'double');
      expect(renderer.removeAttribute).toHaveBeenCalledWith('max-column-count');
    });

    it('ignores when no renderer', () => {
      const view = document.createElement('div');
      expect(() => applyColumnMode(view, 'single')).not.toThrow();
    });

    it('reopens PDF with spread for fxl elements', async () => {
      const renderer = createMockRenderer('foliate-fxl');
      const book: any = {
        rendition: {},
      };
      const view: any = Object.assign(document.createElement('div'), {
        renderer,
        book,
        close: vi.fn(),
        open: vi.fn().mockResolvedValue(undefined),
        init: vi.fn().mockResolvedValue(undefined),
        lastLocation: null,
      });

      applyColumnMode(view, 'single');

      // Wait for async reopen
      await new Promise((r) => setTimeout(r, 10));

      expect(book.rendition.spread).toBe('none');
      expect(view.close).toHaveBeenCalled();
      expect(view.open).toHaveBeenCalledWith(book);
    });

    it('reopens PDF with lastLocation preserved', async () => {
      const renderer = createMockRenderer('foliate-fxl');
      const book: any = {
        rendition: {},
      };
      const lastLocation = { index: 5 };
      const view: any = Object.assign(document.createElement('div'), {
        renderer,
        book,
        close: vi.fn(),
        open: vi.fn().mockResolvedValue(undefined),
        init: vi.fn().mockResolvedValue(undefined),
        lastLocation,
      });

      applyColumnMode(view, 'single');
      await new Promise((r) => setTimeout(r, 10));

      expect(view.init).toHaveBeenCalledWith({ lastLocation });
    });
  });

  describe('applyFontSize', () => {
    it('applies font size to paginator', () => {
      const renderer = createMockRenderer('foliate-paginator');
      const view = Object.assign(document.createElement('div'), { renderer });

      applyFontSize(view, 150);
      expect((renderer as any).setStyles).toHaveBeenCalledWith(
        'html { font-size: 150% !important; }',
      );
    });

    it('ignores when no renderer', () => {
      const view = document.createElement('div');
      expect(() => applyFontSize(view, 120)).not.toThrow();
    });

    it('ignores non-paginator elements', () => {
      const renderer = createMockRenderer('foliate-fxl');
      const view = Object.assign(document.createElement('div'), { renderer });

      applyFontSize(view, 150);
      expect((renderer as any).setStyles).not.toHaveBeenCalled();
    });
  });
});
