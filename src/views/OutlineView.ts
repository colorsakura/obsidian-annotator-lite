import React, { useEffect, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { OutlineComponent } from '../components/OutlineComponent';
import { AppContext } from '../hooks/useObsidianApp';
import { type BookMetadata, type NavigationTarget, type OutlineItem } from '../types/annotations';
import { OUTLINE_VIEW_TYPE } from '../constants';

// ──────────────────────────────────────────
// Inner React component — holds state so that setOutline/setBookMetadata
// update React state instead of destroying/recreating the tree.
// ──────────────────────────────────────────
interface OutlineViewApi {
  setOutline: (items: OutlineItem[]) => void;
  setBookMetadata: (metadata: BookMetadata) => void;
}

interface OutlineViewInnerProps {
  items: OutlineItem[];
  bookMetadata: BookMetadata | null;
  onNavigate: (target: NavigationTarget) => void;
  apiRef: React.MutableRefObject<OutlineViewApi | null>;
}

const OutlineViewInner: React.FC<OutlineViewInnerProps> = ({
  items,
  bookMetadata,
  onNavigate,
  apiRef,
}) => {
  const [localItems, setLocalItems] = useState(items);
  const [localMetadata, setLocalMetadata] = useState(bookMetadata);

  // Sync initial props when parent re-renders (fallback path)
  useEffect(() => {
    setLocalItems(items);
  }, [items]);
  useEffect(() => {
    setLocalMetadata(bookMetadata);
  }, [bookMetadata]);

  // Expose imperative API
  useEffect(() => {
    apiRef.current = {
      setOutline: (newItems) => setLocalItems(newItems),
      setBookMetadata: (newMeta) => setLocalMetadata(newMeta),
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);

  return React.createElement(OutlineComponent, {
    items: localItems,
    bookMetadata: localMetadata,
    onNavigate,
  });
};

// ──────────────────────────────────────────
// Obsidian ItemView
// ──────────────────────────────────────────
export class OutlineView extends ItemView {
  private reactRoot: HTMLElement;
  private root: Root;
  private onNavigateCallback: ((target: NavigationTarget) => void) | null = null;
  private onSwitchToReaderCallback: (() => void) | null = null;
  private apiRef: React.MutableRefObject<OutlineViewApi | null> = { current: null };
  /** Pending data that arrived before React mounted. */
  private pendingItems: OutlineItem[] | null = null;
  private pendingMetadata: BookMetadata | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.reactRoot = this.contentEl.createDiv({ cls: 'annotation-outline-container' });
    this.root = createRoot(this.reactRoot);
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

  async onClose() {
    this.root.unmount();
  }

  /** Updates outline items without destroying React tree. */
  setOutline(items: OutlineItem[]) {
    if (this.apiRef.current) {
      this.apiRef.current.setOutline(items);
    } else {
      this.pendingItems = items;
      this.render();
    }
  }

  /** Updates book metadata without destroying React tree. */
  setBookMetadata(metadata: BookMetadata) {
    if (this.apiRef.current) {
      this.apiRef.current.setBookMetadata(metadata);
    } else {
      this.pendingMetadata = metadata;
      this.render();
    }
  }

  setOnNavigate(callback: (target: NavigationTarget) => void) {
    this.onNavigateCallback = callback;
  }

  setOnSwitchToReader(callback: () => void) {
    this.onSwitchToReaderCallback = callback;
  }

  private render() {
    const items = this.pendingItems ?? [];
    const metadata = this.pendingMetadata ?? null;
    this.root.render(
      React.createElement(
        AppContext.Provider,
        { value: this.app },
        React.createElement(OutlineViewInner, {
          items,
          bookMetadata: metadata,
          onNavigate: (target: NavigationTarget) => {
            this.onNavigateCallback?.(target);
          },
          apiRef: this.apiRef,
        }),
      ),
    );
  }
}
