import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  navigateFoliate,
  goToSection,
  goToNextPage,
  goToPrevPage,
  goToFirstSection,
  goToLastSection,
  installRelocateListener,
  installKeyboardNavigation,
} from '../foliateNavigation';

describe('foliateNavigation', () => {
  let mockView: HTMLElement;

  beforeEach(() => {
    mockView = document.createElement('div');
    Object.assign(mockView, {
      goTo: vi.fn(),
      next: vi.fn(),
      prev: vi.fn(),
      renderer: {
        getContents: vi.fn().mockReturnValue([{ index: 0 }, { index: 1 }]),
        atStart: false,
        atEnd: false,
      },
      book: {
        sections: [{ label: 'Chapter 1' }, { label: 'Chapter 2' }],
      },
    });
  });

  describe('navigateFoliate', () => {
    it('navigates by href', () => {
      navigateFoliate(mockView, { href: '#chapter1' });
      expect((mockView as any).goTo).toHaveBeenCalledWith('#chapter1');
    });

    it('navigates by page number (0-indexed)', () => {
      navigateFoliate(mockView, { pageNumber: 3 });
      expect((mockView as any).goTo).toHaveBeenCalledWith(2);
    });
  });

  describe('goToSection', () => {
    it('calls view.goTo with index', () => {
      goToSection(mockView, 2);
      expect((mockView as any).goTo).toHaveBeenCalledWith(2);
    });
  });

  describe('goToNextPage', () => {
    it('calls view.next', () => {
      goToNextPage(mockView);
      expect((mockView as any).next).toHaveBeenCalled();
    });
  });

  describe('goToPrevPage', () => {
    it('calls view.prev', () => {
      goToPrevPage(mockView);
      expect((mockView as any).prev).toHaveBeenCalled();
    });
  });

  describe('goToFirstSection', () => {
    it('calls view.goTo(0)', () => {
      goToFirstSection(mockView);
      expect((mockView as any).goTo).toHaveBeenCalledWith(0);
    });
  });

  describe('goToLastSection', () => {
    it('calls view.goTo with last section index', () => {
      goToLastSection(mockView);
      expect((mockView as any).goTo).toHaveBeenCalledWith(1);
    });
  });

  describe('installRelocateListener', () => {
    it('returns a cleanup function', () => {
      const onSectionChange = vi.fn();
      const cleanup = installRelocateListener(mockView, onSectionChange);
      expect(typeof cleanup).toBe('function');
    });

    it('removes listener when cleanup is called', () => {
      const onSectionChange = vi.fn();
      const cleanup = installRelocateListener(mockView, onSectionChange);

      cleanup();

      // After cleanup, listener should be removed
      // We verify this indirectly by checking _relocateListener is gone
      expect((mockView as any)._relocateListener).toBeUndefined();
    });
  });

  describe('installKeyboardNavigation', () => {
    it('returns a cleanup function', () => {
      const getView = vi.fn().mockReturnValue(mockView);
      const container = document.createElement('div');
      const cleanup = installKeyboardNavigation(container, getView);
      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('navigates next on PageDown', () => {
      const getView = vi.fn().mockReturnValue(mockView);
      const container = document.createElement('div');
      const cleanup = installKeyboardNavigation(container, getView);

      const event = new KeyboardEvent('keydown', { key: 'PageDown' }) as any;
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      container.dispatchEvent(event);

      expect((mockView as any).next).toHaveBeenCalled();

      cleanup();
    });

    it('navigates prev on PageUp', () => {
      const getView = vi.fn().mockReturnValue(mockView);
      const container = document.createElement('div');
      const cleanup = installKeyboardNavigation(container, getView);

      const event = new KeyboardEvent('keydown', { key: 'PageUp' }) as any;
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      container.dispatchEvent(event);

      expect((mockView as any).prev).toHaveBeenCalled();

      cleanup();
    });

    it('navigates to first section on Home', () => {
      const getView = vi.fn().mockReturnValue(mockView);
      const container = document.createElement('div');
      const cleanup = installKeyboardNavigation(container, getView);

      const event = new KeyboardEvent('keydown', { key: 'Home' }) as any;
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      container.dispatchEvent(event);

      expect((mockView as any).goTo).toHaveBeenCalledWith(0);

      cleanup();
    });

    it('navigates to last section on End', () => {
      const getView = vi.fn().mockReturnValue(mockView);
      const container = document.createElement('div');
      const cleanup = installKeyboardNavigation(container, getView);

      const event = new KeyboardEvent('keydown', { key: 'End' }) as any;
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      container.dispatchEvent(event);

      expect((mockView as any).goTo).toHaveBeenCalledWith(1);

      cleanup();
    });

    it('ignores key events when view is null', () => {
      const getView = vi.fn().mockReturnValue(null);
      const container = document.createElement('div');
      const cleanup = installKeyboardNavigation(container, getView);

      const event = new KeyboardEvent('keydown', { key: 'PageDown' }) as any;
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      container.dispatchEvent(event);

      // Should not throw and should not navigate
      expect((mockView as any).next).not.toHaveBeenCalled();

      cleanup();
    });
  });
});
