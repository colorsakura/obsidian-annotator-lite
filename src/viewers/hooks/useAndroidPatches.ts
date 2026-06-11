import { useEffect } from 'react';

// ─── Android iframe sandbox workaround ────────────────────────────────────
// foliate-js's paginator creates sandboxed iframes for a WebKit bug.
// On Chromium-based Android WebView, this sandbox silently blocks blob: URL
// loading, causing a blank reader. Strip the sandbox attribute from iframes.
const _origSetAttribute = HTMLIFrameElement.prototype.setAttribute;
let _iframePatchActive = false;

function enableIframePatch() {
  if (_iframePatchActive) return;
  _iframePatchActive = true;
  HTMLIFrameElement.prototype.setAttribute = function (name: string, value: string) {
    if (name === 'sandbox' && value === 'allow-same-origin allow-scripts') return;
    return _origSetAttribute.call(this, name, value);
  };
}

function disableIframePatch() {
  if (!_iframePatchActive) return;
  HTMLIFrameElement.prototype.setAttribute = _origSetAttribute;
  _iframePatchActive = false;
}

// ─── Android blob: URL → srcdoc conversion ────────────────────────────────
// Blob URLs loaded in data:-URL iframes are cross-origin. Pre-read section
// HTML from blob URLs and inject via srcdoc instead (same-origin).
const _blobMap = new Map<string, Blob>();
const _textMap = new Map<string, string>();
const _origCreateObjectURL = URL.createObjectURL.bind(URL);
let _blobPatchActive = false;

function enableBlobPatch() {
  if (_blobPatchActive) return;
  _blobPatchActive = true;
  URL.createObjectURL = function (blob: Blob): string {
    const url = _origCreateObjectURL(blob);
    _blobMap.set(url, blob);
    return url;
  };
}

function disableBlobPatch() {
  if (!_blobPatchActive) return;
  URL.createObjectURL = _origCreateObjectURL;
  _blobPatchActive = false;
}

export async function wrapSectionLoadForAndroid(section: any): Promise<void> {
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
    const blob = _blobMap.get(loaded);
    if (!blob) {
      done = true;
      result = loaded;
      return loaded;
    }
    try {
      const text = await blob.text();
      _textMap.set(loaded, text);
    } catch {
      // preload failed, fall back to original blob URL
    }
    done = true;
    result = loaded;
    return loaded; // still return the blob URL; src patch intercepts to use srcdoc
  };
}

// Patch iframe src setter: if the URL has preloaded text in _textMap,
// use srcdoc instead (same-origin, contentDocument accessible).
const _origSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')!;
let _srcPatchActive = false;

function enableSrcPatch() {
  if (_srcPatchActive) return;
  _srcPatchActive = true;
  Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
    get() {
      return _origSrcDescriptor.get!.call(this);
    },
    set(value: string) {
      const text = typeof value === 'string' ? _textMap.get(value) : undefined;
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

function disableSrcPatch() {
  if (!_srcPatchActive) return;
  Object.defineProperty(HTMLIFrameElement.prototype, 'src', _origSrcDescriptor);
  _textMap.clear();
  _srcPatchActive = false;
}

// ─── React hook ───────────────────────────────────────────────────────────

/**
 * 启用/禁用 Android WebView 兼容补丁（iframe sandbox、blob URL、srcdoc 注入）。
 * 在组件挂载时启用，卸载时禁用。
 */
export function useAndroidPatches(loaded: boolean): void {
  useEffect(() => {
    if (!loaded) return;
    enableIframePatch();
    enableBlobPatch();
    enableSrcPatch();
    return () => {
      disableIframePatch();
      disableBlobPatch();
      disableSrcPatch();
    };
  }, [loaded]);
}
