type FoliateRendererElement = HTMLElement & {
  setStyles?: (styles: string | string[]) => void;
};
type FoliateViewElement = HTMLElement & {
  renderer?: FoliateRendererElement;
};

// ─── Theme detection ─────────────────────────────────────────────────

/** 检测当前是否为暗色主题（通过 Obsidian body class 判断） */
export function isDarkMode(): boolean {
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

// ─── Public API ──────────────────────────────────────────────────────

/**
 * 将 Obsidian 主题样式注入到 foliate-view 的 renderer。
 * 暗色模式读取 Obsidian CSS 变量并注入对应样式；亮色模式仅设置 color-scheme。
 * 仅对 EPUB reflowable（paginator）生效。
 */
export function applyTheme(view: HTMLElement, dark: boolean): void {
  const { renderer } = view as FoliateViewElement;
  if (!renderer || renderer.tagName.toLowerCase() !== 'foliate-paginator') return;

  const themeCSS = dark ? buildDarkCSS() : buildLightCSS();
  renderer.setStyles?.([themeCSS]);
}
