import React from 'react';
import type { WorkspaceLeaf } from 'obsidian';
import AnnotationsComponent from '../components/AnnotationsComponent';
import { ANNOTATIONS_VIEW_TYPE } from '../constants';
import { useSessionField } from '../contexts/ReaderStoreContext';
import { useReader } from '../contexts/ReaderAPIContext';
import { useAnnotations } from '../hooks/useAnnotations';
import { BaseReactView } from './BaseReactView';

const AnnotationsViewInner: React.FC = () => {
  const reader = useReader();
  const target = useSessionField('target');
  const sourcePath = target?.sourcePath ?? null;
  const targetUri = target?.targetUri ?? null;

  const { data: annotationsData } = useAnnotations({
    sourcePath,
    targetUri,
    enabled: !!sourcePath,
  });
  const annotations = annotationsData ?? [];

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
    this.render();
  }

  protected renderReact() {
    return React.createElement(AnnotationsViewInner);
  }
}
