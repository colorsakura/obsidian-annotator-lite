import React, { useCallback, useEffect, useRef } from 'react';
import { TFile } from 'obsidian';
import { useObsidianApp } from '../hooks/useObsidianApp';
import type { Annotation, BookMetadata, NavigationTarget, OutlineItem } from '../types/annotations';
import 'foliate-js/view.js';
import { installAnnotationRendering, applyAnnotationOverlays } from './foliate/foliateAnnotations';
import { loadBookMetadata } from './foliate/foliateBookMetadata';
import { showSelectionMenu, type PendingSelection } from './foliate/foliateSelection';
import { navigateFoliate, goToSection, installRelocateListener } from './foliate/foliateNavigation';
import { installKeyboardNavigation } from './foliate/foliateKeyboard';

// ─── Android iframe sandbox workaround ────────────────────────────────────────
// foliate-js's paginator creates sandboxed iframes (sandbox="allow-same-origin
// allow-scripts") for a WebKit bug (https://bugs.webkit.org/show_bug.cgi?id=218086).
// On Chromium-based Android WebView, this sandbox silently blocks blob: URL
// loading, causing a blank reader. Strip the sandbox attribute from iframes
// created during the foliate-view lifecycle.
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

// ─── Android blob: URL → srcdoc conversion ──────────────────────────────────
// Blob URLs loaded in data:-URL iframes are cross-origin (null vs real origin),
// making contentDocument inaccessible. Loaded as src they are same-origin but
// fail silently on some Android WebViews.
//
// Approach: pre-read section HTML from blob URLs and inject via srcdoc instead.
// srcdoc iframes share the parent origin, so contentDocument is accessible and
// blob: sub-resources (images, CSS) load without cross-origin restrictions.
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

async function wrapSectionLoadForAndroid(section: any): Promise<void> {
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

type ReaderFlowMode = 'paginated' | 'scrolled';
type ColumnMode = 'single' | 'double';
type FoliateRendererElement = HTMLElement & {
  setStyles?: (styles: string | string[]) => void;
};
type FoliateViewElement = HTMLElement & {
  renderer?: FoliateRendererElement;
  isFixedLayout?: boolean;
};

// ─── Determine annotatability from file extension ─────────────────────────────
function getAnnotatableType(file: string): 'pdf' | 'epub' | undefined {
  const ext = file.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'epub') return 'epub';
  return undefined;
}

function applyReaderFlowMode(view: HTMLElement, flowMode: ReaderFlowMode): void {
  const { renderer, isFixedLayout } = view as FoliateViewElement;
  if (!renderer || isFixedLayout || renderer.tagName.toLowerCase() !== 'foliate-paginator') {
    return;
  }

  if (flowMode === 'scrolled') {
    renderer.setAttribute('flow', 'scrolled');
  } else {
    renderer.removeAttribute('flow');
  }
}

function applyColumnMode(view: HTMLElement, columnMode: ColumnMode): void {
  const { renderer } = view as FoliateViewElement;
  if (!renderer) return;

  const tagName = renderer.tagName.toLowerCase();

  // EPUB reflowable — use CSS multi-column
  if (tagName === 'foliate-paginator') {
    if (columnMode === 'single') {
      renderer.setAttribute('max-column-count', '1');
    } else {
      renderer.removeAttribute('max-column-count');
    }
    return;
  }

  // PDF fixed-layout — control page spread via book rendition
  if (tagName === 'foliate-fxl') {
    void reopenPdfWithSpread(view, columnMode);
  }
}

function applyFontSize(view: HTMLElement, fontSize: number): void {
  const { renderer } = view as FoliateViewElement;
  if (!renderer || renderer.tagName.toLowerCase() !== 'foliate-paginator') return;

  renderer.setStyles?.(`html { font-size: ${fontSize}% !important; }`);
}

