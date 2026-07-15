import { Platform } from 'obsidian';
import type { IAndroidPatcher } from './engineTypes';
import { createLogger } from '../utils/logger';

const log = createLogger('AndroidPatcher');

// ─── Android iframe sandbox workaround ────────────────────────────────────
// foliate-js's paginator creates sandboxed iframes for a WebKit bug.
// On Chromium-based Android WebView, this sandbox silently blocks blob: URL
// loading, causing a blank reader. Strip the sandbox attribute from iframes.
const _origSetAttribute = HTMLIFrameElement.prototype.setAttribute;

// ─── Android blob: URL → srcdoc conversion ────────────────────────────────
// Blob URLs loaded in data:-URL iframes are cross-origin. Pre-read section
// HTML from blob URLs and inject via srcdoc instead (same-origin).
const _origCreateObjectURL = URL.createObjectURL.bind(URL);
const _origSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')!;

/**
 * Android WebView 兼容补丁管理器。
 *
 * 支持引用计数以避免嵌套启用/禁用问题。
 */
export class AndroidPatcher implements IAndroidPatcher {
  private _refCount = 0;
  private _iframePatchActive = false;
  private _blobPatchActive = false;
  private _srcPatchActive = false;
  private _blobMap = new Map<string, Blob>();
  private _textMap = new Map<string, string>();

  /** 启用所有补丁（幂等，支持嵌套调用） */
  enable(): void {
    if (!Platform.isMobile) return;
    this._refCount++;
    if (this._refCount > 1) return; // 已启用

    this._enableIframePatch();
    this._enableBlobPatch();
    this._enableSrcPatch();
  }

  /** 禁用所有补丁（仅当引用计数归零时真正禁用） */
  disable(): void {
    if (!Platform.isMobile) return;
    this._refCount = Math.max(0, this._refCount - 1);
    if (this._refCount > 0) return;

    this._disableIframePatch();
    this._disableBlobPatch();
    this._disableSrcPatch();
  }

  /** 立即禁用所有补丁（忽略引用计数），用于 emergency cleanup */
  forceDisable(): void {
    this._refCount = 0;
    this._disableIframePatch();
    this._disableBlobPatch();
    this._disableSrcPatch();
  }

  /**
   * 包装 section.load() 以预读 blob URL 文本。
   * 替代旧模块级 wrapSectionLoadForAndroid 函数。
   */
  async wrapSectionLoad(section: any): Promise<void> {
    const originalLoad = section.load.bind(section);
    let done = false;
    let result: any = null;
    section.load = async (): Promise<any> => {
      if (done) return result;
      const loaded = await originalLoad();
      // PDF sections return objects (not strings); pass them through unchanged
      if (!loaded || typeof loaded !== 'string' || !loaded.startsWith('blob:')) {
        done = true;
        result = loaded;
        return loaded;
      }
      const blob = this._blobMap.get(loaded);
      if (!blob) {
        done = true;
        result = loaded;
        return loaded;
      }
      try {
        const text = await blob.text();
        this._textMap.set(loaded, text);
      } catch {
        // preload failed, fall back to original blob URL
      }
      done = true;
      result = loaded;
      return loaded; // still return the blob URL; src patch intercepts to use srcdoc
    };
  }

  // ─── iframe sandbox patch ──────────────────────────────

  private _enableIframePatch(): void {
    if (this._iframePatchActive) return;
    this._iframePatchActive = true;
    HTMLIFrameElement.prototype.setAttribute = function (name: string, value: string) {
      if (name === 'sandbox' && value === 'allow-same-origin allow-scripts') return;
      return _origSetAttribute.call(this, name, value);
    };
  }

  private _disableIframePatch(): void {
    if (!this._iframePatchActive) return;
    HTMLIFrameElement.prototype.setAttribute = _origSetAttribute;
    this._iframePatchActive = false;
  }

  // ─── blob URL interception ──────────────────────────────

  private _enableBlobPatch(): void {
    if (this._blobPatchActive) return;
    this._blobPatchActive = true;
    this._blobMap.clear();
    URL.createObjectURL = (blob: Blob): string => {
      const url = _origCreateObjectURL(blob);
      this._blobMap.set(url, blob);
      return url;
    };
  }

  private _disableBlobPatch(): void {
    if (!this._blobPatchActive) return;
    URL.createObjectURL = _origCreateObjectURL;
    this._blobMap.clear();
    this._blobPatchActive = false;
  }

  // ─── iframe src → srcdoc patch ──────────────────────────

  private _enableSrcPatch(): void {
    if (this._srcPatchActive) return;
    this._srcPatchActive = true;
    const self = this;
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
      get() {
        return _origSrcDescriptor.get!.call(this);
      },
      set(value: string) {
        const text = typeof value === 'string' ? self._textMap.get(value) : undefined;
        if (text) {
          this.srcdoc = text;
          return;
        }
        _origSrcDescriptor.set!.call(this, value);
      },
      configurable: true,
      enumerable: true,
    });
  }

  private _disableSrcPatch(): void {
    if (!this._srcPatchActive) return;
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', _origSrcDescriptor);
    this._textMap.clear();
    this._srcPatchActive = false;
  }
}

// ─── 向后兼容的模块级 API ────────────────────────────────
// 保留旧函数签名，内部委托给单例实例，避免破坏 BookLoader 现有调用

let _defaultPatcher: AndroidPatcher | null = null;

function getDefaultPatcher(): AndroidPatcher {
  if (!_defaultPatcher) {
    _defaultPatcher = new AndroidPatcher();
  }
  return _defaultPatcher;
}

/**
 * 启用 Android WebView 兼容补丁（模块级 API，向后兼容）。
 * 委托给 AndroidPatcher 单例。
 */
export function enableAndroidPatches(): void {
  getDefaultPatcher().enable();
}

/**
 * 禁用 Android WebView 兼容补丁（模块级 API，向后兼容）。
 * 委托给 AndroidPatcher 单例。
 */
export function disableAndroidPatches(): void {
  getDefaultPatcher().disable();
}

/**
 * 包装 section.load() 以预读 blob URL 文本（模块级 API，向后兼容）。
 * 委托给 AndroidPatcher 单例。
 */
export async function wrapSectionLoadForAndroid(section: any): Promise<void> {
  return getDefaultPatcher().wrapSectionLoad(section);
}
