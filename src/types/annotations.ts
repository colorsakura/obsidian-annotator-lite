// Hypothesis-compatible annotation types, matching obsidian-annotator format

export interface TextQuoteSelector {
  type: 'TextQuoteSelector';
  exact: string;
  prefix: string;
  suffix: string;
}

export interface TextPositionSelector {
  type: 'TextPositionSelector';
  start: number;
  end: number;
}

export interface RangeSelector {
  type: 'RangeSelector';
  endContainer: string;
  endOffset: number;
  startContainer: string;
  startOffset: number;
}

export type Selector = TextPositionSelector | TextQuoteSelector | RangeSelector;

export interface Annotation {
  id: string;
  /** PDF or EPUB file URI / fingerprint */
  uri: string;
  document: {
    title: string;
    documentFingerprint?: string;
    link?: { href: string }[];
  };
  /** Highlight location data */
  target: {
    source: string;
    selector: Selector[];
  }[];
  /** User note / comment */
  text: string;
  tags: string[];
  created: string;
  updated: string;
  /** Non-standard extension: CFI string for foliate-js rendering */
  cfiRange?: string;
  /** Non-standard extension: discriminator for PDF vs EPUB */
  type?: 'pdf' | 'epub';
  /** Non-standard extension: highlight color (CSS color value) */
  color?: string;
}

/** Minimal default values used to strip redundant fields from stored JSON */
export function makeDefaultAnnotation(id: string, tags: string[] = []): Partial<Annotation> {
  return {
    document: { title: '', link: [] },
    text: '',
    tags,
    target: [],
  };
}

/**
 * Create a new Annotation from foliate-js selection data.
 */
export function createAnnotation(params: {
  type: 'pdf' | 'epub';
  cfiRange: string;
  text: string;
  prefix: string;
  suffix: string;
  uri: string;
  title?: string;
  note?: string;
  tags?: string[];
  color?: string;
}): Annotation {
  const id = generateAnnotationId();
  const now = new Date().toISOString();
  const source = params.uri;

  return {
    id,
    uri: params.uri,
    document: {
      title: params.title || '',
      documentFingerprint: params.uri,
      link: [{ href: params.uri }],
    },
    target: [
      {
        source,
        selector: [
          {
            type: 'TextQuoteSelector',
            exact: params.text,
            prefix: params.prefix,
            suffix: params.suffix,
          },
        ],
      },
    ],
    text: params.note || '',
    tags: params.tags || [],
    created: now,
    updated: now,
    cfiRange: params.cfiRange,
    type: params.type,
    color: params.color,
  };
}

/** Generate alphanumeric ID matching obsidian-annotator style */
function generateAnnotationId(): string {
  return Math.random().toString(36).substring(2);
}

export interface OutlineItem {
  title: string;
  pageNumber?: number;
  href?: string;
  children: OutlineItem[];
}

export interface NavigationTarget {
  pageNumber?: number;
  href?: string;
}

export interface BookMetadata {
  coverUrl: string | null;
  title: string | null;
  author: string | null;
}

/** 书签数据 */
export interface Bookmark {
  /** 唯一标识 */
  id: string;
  /** foliate-js CFI 位置 */
  cfiRange: string;
  /** 书签标题（默认为当前章节标题或自动生成） */
  title: string;
  /** 页码标签 */
  pageLabel?: string;
  /** ISO 创建时间 */
  created: string;
  /** 可选备注 */
  note?: string;
}

/** 选区数据，用于从 foliate-js 选区创建标注 */
export interface PendingSelection {
  type: 'pdf' | 'epub';
  cfiRange: string;
  text: string;
  prefix: string;
  suffix: string;
}
