import {
  DEFAULT_HIGHLIGHT_COLORS,
  type ColumnMode,
  type HighlightColor,
  type ReaderFlowMode,
} from '../constants';

// 阅读记录类型
export interface ReadingRecord {
  /** foliate-js CFI 位置 */
  cfi: string;
  /** 当前章节索引 */
  sectionIndex: number;
  /** 最后阅读时间（ISO 8601） */
  lastReadAt: string;
  /** 累计阅读时长（秒），预留字段 */
  readingTime: number;
  /** 目标文件名 */
  targetFileName: string;
}

/** 阅读历史存储结构，key 是 frontmatter id */
export type ReadingHistoryMap = Record<string, ReadingRecord>;

export interface AnnotatorLiteSettings {
  highlightColors: HighlightColor[];
  defaultFontSize: number;
  defaultColumnMode: ColumnMode;
  defaultFlowMode: ReaderFlowMode;
  /** 阅读历史记录 */
  readingHistory: ReadingHistoryMap;
  /** 界面语言：'zh' | 'en' | undefined（undefined 表示自动检测） */
  language?: 'zh' | 'en';
}

export const DEFAULT_SETTINGS: AnnotatorLiteSettings = {
  highlightColors: DEFAULT_HIGHLIGHT_COLORS,
  defaultFontSize: 100,
  defaultColumnMode: 'double',
  defaultFlowMode: 'paginated',
  readingHistory: {},
};
