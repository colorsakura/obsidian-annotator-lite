import {
  DEFAULT_HIGHLIGHT_COLORS,
  type ColumnMode,
  type HighlightColor,
  type ReaderFlowMode,
} from '../constants';

export interface AnnotatorLiteSettings {
  highlightColors: HighlightColor[];
  defaultFontSize: number;
  defaultColumnMode: ColumnMode;
  defaultFlowMode: ReaderFlowMode;
}

export const DEFAULT_SETTINGS: AnnotatorLiteSettings = {
  highlightColors: DEFAULT_HIGHLIGHT_COLORS,
  defaultFontSize: 100,
  defaultColumnMode: 'double',
  defaultFlowMode: 'paginated',
};
