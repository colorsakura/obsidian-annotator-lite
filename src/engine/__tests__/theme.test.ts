import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyTheme, isDarkMode } from '../theme';

describe('theme', () => {
  describe('isDarkMode', () => {
    it('returns false when theme-dark class is absent', () => {
      document.body.classList.remove('theme-dark');
      expect(isDarkMode()).toBe(false);
    });

    it('returns true when theme-dark class is present', () => {
      document.body.classList.add('theme-dark');
      expect(isDarkMode()).toBe(true);
      document.body.classList.remove('theme-dark');
    });
  });

  describe('applyTheme', () => {
    function createMockRenderer(): any {
      const el = document.createElement('foliate-paginator');
      Object.assign(el, {
        setStyles: vi.fn(),
        setAttribute: vi.fn(),
        removeAttribute: vi.fn(),
      });
      return el;
    }

    it('applies dark theme to paginator', () => {
      const renderer = createMockRenderer();
      const view = Object.assign(document.createElement('div'), { renderer });

      // Ensure CSS variables exist
      document.documentElement.style.setProperty('--background-primary', '#1e1e1e');
      document.documentElement.style.setProperty('--text-normal', '#d4d4d4');
      document.documentElement.style.setProperty('--text-muted', '#888');
      document.documentElement.style.setProperty('--text-accent', '#569cd6');
      document.documentElement.style.setProperty('--background-modifier-border', '#333');
      document.documentElement.style.setProperty('--background-modifier-hover', '#2a2a2a');

      applyTheme(view, true);
      expect(renderer.setStyles).toHaveBeenCalled();
      const css = (renderer.setStyles as any).mock.calls[0][0][0];
      expect(css).toContain('background-color: #1e1e1e');
      expect(css).toContain('color-scheme: dark');
    });

    it('applies light theme to paginator', () => {
      const renderer = createMockRenderer();
      const view = Object.assign(document.createElement('div'), { renderer });

      applyTheme(view, false);
      expect(renderer.setStyles).toHaveBeenCalled();
      const css = (renderer.setStyles as any).mock.calls[0][0][0];
      expect(css).toContain('color-scheme: light');
    });

    it('ignores when no renderer', () => {
      const view = document.createElement('div');
      expect(() => applyTheme(view, true)).not.toThrow();
    });

    it('ignores non-paginator elements', () => {
      const renderer = Object.assign(document.createElement('foliate-fxl'), {
        setStyles: vi.fn(),
      });
      const view = Object.assign(document.createElement('div'), { renderer });

      applyTheme(view, true);
      expect(renderer.setStyles).not.toHaveBeenCalled();
    });
  });
});
