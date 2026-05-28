import React, { useCallback, useEffect, useRef } from 'react';
import { TFile } from 'obsidian';
import { useObsidianApp } from '../hooks/useObsidianApp';
import type { Annotation, BookMetadata, NavigationTarget, OutlineItem } from '../types/annotations';
// Registers <foliate-view> custom element and provides pdf-book adapter
import '../foliate/view.js';
import { installAnnotationRendering, applyAnnotationOverlays } from './foliate/foliateAnnotations';
import { loadBookMetadata } from './foliate/foliateBookMetadata';
import { showSelectionMenu, type PendingSelection } from './foliate/foliateSelection';
import { navigateFoliate, goToSection, installRelocateListener } from './foliate/foliateNavigation';
import { installKeyboardNavigation } from './foliate/foliateKeyboard';

// ─── PDF page rendering helper ────────────────────────────────────────────────
async function renderPdfPage(view: any, index: number, doc: Document): Promise<void> {
  const section = view.book?.sections?.[index];
  if (section?.render) {
    try {
      await section.render(doc);
    } catch (err) {
      console.error('[annotator-lite] Failed to render page:', err);
    }
  }
}

// ─── Determine annotatability from file extension ─────────────────────────────
function getAnnotatableType(file: string): 'pdf' | 'epub' | undefined {
  const ext = file.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'epub') return 'epub';
  return undefined;
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

  // Create <foliate-view> element using the container's ownerDocument
  const getView = useCallback((): HTMLElement | null => {
    if (viewRef.current) return viewRef.current;
    const doc = containerRef.current?.ownerDocument;
    if (!doc) return null;
    viewRef.current = doc.createElement('foliate-view') as HTMLElement;
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
          const { doc, index } = detail;

          // PDF page rendering
          await renderPdfPage(view, index, doc);

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

        // Open the book
        const blob = new Blob([data]);
        const fileObj = new File([blob], tfile.name);
        await (view as any).open(fileObj);

        // Extract TOC, cover, metadata
        const book = (view as any).book;
        if (book) {
          const { info, coverUrl: newCover } = await loadBookMetadata(book, coverUrlRef.current);
          coverUrlRef.current = newCover;

          onOutlineLoaded?.(info.outline);
          onBookMetadataLoaded?.(info.metadata);

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
