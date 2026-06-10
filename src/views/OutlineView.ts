import React from 'react';
import type { WorkspaceLeaf } from 'obsidian';
import { OutlineComponent } from '../components/OutlineComponent';
import type { NavigationTarget } from '../types/annotations';
import { OUTLINE_VIEW_TYPE } from '../constants';
import { useSessionStore } from '../contexts/ReaderStoreContext';
import { BaseReactView } from './BaseReactView';

// ──────────────────────────────────────────
// Inner React component — reads outline/metadata directly from SessionStore.
// ──────────────────────────────────────────
interface OutlineViewInnerProps {
  onNavigate: (target: NavigationTarget) => void;
}

const OutlineViewInner: React.FC<OutlineViewInnerProps> = ({ onNavigate }) => {
  const session = useSessionStore();
  const items = session?.outline ?? [];
  const bookMetadata = session?.metadata ?? null;

  return React.createElement(OutlineComponent, {
    items,
    bookMetadata,
    onNavigate,
  });
};

// ──────────────────────────────────────────
// Obsidian ItemView (extends BaseReactView)
// ──────────────────────────────────────────
export class OutlineView extends BaseReactView<object> {
  private onNavigateCallback: ((target: NavigationTarget) => void) | null = null;
  private onSwitchToReaderCallback: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf, 'annotation-outline-container');
  }

  getViewType() {
    return OUTLINE_VIEW_TYPE;
  }

  getDisplayText() {
    return 'Outline';
  }

  getIcon() {
    return 'list-tree';
  }

  async onOpen() {
    this.addAction('file-text', 'Open reading view', () => {
      this.onSwitchToReaderCallback?.();
    });
    this.render();
  }

  setOnNavigate(callback: (target: NavigationTarget) => void) {
    this.onNavigateCallback = callback;
    // Re-render to pick up new callback
    this.render();
  }

  setOnSwitchToReader(callback: () => void) {
    this.onSwitchToReaderCallback = callback;
  }

  // setOutline / setBookMetadata — no longer needed, store drives updates

  protected renderReact() {
    return React.createElement(OutlineViewInner, {
      onNavigate: (target: NavigationTarget) => {
        this.onNavigateCallback?.(target);
      },
    });
  }
}
