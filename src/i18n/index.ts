import type { Locale, TranslationMap } from './types';
import { createLogger } from '../utils/logger';

const log = createLogger('i18n');

// ─── 翻译资源导入 ──────────────────────────────────────────────────────
import enTranslations from './en.json';
import zhTranslations from './zh.json';

// ─── 模块级状态 ────────────────────────────────────────────────────────
let _currentLocale: Locale = 'en';
const _translations: Record<Locale, TranslationMap> = {
  en: {},
  zh: {},
};
const _subscribers = new Set<() => void>();

// ─── 加载翻译资源 ──────────────────────────────────────────────────────
export function loadTranslations(): void {
  try {
    _translations.en = enTranslations as TranslationMap;
    _translations.zh = zhTranslations as TranslationMap;
    log.debug('Translations loaded');
  } catch (e) {
    log.error('Failed to load translations, falling back to English', e);
    _translations.en = {};
    _translations.zh = {};
  }
}

// ─── 获取翻译文本 ──────────────────────────────────────────────────────
/**
 * 获取当前语言下指定键的翻译文本。
 *
 * 回退链：当前语言 → 英文 → fallback 参数 → 键名本身
 *
 * @param key 翻译键（点分隔层级命名，如 `settings.language.label`）
 * @param fallback 可选的最终回退文本
 * @returns 翻译后的字符串
 */
export function t(key: string, fallback?: string): string {
  // 优先当前语言
  const current = _translations[_currentLocale]?.[key];
  if (current !== undefined && current !== '') return current;

  // 回退到英文
  const en = _translations.en?.[key];
  if (en !== undefined && en !== '') return en;

  // 最后回退：优先 fallback 参数，不暴露原始键名
  if (fallback !== undefined) return fallback;
  log.warn(`Translation key "${key}" missing in both "${_currentLocale}" and English`);
  return '';
}

// ─── 语言切换 ─────────────────────────────────────────────────────────
/**
 * 切换当前语言，通知所有订阅者（React 组件）。
 */
export function setLanguage(locale: Locale): void {
  if (locale !== 'zh' && locale !== 'en') {
    log.warn(`Unsupported locale "${locale}", falling back to "en"`);
    locale = 'en';
  }
  if (_currentLocale === locale) return;
  _currentLocale = locale;
  log.debug('Language set to:', locale);
  // 通知订阅者
  for (const subscriber of _subscribers) {
    try {
      subscriber();
    } catch (e) {
      log.error('Subscriber error:', e);
    }
  }
}

/** 获取当前生效的语言代码 */
export function getLanguage(): Locale {
  return _currentLocale;
}

// ─── 默认语言检测 ─────────────────────────────────────────────────────
/**
 * 根据 Obsidian 语言自动决定默认语言。
 * @param obsidianLocale moment.locale() 返回的语言字符串（如 'zh-cn', 'en'）
 */
export function resolveDefaultLanguage(obsidianLocale?: string): Locale {
  if (obsidianLocale?.startsWith('zh')) return 'zh';
  return 'en';
}

// ─── React hook 支持 ──────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';

/**
 * React hook：返回绑定当前语言的翻译函数。
 * 语言切换时自动触发组件重渲染。
 */
export function useT(): (key: string, fallback?: string) => string {
  // 用简单计数器作为版本号，语言切换时递增以触发重渲染
  const [, setVersion] = useState(0);

  useEffect(() => {
    const callback = () => setVersion((v) => v + 1);
    _subscribers.add(callback);
    return () => {
      _subscribers.delete(callback);
    };
  }, []);

  return useCallback((key: string, fallback?: string) => t(key, fallback), []);
}
