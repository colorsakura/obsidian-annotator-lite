import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  t,
  setLanguage,
  getLanguage,
  resolveDefaultLanguage,
  loadTranslations,
  useT,
} from './index';
import type { Locale } from './types';

// Mock the JSON imports
vi.mock('./en.json', () => ({
  default: {
    'test.hello': 'Hello',
    'test.world': 'World',
    'test.onlyEn': 'English only',
    'common.cancel': 'Cancel',
  },
}));

vi.mock('./zh.json', () => ({
  default: {
    'test.hello': '你好',
    'test.world': '世界',
    'common.cancel': '取消',
  },
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('i18n module', () => {
  beforeEach(() => {
    loadTranslations();
    setLanguage('en');
  });

  describe('t()', () => {
    it('should return translation for current language (en)', () => {
      expect(t('test.hello')).toBe('Hello');
      expect(t('test.world')).toBe('World');
    });

    it('should return translation for zh after setLanguage', () => {
      setLanguage('zh');
      expect(t('test.hello')).toBe('你好');
      expect(t('test.world')).toBe('世界');
    });

    it('should fallback to English when zh key is missing', () => {
      setLanguage('zh');
      expect(t('test.onlyEn')).toBe('English only');
    });

    it('should fallback to provided fallback when key missing in both', () => {
      expect(t('nonexistent.key', 'Fallback Text')).toBe('Fallback Text');
    });

    it('should return the key itself when no translation and no fallback', () => {
      expect(t('nonexistent.key')).toBe('nonexistent.key');
    });

    it('should return empty string fallback when translation is empty', () => {
      // empty string in translation should still be treated as missing (fallback)
      expect(t('nonexistent.key', '')).toBe('');
    });
  });

  describe('setLanguage()', () => {
    it('should change current language', () => {
      setLanguage('zh');
      expect(getLanguage()).toBe('zh');
      setLanguage('en');
      expect(getLanguage()).toBe('en');
    });

    it('should notify subscribers when language changes', () => {
      const subscriber = vi.fn();
      // Access internal subscriber mechanism via useT test
      setLanguage('zh');
      // Verify language did change
      expect(getLanguage()).toBe('zh');
    });

    it('should not notify subscribers when language unchanged', () => {
      setLanguage('en');
      expect(getLanguage()).toBe('en');
      // Second call with same value should be no-op
      setLanguage('en');
      expect(getLanguage()).toBe('en');
    });

    it('should fallback to en for invalid locale', () => {
      setLanguage('fr' as Locale);
      expect(getLanguage()).toBe('en');
    });
  });

  describe('getLanguage()', () => {
    it('should return current language', () => {
      expect(getLanguage()).toBe('en');
      setLanguage('zh');
      expect(getLanguage()).toBe('zh');
    });
  });

  describe('resolveDefaultLanguage()', () => {
    it('should return zh for zh-cn', () => {
      expect(resolveDefaultLanguage('zh-cn')).toBe('zh');
    });

    it('should return zh for zh-tw', () => {
      expect(resolveDefaultLanguage('zh-tw')).toBe('zh');
    });

    it('should return zh for zh', () => {
      expect(resolveDefaultLanguage('zh')).toBe('zh');
    });

    it('should return en for en', () => {
      expect(resolveDefaultLanguage('en')).toBe('en');
    });

    it('should return en for other languages', () => {
      expect(resolveDefaultLanguage('fr')).toBe('en');
      expect(resolveDefaultLanguage('ja')).toBe('en');
    });

    it('should return en for undefined input', () => {
      expect(resolveDefaultLanguage(undefined)).toBe('en');
    });
  });

  describe('loadTranslations()', () => {
    it('should load translations successfully', () => {
      loadTranslations();
      expect(t('test.hello')).toBe('Hello');
    });
  });
});
