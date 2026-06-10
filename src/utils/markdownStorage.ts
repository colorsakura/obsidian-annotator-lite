import { Annotation, makeDefaultAnnotation } from '../types/annotations';

/**
 * Regex to match an annotation block in the original obsidian-annotator format.
 * Each annotation is a blockquote section ending with ^annotationId on its own line.
 */
function makeAnnotationBlockRegex(annotationId?: string): RegExp {
  return new RegExp(
    '(?<annotationBlock>^\\n(>.*?\\n)*?>```annotation-json(\\n>.*?)*?)' +
      '\\n\\^(?<annotationId>' +
      (annotationId ?? '[a-zA-Z0-9]+') +
      ')\\n',
    'gm',
  );
}

/**
 * Parse a single annotation block and extract the Annotation object.
 */
function parseAnnotationBlock(annotationBlock: string, annotationId: string): Annotation | null {
  // Extract JSON from the %%\n```annotation-json\n...\n```\n%% section
  const jsonRegex = /```annotation-json\n([\s\S]*?)\n```/;
  const jsonMatch = annotationBlock
    .split('\n')
    .map((x) => (x.startsWith('>') ? x.substring(1) : x))
    .join('\n')
    .match(jsonRegex);

  if (!jsonMatch) return null;

  try {
    const annotation = JSON.parse(jsonMatch[1]);
    // Merge with defaults
    const defaults = makeDefaultAnnotation(annotationId, annotation.tags || []);
    return { ...defaults, ...annotation, id: annotationId } as Annotation;
  } catch {
    return null;
  }
}

/**
 * Parse all annotations from markdown content.
 * Returns annotations that match the given URI, or all annotations if uri is null.
 */
export function parseAnnotationsFromMarkdown(content: string, uri?: string | null): Annotation[] {
  const annotations: Annotation[] = [];
  const annotationRegex = makeAnnotationBlockRegex();

  let m: RegExpExecArray | null;
  while ((m = annotationRegex.exec(content)) !== null) {
    if (m.index === annotationRegex.lastIndex) {
      annotationRegex.lastIndex++;
    }
    const { annotationBlock, annotationId } = m.groups!;
    const annotation = parseAnnotationBlock(annotationBlock, annotationId);

    if (annotation) {
      if (
        uri === null ||
        uri === undefined ||
        annotation.uri === uri ||
        annotation.document?.documentFingerprint === uri
      ) {
        annotations.push(annotation);
      }
    }
  }

  return annotations;
}

/**
 * Build the markdown string for a single annotation.
 * Uses the original obsidian-annotator format: blockquote-wrapped with
 * annotation-json code fence, visible highlight line, LINK, COMMENT, TAGS, and ^id.
 */
function formatAnnotation(annotation: Annotation): string {
  const id = annotation.id;
  const defaults = makeDefaultAnnotation(id, annotation.tags);
  const stripped = stripDefaultValues(
    annotation as unknown as Record<string, unknown>,
    defaults as Record<string, unknown>,
  );

  // Get prefix/exact/suffix from TextQuoteSelector
  let prefix = '';
  let exact = '';
  let suffix = '';
  annotation.target?.[0]?.selector?.forEach((s) => {
    if (s.type === 'TextQuoteSelector') {
      prefix = s.prefix || '';
      exact = s.exact || '';
      suffix = s.suffix || '';
    }
  });

  const annotationJson = JSON.stringify(stripped);

  const lines: string[] = [];
  // JSON block (inside %% comment markers)
  lines.push('>%%');
  lines.push('>```annotation-json');
  lines.push('>' + annotationJson);
  lines.push('>```');
  lines.push('>%%');

  // Visible highlight display
  const parts: string[] = [];
  if (prefix) parts.push(`%%PREFIX%%${prefix.trim()}`);
  parts.push(`%%HIGHLIGHT%% ==${exact.trim()}==`);
  if (suffix) parts.push(`%%POSTFIX%%${suffix.trim()}`);
  lines.push(`>*${parts.join('')}*`);

  // Link
  lines.push(`>%%LINK%%[[#^${id}|show annotation]]`);

  // Comment (note)
  lines.push('>%%COMMENT%%');
  const commentLines = annotation.text ? annotation.text.split('\n') : [''];
  for (const cl of commentLines) {
    lines.push('>' + cl);
  }

  // Tags
  lines.push('>%%TAGS%%');
  lines.push('>' + annotation.tags.map((t) => '#' + t).join(', '));

  return '\n' + lines.join('\n') + '\n^' + id + '\n';
}

/**
 * Strip fields from annotation that match default values,
 * to keep the stored JSON compact (matching obsidian-annotator behavior).
 */
function stripDefaultValues(
  obj: Record<string, unknown>,
  defaultObj: Record<string, unknown>,
): Record<string, unknown> {
  const stripped: Record<string, unknown> = {};
  const toIgnore = [
    'group',
    'permissions',
    'user',
    'user_info',
    'links',
    'flagged',
    'hidden',
    'references',
  ];
  for (const key of Object.keys(obj)) {
    if (!toIgnore.includes(key) && JSON.stringify(obj[key]) !== JSON.stringify(defaultObj[key])) {
      stripped[key] = obj[key];
    }
  }
  return stripped;
}

/**
 * Generate markdown content with updated annotations.
 * Removes existing annotation blocks and appends the given annotations.
 */
export function generateMarkdownWithAnnotations(
  originalContent: string,
  annotations: Annotation[],
): string {
  // Remove all existing annotation blocks
  const annotationRegex = makeAnnotationBlockRegex();
  const content = originalContent.replace(annotationRegex, '').trimEnd();

  if (annotations.length === 0) {
    return content;
  }

  // Append each annotation block
  const blocks = annotations.map((a) => formatAnnotation(a));
  return content + '\n' + blocks.join('\n') + '\n';
}
