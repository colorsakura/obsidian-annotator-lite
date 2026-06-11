export const READER_VIEW_TYPE = 'reader-view';
export const OUTLINE_VIEW_TYPE = 'outline-view';
export const ANNOTATIONS_VIEW_TYPE = 'annotate-view';
export const ANNOTATION_TARGET_PROPERTY = 'annotation-target';
export const ANNOTATOR_ID_PROPERTY = 'id';
export const ICON_NAME = 'pencil';

export interface HighlightColor {
  id: string;
  value: string;
  name: string;
}

export const DEFAULT_HIGHLIGHT_COLORS: HighlightColor[] = [
  { id: 'yellow', value: '#ffe066', name: '黄色' },
  { id: 'red', value: '#ff6b6b', name: '红色' },
  { id: 'blue', value: '#74c0fc', name: '蓝色' },
  { id: 'green', value: '#69db7c', name: '绿色' },
  { id: 'purple', value: '#b197fc', name: '紫色' },
];

export const DEFAULT_HIGHLIGHT_COLOR = '#ffe066';

export type ReaderFlowMode = 'paginated' | 'scrolled';
export type ColumnMode = 'single' | 'double';

export const READER_FONT_SIZE_MIN = 80;
export const READER_FONT_SIZE_MAX = 160;
export const READER_FONT_SIZE_STEP = 10;
export const READER_FONT_SIZE_DEFAULT = 100;
