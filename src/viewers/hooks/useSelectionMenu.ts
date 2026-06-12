import { useCallback, useEffect, useRef, useState } from 'react';
import type { Annotation } from '../../types/annotations';
import type { HighlightColor } from '../../constants';
import { DEFAULT_HIGHLIGHT_COLORS } from '../../constants';
import { getSurroundingContext, type PendingSelection } from '../foliate/foliateSelection';
import type { App } from 'obsidian';
import { NoteModal } from '../../components/NoteModal';

export interface SelectionMenuState {
  visible: boolean;
  position: { x: number; y: number };
  selection: PendingSelection;
  colors: HighlightColor[];
  existingAnnotation?: Annotation;
}

export interface SelectionMenuActions {
  onHighlight: (color: string) => void;
  onAddNote: () => void;
  onDelete: (annotationId: string) => void;
}

export function useSelectionMenu(opts: {
  view: HTMLElement | null;
  loaded: boolean;
  isAnnotatable: boolean;
  fileType: 'pdf' | 'epub' | undefined;
  annotations: Annotation[];
  onAddAnnotation?: (params: PendingSelection & { color?: string; note?: string }) => void;
  onDeleteAnnotation: (id: string) => void;
  app: App;
  colors?: HighlightColor[];
}): {
  menuState: SelectionMenuState | null;
  menuActions: SelectionMenuActions;
  menuRef: React.RefObject<HTMLDivElement | null>;
} {
  const {
    view,
    loaded,
    isAnnotatable,
    fileType,
    annotations,
    onAddAnnotation,
    onDeleteAnnotation,
    app,
  } = opts;

  // 稳定 colors 引用：避免每次渲染创建新默认值导致 contextmenu effect 重建
  const colorsRef = useRef<HighlightColor[]>(opts.colors ?? DEFAULT_HIGHLIGHT_COLORS);
  if (opts.colors) colorsRef.current = opts.colors;
  const colors = colorsRef.current;

  const [menuState, setMenuState] = useState<SelectionMenuState | null>(null);
  const pendingRef = useRef<PendingSelection | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const annotationsRef = useRef<Annotation[]>(annotations);
  annotationsRef.current = annotations;

  // Close menu on ESC
  useEffect(() => {
    if (!menuState?.visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        pendingRef.current = null;
        setMenuState(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuState?.visible]);

  // Close menu on outside click (host document + iframe documents)
  useEffect(() => {
    if (!menuState?.visible) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        pendingRef.current = null;
        setMenuState(null);
      }
    };
    // Use pointerdown to fire before the click event
    document.addEventListener('pointerdown', handleClick);

    // Also listen on iframe documents — clicks inside the iframe
    // don't bubble to the host document.
    const iframeCleanups: (() => void)[] = [];
    if (view) {
      const viewApi = view as any;
      const contents = viewApi.renderer?.getContents?.();
      if (contents) {
        for (const content of contents) {
          const doc = content.doc as Document | undefined;
          if (doc) {
            doc.addEventListener('pointerdown', handleClick);
            iframeCleanups.push(() => doc.removeEventListener('pointerdown', handleClick));
          }
        }
      }
    }

    return () => {
      document.removeEventListener('pointerdown', handleClick);
      for (const cleanup of iframeCleanups) cleanup();
    };
  }, [menuState?.visible, view]);

  // Find overlapping annotation for a given selection.
  // Reads from annotationsRef so the function reference is stable and never
  // triggers the contextmenu effect to re-run (which would lose the 'load' listener).
  const findOverlappingAnnotation = useCallback((sel: PendingSelection): Annotation | undefined => {
    const list = annotationsRef.current;
    // For EPUB, try to match by cfiRange
    if (sel.type === 'epub') {
      const match = list.find((a) => a.cfiRange && a.cfiRange === sel.cfiRange);
      if (match) return match;
    }
    // Fallback: match by exact text (TextQuoteSelector)
    type TQS = import('../../types/annotations').TextQuoteSelector;
    const match = list.find((a) => {
      const quote = a.target?.[0]?.selector?.find((s): s is TQS => s.type === 'TextQuoteSelector');
      return quote?.exact === sel.text;
    });
    return match;
  }, []);

  // Listen for contextmenu in iframe.
  // The 'load' event fires when foliate-js navigates to a new section. However,
  // the initial section's 'load' fires during the async init() in useBookLoader,
  // which completes *before* React re-renders with isLoaded=true. By the time
  // this effect runs, the first 'load' has already been dispatched.
  // To handle this, we also check if the renderer is already ready on mount
  // (via getContents()) and set up the contextmenu handler immediately.
  useEffect(() => {
    if (!view || !loaded || !isAnnotatable || !fileType) return;

    let currentDoc: Document | null = null;
    let currentContextHandler: ((ev: MouseEvent) => void) | null = null;

    const setupContextmenu = (doc: Document) => {
      if (!doc) return;

      // Clean up previous contextmenu listener
      if (currentDoc && currentContextHandler) {
        currentDoc.removeEventListener('contextmenu', currentContextHandler);
      }

      const win = doc.defaultView as Window;

      const contextHandler = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();

        const iframeSelection = win.getSelection();
        if (!iframeSelection || iframeSelection.isCollapsed || !iframeSelection.rangeCount) return;

        const range = iframeSelection.getRangeAt(0);
        const text = iframeSelection.toString().trim();
        if (!text) return;

        try {
          const viewApi = view as any;
          const contents = viewApi.renderer?.getContents?.();
          if (!contents || contents.length === 0) return;

          const cfi = viewApi.getCFI(contents[0].index, range);
          const { prefix, suffix } = getSurroundingContext(range);

          const selection: PendingSelection = {
            type: fileType,
            cfiRange: cfi,
            text,
            prefix,
            suffix,
          };
          pendingRef.current = selection;

          // Convert iframe coordinates to host coordinates
          const iframeEl = win.frameElement as HTMLElement | null;
          const iframeRect = iframeEl?.getBoundingClientRect();
          const hostX = (iframeRect?.left ?? 0) + ev.clientX;
          const hostY = (iframeRect?.top ?? 0) + ev.clientY;

          const existing = findOverlappingAnnotation(selection);

          setMenuState({
            visible: true,
            position: { x: hostX, y: hostY },
            selection,
            colors,
            existingAnnotation: existing,
          });
        } catch {
          // Selection may not be convertible to CFI
        }
      };

      doc.addEventListener('contextmenu', contextHandler);
      currentDoc = doc;
      currentContextHandler = contextHandler;
    };

    const handleLoad = ({ detail }: any) => {
      const { doc } = detail;
      if (!doc) return;
      setupContextmenu(doc);
    };

    // If the renderer already has content (initial 'load' already fired),
    // set up the contextmenu handler immediately.
    const viewApi = view as any;
    const existingContents = viewApi.renderer?.getContents?.();
    if (existingContents?.length > 0 && existingContents[0].doc) {
      setupContextmenu(existingContents[0].doc);
    }

    view.addEventListener('load', handleLoad as any);
    return () => {
      view.removeEventListener('load', handleLoad as any);
      if (currentDoc && currentContextHandler) {
        currentDoc.removeEventListener('contextmenu', currentContextHandler);
        currentDoc = null;
        currentContextHandler = null;
      }
    };
  }, [view, loaded, isAnnotatable, fileType, colors]);

  const handleHighlight = useCallback(
    (color: string) => {
      const sel = pendingRef.current;
      if (!sel) return;
      onAddAnnotation?.({ ...sel, color });
      pendingRef.current = null;
      setMenuState(null);
    },
    [onAddAnnotation],
  );

  const handleAddNote = useCallback(async () => {
    const sel = pendingRef.current;
    if (!sel) return;
    setMenuState(null);
    const modal = new NoteModal(app);
    modal.open();
    const result = await modal.result;
    if (!result.cancelled && result.note.trim()) {
      onAddAnnotation?.({ ...sel, note: result.note.trim() });
    }
    pendingRef.current = null;
  }, [onAddAnnotation, app]);

  const handleDelete = useCallback(
    (annotationId: string) => {
      onDeleteAnnotation(annotationId);
      pendingRef.current = null;
      setMenuState(null);
    },
    [onDeleteAnnotation],
  );

  return {
    menuState,
    menuActions: {
      onHighlight: handleHighlight,
      onAddNote: handleAddNote,
      onDelete: handleDelete,
    },
    menuRef,
  };
}
