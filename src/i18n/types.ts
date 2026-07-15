/** 支持的语言代码 */
export type Locale = 'zh' | 'en';

/** 翻译键值对映射 */
export type TranslationMap = Record<string, string>;

/** i18n 模块内部运行时状态 */
export interface I18nState {
  /** 当前生效的语言 */
  currentLocale: Locale;
  /** 已加载的翻译资源缓存 */
  translations: Record<Locale, TranslationMap>;
  /** 订阅者集合（React 组件在语言切换时重新渲染） */
  subscribers: Set<() => void>;
}
