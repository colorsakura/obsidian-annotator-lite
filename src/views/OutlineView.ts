import React from 'react';
import type { WorkspaceLeaf } from 'obsidian';
import { OutlineComponent } from '../components/OutlineComponent';
import { OUTLINE_VIEW_TYPE } from '../constants';
import { useSessionField } from '../contexts/ReaderStoreContext';
import { useReader } from '../contexts/ReaderAPIContext';
import { BaseReactView } from './BaseReactView';
import { t } from '../i18n';

const OutlineViewInner: React.FC = () => {
  const reader = useReader();
  const items = useSessionField('outline') ?? [];
  const bookMetadata = useSessionField('metadata') ?? null;
  const bookmarks = useSessionField('bookmarks') ?? [];

  return React.createElement(OutlineComponent, {
    items,
    bookMetadata,
    bookmarks,
    onNavigate: (target) => reader.navigateToTarget(target),
    onDeleteBookmark: (id) => {
      void reader.deleteBookmark(id);
    },
  });
};

export class OutlineView extends BaseReactView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf, 'annotation-outline-container');
  }

  getViewType() {
    return OUTLINE_VIEW_TYPE;
  }
  getDisplayText() {
    return t('outline.viewName');
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
