import { useState, useEffect } from 'react';

type FoliateRendererElement = HTMLElement & {
  setStyles?: (styles: string | [string, string]) => void;
};
type FoliateViewElement = HTMLElement & {
  renderer?: FoliateRendererElement;
};

// ─── Theme detection ─────────────────────────────────────────────────

function isDarkMode(): boolean {
  return document.body.classList.contains('theme-dark');
}

// ─── Obsidian color reading ──────────────────────────────────────────

function readObsidianColors(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  return {
    bg: cs.getPropertyValue('--background-primary').trim(),
    text: cs.getPropertyValue('--text-normal').trim(),
    muted: cs.getPropertyValue('--text-muted').trim(),
    accent: cs.getPropertyValue('--text-accent').trim(),
    border: cs.getPropertyValue('--background-modifier-border').trim(),
    hover: cs.getPropertyValue('--background-modifier-hover').trim(),
  };
}

// ─── CSS builders ────────────────────────────────────────────────────

function buildDarkCSS(): string {
  const c = readObsidianColors();
  return `
html {
  background-color: ${c.bg} !important;
  color: ${c.text} !important;
  color-scheme: dark !important;
}
body {
  background-color: transparent !important;
  color: inherit !important;
}
a, a:link, a:visited {
  color: ${c.accent} !important;
}
blockquote {
  border-color: ${c.border} !important;
  background-color: ${c.hover} !important;
}
code, pre {
  background-color: ${c.hover} !important;
}
img, svg, video {
  opacity: 0.85 !important;
}`;
}

function buildLightCSS(): string {
  return `
html {
  color-scheme: light !important;
}`;
}

// ─── Imperative apply function ───────────────────────────────────────

export function applyReaderStyles(
  view: HTMLElement,
  options: { dark: boolean; fontSize: number },
): void {
  const { renderer } = view as FoliateViewElement;
  if (!renderer || renderer.tagName.toLowerCase() !== 'foliate-paginator') return;

  const themeCSS = options.dark ? buildDarkCSS() : buildLightCSS();
  const fontCSS = `html { font-size: ${options.fontSize}% !important; }`;
  renderer.setStyles?.([fontCSS, themeCSS]);
}

// ─── React hook ──────────────────────────────────────────────────────

export function useDarkTheme(view: HTMLElement | null, loaded: boolean, fontSize: number): void {
  const [dark, setDark] = useState(isDarkMode());

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDarkMode()));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!view || !loaded) return;
    applyReaderStyles(view, { dark, fontSize });
  }, [view, loaded, dark, fontSize]);
}
