import React from 'react';
import type { WorkspaceLeaf } from 'obsidian';
import AnnotationsComponent from '../components/AnnotationsComponent';
import type { Annotation, NavigationTarget } from '../types/annotations';
import { ANNOTATIONS_VIEW_TYPE } from '../constants';
import { useSessionStore } from '../contexts/ReaderStoreContext';
import { BaseReactView } from './BaseReactView';

// ──────────────────────────────────────────
// Inner React component — reads annotations directly from SessionStore.
// ──────────────────────────────────────────
interface AnnotationsViewInnerProps {
  onNavigate: (target: NavigationTarget) => void;
  onUpdateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  onDeleteAnnotation: (id: string) => void;
}

const AnnotationsViewInner: React.FC<AnnotationsViewInnerProps> = ({
  onNavigate,
  onUpdateAnnotation,
  onDeleteAnnotation,
}) => {
  const session = useSessionStore();
  const annotations = session?.annotations ?? [];

  return React.createElement(AnnotationsComponent, {
    annotations,
    onNavigate,
    onUpdateAnnotation,
    onDeleteAnnotation,
  });
};

// ──────────────────────────────────────────
// Obsidian ItemView (extends BaseReactView)
// ──────────────────────────────────────────
export class AnnotationsView extends BaseReactView<object> {
  private onNavigateCallback: ((target: NavigationTarget) => void) | null = null;
  private onSwitchToReaderCallback: (() => void) | null = null;
  private onUpdateAnnotationCallback:
    ((id: string, updates: Partial<Annotation>) => void) | null = null;
  private onDeleteAnnotationCallback: ((id: string) => void) | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf, 'annotation-annotations-container');
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

  // setAnnotations — no longer needed, store drives updates

  setOnNavigate(callback: (target: NavigationTarget) => void) {
    this.onNavigateCallback = callback;
    this.render();
  }

  setOnSwitchToReader(callback: () => void) {
    this.onSwitchToReaderCallback = callback;
  }

  setOnUpdateAnnotation(callback: (id: string, updates: Partial<Annotation>) => void) {
    this.onUpdateAnnotationCallback = callback;
    this.render();
  }

  setOnDeleteAnnotation(callback: (id: string) => void) {
    this.onDeleteAnnotationCallback = callback;
    this.render();
  }

  protected renderReact() {
    return React.createElement(AnnotationsViewInner, {
      onNavigate: (target: NavigationTarget) => {
        this.onNavigateCallback?.(target);
      },
      onUpdateAnnotation: (id: string, updates: Partial<Annotation>) => {
        this.onUpdateAnnotationCallback?.(id, updates);
      },
      onDeleteAnnotation: (id: string) => {
        this.onDeleteAnnotationCallback?.(id);
      },
    });
  }
}
