import { DEFAULT_HIGHLIGHT_COLORS, type HighlightColor } from '../constants';

export interface AnnotatorLiteSettings {
  highlightColors: HighlightColor[];
}

export const DEFAULT_SETTINGS: AnnotatorLiteSettings = {
  highlightColors: DEFAULT_HIGHLIGHT_COLORS,
};
