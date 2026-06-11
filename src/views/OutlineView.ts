import React from 'react';
import type { WorkspaceLeaf } from 'obsidian';
import { OutlineComponent } from '../components/OutlineComponent';
import { OUTLINE_VIEW_TYPE } from '../constants';
import { useSessionField } from '../contexts/ReaderStoreContext';
import { useReader } from '../contexts/ReaderAPIContext';
import { BaseReactView } from './BaseReactView';

const OutlineViewInner: React.FC = () => {
  const reader = useReader();
  const items = useSessionField('outline') ?? [];
  const bookMetadata = useSessionField('metadata') ?? null;

  return React.createElement(OutlineComponent, {
    items,
    bookMetadata,
    onNavigate: (target) => reader.navigateToTarget(target),
  });
};

export class OutlineView extends BaseReactView<object> {
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
    this.render();
  }

  protected renderReact() {
    return React.createElement(OutlineViewInner);
  }
}
