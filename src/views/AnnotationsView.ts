import React, { useEffect, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ItemView, type WorkspaceLeaf } from 'obsidian';
import AnnotationsComponent from '../components/AnnotationsComponent';
import { AppContext } from '../hooks/useObsidianApp';
import { type Annotation, type NavigationTarget } from '../types/annotations';

export const ANNOTATIONS_VIEW_TYPE = 'annotation-annotations';

// ──────────────────────────────────────────
// Inner React component — holds state to avoid destroying React tree on every update.
// ──────────────────────────────────────────
interface AnnotationsViewApi {
  setAnnotations: (items: Annotation[]) => void;
}

interface AnnotationsViewInnerProps {
  annotations: Annotation[];
  onNavigate: (target: NavigationTarget) => void;
  onUpdateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  onDeleteAnnotation: (id: string) => void;
  apiRef: React.MutableRefObject<AnnotationsViewApi | null>;
}

const AnnotationsViewInner: React.FC<AnnotationsViewInnerProps> = ({
  annotations,
  onNavigate,
  onUpdateAnnotation,
  onDeleteAnnotation,
  apiRef,
}) => {
  const [localAnnotations, setLocalAnnotations] = useState(annotations);

  // Sync initial props when parent re-renders (fallback path)
  useEffect(() => {
    setLocalAnnotations(annotations);
  }, [annotations]);

  // Expose imperative API — runs after mount, so subsequent setAnnotations calls
  // go through apiRef without destroying the tree.
  useEffect(() => {
    apiRef.current = {
      setAnnotations: (items) => setLocalAnnotations(items),
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);

  return React.createElement(AnnotationsComponent, {
    annotations: localAnnotations,
    onNavigate,
    onUpdateAnnotation,
    onDeleteAnnotation,
  });
};

// ──────────────────────────────────────────
// Obsidian ItemView
// ──────────────────────────────────────────
export class AnnotationsView extends ItemView {
  private reactRoot: HTMLElement;
  private root: Root;
  private onNavigateCallback: ((target: NavigationTarget) => void) | null = null;
  private onSwitchToReaderCallback: (() => void) | null = null;
  private onUpdateAnnotationCallback: ((id: string, updates: Partial<Annotation>) => void) | null =
    null;
  private onDeleteAnnotationCallback: ((id: string) => void) | null = null;
  private apiRef: React.MutableRefObject<AnnotationsViewApi | null> = { current: null };
  /** Pending annotations that arrived before React mounted (apiRef not yet available). */
  private pendingAnnotations: Annotation[] | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.reactRoot = this.contentEl.createDiv({ cls: 'annotation-annotations-container' });
    this.root = createRoot(this.reactRoot);
  }

  getViewType() {
    return ANNOTATIONS_VIEW_TYPE;
  }

  getDisplayText() {
    return 'Annotations';
  }

  getIcon() {
    return 'highlighter';
  }

  async onOpen() {
    this.addAction('file-text', 'Open reading view', () => {
      this.onSwitchToReaderCallback?.();
    });
    this.render();
  }

  async onClose() {
    this.root.unmount();
  }

  /** Updates annotations without destroying React tree. */
  setAnnotations(items: Annotation[]) {
    if (this.apiRef.current) {
      // Normal path: React tree is alive, update via apiRef
      this.apiRef.current.setAnnotations(items);
    } else {
      // Fallback: apiRef not ready yet — save and re-render with data
      this.pendingAnnotations = items;
      this.render();
    }
  }

  setOnNavigate(callback: (target: NavigationTarget) => void) {
    this.onNavigateCallback = callback;
  }

  setOnSwitchToReader(callback: () => void) {
    this.onSwitchToReaderCallback = callback;
  }

  setOnUpdateAnnotation(callback: (id: string, updates: Partial<Annotation>) => void) {
    this.onUpdateAnnotationCallback = callback;
  }

  setOnDeleteAnnotation(callback: (id: string) => void) {
    this.onDeleteAnnotationCallback = callback;
  }

  private render() {
    // Use pending annotations if available (first call before React mount)
    const initialAnnotations = this.pendingAnnotations ?? [];
    this.root.render(
      React.createElement(
        AppContext.Provider,
        { value: this.app },
        React.createElement(AnnotationsViewInner, {
          annotations: initialAnnotations,
          onNavigate: (target: NavigationTarget) => {
            this.onNavigateCallback?.(target);
          },
          onUpdateAnnotation: (id: string, updates: Partial<Annotation>) => {
            this.onUpdateAnnotationCallback?.(id, updates);
          },
          onDeleteAnnotation: (id: string) => {
            this.onDeleteAnnotationCallback?.(id);
          },
          apiRef: this.apiRef,
        }),
      ),
    );
  }
}
