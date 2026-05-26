import type { AnnotatorLiteSettings } from '../../settings';

/**
 * Apply reader flow/layout settings to a foliate-view renderer element.
 */
export function applyRendererSettings(
  view: HTMLElement,
  settings: AnnotatorLiteSettings | null,
): void {
  if (!settings) return;
  const renderer = (view as any).renderer;
  if (!renderer) return;

  renderer.setAttribute('flow', settings.flow);
  renderer.setAttribute('margin', `${settings.margin}px`);
  renderer.setAttribute('max-inline-size', `${settings.maxInlineSize}px`);
  renderer.setAttribute('gap', `${settings.gap}%`);

  if (settings.maxColumns === '1') {
    renderer.setAttribute('max-column-count', '1');
  } else {
    renderer.removeAttribute('max-column-count');
  }
}

/**
 * Build CSS overrides for typographic settings.
 * Injected into each section's iframe document via Paginator.setStyles().
 */
export function buildTypographicCSS(settings: AnnotatorLiteSettings): string {
  const rules: string[] = [];

  if (settings.fontSize > 0) {
    rules.push(`html { font-size: ${settings.fontSize}px; }`);
  }
  rules.push(`body {
  line-height: ${settings.lineHeight};
  text-align: ${settings.textAlign};
  hyphens: ${settings.hyphens};
}`);
  rules.push(`p {
  margin-block: ${settings.paragraphSpacing}em;
  text-indent: ${settings.textIndent}em;
}`);

  return `/* annotator-lite typography */
${rules.join('\n')}`;
}
