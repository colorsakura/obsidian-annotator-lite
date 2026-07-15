import type { Annotation, PendingSelection } from '../types/annotations';
import { getSurroundingContext } from '../utils/selectionContext';
import type { EngineEventBus } from './engineTypes';

/**
 * Detects text selections inside foliate-js iframes via contextmenu events.
 *
 * Listens for right-click events on foliate-view iframe documents, extracts the
 * current text selection and its CFI, converts coordinates to the host window,
 * checks for overlapping annotations, and emits a `selection` event on the bus.
 *
 * Absorbs the contextmenu detection logic previously in `useSelectionMenu`.
 */
export class SelectionDetector {
  private cleanupFns: Array<() => void> = [];

  constructor(private bus: EngineEventBus) {}

  /**
   * Install contextmenu listener on the foliate-view element.
   * Call this after view.init() completes and the renderer has iframes.
   */
  install(view: HTMLElement, fileType: 'pdf' | 'epub', getAnnotations: () => Annotation[]): void {
    // Clean up any previous listeners first
    this.uninstall();

    // Handler for the 'load' event — fires when foliate-js navigates to a new section
    const handleLoad = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      if (!detail?.doc) return;
      this.installDocContextmenu(detail.doc, view, fileType, getAnnotations);
    };

    view.addEventListener('load', handleLoad);
    this.cleanupFns.push(() => view.removeEventListener('load', handleLoad));

    // If the renderer already has content (initial 'load' already fired during
    // async init()), set up the contextmenu handler immediately.
    this.installIframeListeners(view, fileType, getAnnotations);
  }

  /** Remove all listeners. */
  uninstall(): void {
    for (const fn of this.cleanupFns) {
      fn();
    }
    this.cleanupFns = [];
  }

  /**
   * Find an annotation whose cfiRange matches the given CFI.
   */
  findOverlappingAnnotation(cfi: string, annotations: Annotation[]): Annotation | undefined {
    return annotations.find((a) => a.cfiRange === cfi);
  }

  /**
   * Get renderer contents and install contextmenu on each iframe document.
   */
  private installIframeListeners(
    view: HTMLElement,
    fileType: 'pdf' | 'epub',
    getAnnotations: () => Annotation[],
  ): void {
    const viewApi = view as any;
    const contents = viewApi.renderer?.getContents?.();
    if (!contents || contents.length === 0) return;

    for (const content of contents) {
      const doc = content.doc as Document | undefined;
      if (doc) {
        this.installDocContextmenu(doc, view, fileType, getAnnotations);
      }
    }
  }

  /**
   * Install a contextmenu listener on a single iframe document.
   * Only one listener is active at a time (mirrors useSelectionMenu behaviour).
   */
  private installDocContextmenu(
    doc: Document,
    view: HTMLElement,
    fileType: 'pdf' | 'epub',
    getAnnotations: () => Annotation[],
  ): void {
    const win = doc.defaultView as Window;

    const handler = (ev: MouseEvent) => {
      this.handleContextmenu(ev, view, win, doc, fileType, getAnnotations);
    };

    doc.addEventListener('contextmenu', handler);
    this.cleanupFns.push(() => doc.removeEventListener('contextmenu', handler));
  }

  /**
   * Core contextmenu handler: extract selection, get CFI, convert coordinates,
   * and emit a `selection` event on the bus.
   */
  private handleContextmenu(
    ev: MouseEvent,
    view: HTMLElement,
    win: Window,
    _doc: Document,
    fileType: 'pdf' | 'epub',
    getAnnotations: () => Annotation[],
  ): void {
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

      // Convert iframe-local coordinates to host-window coordinates
      const iframeEl = win.frameElement as HTMLElement | null;
      const iframeRect = iframeEl?.getBoundingClientRect();
      const hostX = (iframeRect?.left ?? 0) + ev.clientX;
      const hostY = (iframeRect?.top ?? 0) + ev.clientY;

      const existingAnnotation = this.findOverlappingAnnotation(cfi, getAnnotations());

      this.bus.emit('selection', {
        selection,
        existingAnnotation,
        position: { x: hostX, y: hostY },
      });
    } catch {
      // Selection may not be convertible to CFI; silently ignore
    }
  }
}