async function reopenPdfWithSpread(view: HTMLElement, columnMode: ColumnMode): Promise<void> {
  const v = view as any;
  if (!v.book) return;

  const lastLocation = v.lastLocation;

  v.book.rendition = v.book.rendition || {};
  v.book.rendition.spread = columnMode === 'single' ? 'none' : undefined;

  v.close();
  await v.open(v.book);

  if (lastLocation) {
    try {
      await v.init({ lastLocation });
    } catch {
      await v.init({ showTextStart: true }).catch(() => {});
    }
  } else {
    await v.init({ showTextStart: true }).catch(() => {});
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface FoliateViewerProps {
  file: string;
  annotations: Annotation[];
  onAddAnnotation?: (params: {
    type: 'pdf' | 'epub';
    cfiRange: string;
    text: string;
    prefix: string;
    suffix: string;
    note?: string;
  }) => void;
  onOutlineLoaded?: (items: OutlineItem[]) => void;
  onBookMetadataLoaded?: (metadata: BookMetadata) => void;
  navigationTarget?: NavigationTarget | null;
  sectionTarget?: number | null;
  flowMode: ReaderFlowMode;
  columnMode: ColumnMode;
  fontSize: number;
  onSectionChange?: (currentIndex: number, totalSections: number, currentLabel?: string) => void;
  sectionIndicator?: React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────
const FoliateViewer: React.FC<FoliateViewerProps> = ({
  file,
  annotations,
  onAddAnnotation,
  onOutlineLoaded,
  onBookMetadataLoaded,
  navigationTarget,
  sectionTarget,
  flowMode,
  columnMode,
  fontSize,
  onSectionChange,
  sectionIndicator,
}) => {
  const app = useObsidianApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLElement | null>(null);
  const loadedFileRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const coverUrlRef = useRef<string | null>(null);
  const loadHandlerRef = useRef<((e: any) => void) | null>(null);
  const annotationsRef = useRef<Annotation[]>(annotations);
  const appliedAnnotationIdsRef = useRef<Set<string>>(new Set());
  const pendingSelectionRef = useRef<PendingSelection | null>(null);
  const onSectionChangeRef = useRef(onSectionChange);
  onSectionChangeRef.current = onSectionChange;
  const navigationTargetRef = useRef(navigationTarget);
  navigationTargetRef.current = navigationTarget;
  const flowModeRef = useRef(flowMode);
  flowModeRef.current = flowMode;
  const columnModeRef = useRef(columnMode);
  columnModeRef.current = columnMode;
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;

  // Create <foliate-view> element. Use document.createElement instead of
  // ownerDocument.createElement — Android WebView has no popout windows.
  const getView = useCallback((): HTMLElement | null => {
    if (viewRef.current) return viewRef.current;
    const el = document.createElement('foliate-view') as HTMLElement;
    // Explicit dimensions: on Android WebView, percentage-based height chains
    // may not resolve — set both width and height directly on the element.
    Object.assign(el.style, {
      width: '100%',
      height: '100%',
      minHeight: '300px',
      display: 'block',
    });
    viewRef.current = el;
    return viewRef.current;
  }, []);

  // ─── Load file ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!app || !file || loadingRef.current) return;
    if (loadedFileRef.current === file) return;

    const loadFile = async () => {
      loadingRef.current = true;

      const tfile = app.vault.getAbstractFileByPath(file);
      if (!(tfile instanceof TFile)) {
        loadingRef.current = false;
        return;
      }

      try {
        const data = await app.vault.readBinary(tfile as any);
        const view = getView();
        if (!view) {
          loadingRef.current = false;
          return;
        }

        // Mount view into container
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          containerRef.current.appendChild(view);
        }

        // Sync annotations ref
        annotationsRef.current = annotations;

        const fileType = getAnnotatableType(file);
        const isAnnotatable = fileType !== undefined;

        // Install annotation rendering handlers
        if (isAnnotatable) {
          installAnnotationRendering(view, () => annotationsRef.current);
        }

        // ─── Load handler ──────────────────────────────────────────────────
        const handleLoad = async ({ detail }: any) => {
          const { doc } = detail;

          // Inject selection contextmenu into iframe
          if (doc && (view as any).renderer && isAnnotatable && fileType && onAddAnnotation) {
            const win = doc.defaultView as Window;
            const hostDoc = win.parent?.document ?? containerRef.current?.ownerDocument;
            if (!hostDoc) return;

            doc.addEventListener('contextmenu', (ev: MouseEvent) => {
              ev.preventDefault();
              ev.stopPropagation();
              showSelectionMenu(
                view,
                win,
                hostDoc,
                ev,
                fileType,
                pendingSelectionRef,
                onAddAnnotation,
                app,
              );
            });
          }
        };

        // Register load handler
        if (loadHandlerRef.current) {
          view.removeEventListener('load', loadHandlerRef.current as any);
        }
        view.addEventListener('load', handleLoad as any);
        loadHandlerRef.current = handleLoad as any;

        // Patch iframe sandbox + intercept blob URLs — Android WebView workarounds
        enableIframePatch();
        enableBlobPatch();
        enableSrcPatch();

        // Open the book
        const blob = new Blob([data]);
        const fileObj = new File([blob], tfile.name);
        const ext = tfile.name.split('.').pop()?.toLowerCase();

        if (ext === 'pdf') {
          // For PDF: create book manually with correct rendition.spread
          const { makePDF } = await import('foliate-js/pdf.js');
          const book = await makePDF(fileObj);
          book.rendition.spread = columnModeRef.current === 'single' ? 'none' : undefined;
          await (view as any).open(book);
        } else {
          await (view as any).open(fileObj);
          applyReaderFlowMode(view, flowModeRef.current);
          applyColumnMode(view, columnModeRef.current);
          applyFontSize(view, fontSizeRef.current);
        }

        // Extract TOC, cover, metadata
        const book = (view as any).book;
        if (book) {
          const { info, coverUrl: newCover } = await loadBookMetadata(book, coverUrlRef.current);
          coverUrlRef.current = newCover;

          onOutlineLoaded?.(info.outline);
          onBookMetadataLoaded?.(info.metadata);

          // Rewire section .load() to preload HTML for srcdoc injection
          if (book.sections) {
            await Promise.all(book.sections.map((s: any) => wrapSectionLoadForAndroid(s)));
          }

          if (info.totalSections > 0) {
            onSectionChangeRef.current?.(0, info.totalSections);
          }
        }

        // Install relocate listener
        installRelocateListener(view, (idx, total, label) => {
          onSectionChangeRef.current?.(idx, total, label);
        });

        // Initialize renderer
        try {
          await (view as any).init({ showTextStart: true });
        } catch {
          try {
            await (view as any).goTo(0);
          } catch {}
        }

        // Navigate to initial target if set (e.g. from "show annotation" link)
        const initialTarget = navigationTargetRef.current;
        if (initialTarget) {
          navigateFoliate(view, initialTarget);
        }

        // Reset applied annotation tracking
        appliedAnnotationIdsRef.current = new Set();
        loadedFileRef.current = file;
      } catch (err) {
        console.error('[annotator-lite] Failed to load file:', err);
      } finally {
        loadingRef.current = false;
      }
    };

    loadFile();
  }, [app, file, getView]);

  // ─── Apply reader flow mode ─────────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !loadedFileRef.current) return;
    applyReaderFlowMode(view, flowMode);
  }, [flowMode]);

  // ─── Apply column mode ──────────────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !loadedFileRef.current) return;
    applyColumnMode(view, columnMode);
  }, [columnMode]);

  // ─── Apply font size ────────────────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !loadedFileRef.current) return;
    applyFontSize(view, fontSize);
  }, [fontSize]);

  // ─── Keep annotations ref in sync ───────────────────────────────────────
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  // ─── Apply new annotation overlays ──────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !loadedFileRef.current) return;
    void applyAnnotationOverlays(view, annotations, appliedAnnotationIdsRef.current);
  }, [annotations]);

  // ─── Navigation target ──────────────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !navigationTarget) return;
    navigateFoliate(view, navigationTarget);
  }, [navigationTarget]);

  // ─── Section target ─────────────────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view || sectionTarget === null || sectionTarget === undefined) return;
    goToSection(view, sectionTarget);
  }, [sectionTarget]);

  // ─── Keyboard navigation ────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !loadedFileRef.current) return;
    return installKeyboardNavigation(container, () => viewRef.current);
  }, [loadedFileRef.current]);

  // ─── Cleanup ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      disableIframePatch();
      disableBlobPatch();
      disableSrcPatch();
      if (coverUrlRef.current) {
        URL.revokeObjectURL(coverUrlRef.current);
        coverUrlRef.current = null;
      }
      const view = viewRef.current;
      if (view) {
        if (loadHandlerRef.current) {
          view.removeEventListener('load', loadHandlerRef.current as any);
          loadHandlerRef.current = null;
        }
        // Clean up stored listeners
        ['_drawListener', '_overlayListener', '_relocateListener'].forEach((key) => {
          const fn = (view as any)[key];
          if (fn) {
            const eventName = key.replace('_', '').replace('Listener', '');
            view.removeEventListener(eventName, fn);
            delete (view as any)[key];
          }
        });
        try {
          (view as any).close?.();
        } catch {}
        viewRef.current = null;
        loadedFileRef.current = null;
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="foliate-viewer-container" tabIndex={0}>
      {sectionIndicator}
    </div>
  );
};

export default FoliateViewer;
