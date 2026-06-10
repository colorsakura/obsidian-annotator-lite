import React from 'react';
import type { WorkspaceLeaf } from 'obsidian';
import AnnotationsComponent from '../components/AnnotationsComponent';
import { ANNOTATIONS_VIEW_TYPE } from '../constants';
import { useSessionField } from '../contexts/ReaderStoreContext';
import { useReader } from '../contexts/ReaderAPIContext';
import { BaseReactView } from './BaseReactView';

const AnnotationsViewInner: React.FC = () => {
  const reader = useReader();
  const annotations = useSessionField('annotations') ?? [];

  return React.createElement(AnnotationsComponent, {
    annotations,
    onNavigate: (target) => reader.navigateToTarget(target),
    onUpdateAnnotation: (id, updates) => reader.updateAnnotation(id, updates),
    onDeleteAnnotation: (id) => reader.deleteAnnotation(id),
  });
};

export class AnnotationsView extends BaseReactView<object> {
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
      // Header button — will be wired via useReader() in Phase 2
    });
    this.render();
  }

  protected renderReact() {
    return React.createElement(AnnotationsViewInner);
  }
}
