import type { App } from 'obsidian';
import { ANNOTATIONS_VIEW_TYPE, AnnotationsView } from '../views/AnnotationsView';
import { OUTLINE_VIEW_TYPE, OutlineView } from '../views/OutlineView';
import { READER_VIEW_TYPE, ReaderView } from '../views/ReaderView';

export interface ViewCoordinator {
  openReader(): Promise<ReaderView | null>;
  revealReader(): void;

  openOutline(): Promise<OutlineView | null>;
  toggleOutline(): Promise<void>;

  openAnnotations(): Promise<AnnotationsView | null>;
  toggleAnnotations(): Promise<void>;

  closeCompanionViews(): void;

  getReaderView(): ReaderView | null;
  getOutlineView(): OutlineView | null;
  getAnnotationsView(): AnnotationsView | null;
}

export class ObsidianViewCoordinator implements ViewCoordinator {
  constructor(private app: App) {}

  async openReader(): Promise<ReaderView | null> {
    let leaf = this.app.workspace.getLeavesOfType(READER_VIEW_TYPE)[0];

    if (!leaf) {
      const centerLeaf = this.app.workspace.getLeaf(false);
      if (centerLeaf) {
        await centerLeaf.setViewState({
          type: READER_VIEW_TYPE,
          active: true,
        });
        leaf = centerLeaf;
      }
    }

    if (leaf) {
      this.app.workspace.revealLeaf(leaf);
    }

    return leaf?.view instanceof ReaderView ? leaf.view : null;
  }

  revealReader(): void {
    const leaf = this.app.workspace.getLeavesOfType(READER_VIEW_TYPE)[0];
    if (leaf) {
      this.app.workspace.revealLeaf(leaf);
    }
  }

  async openOutline(): Promise<OutlineView | null> {
    let leaf = this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE)[0];

    if (!leaf) {
      const leftLeaf = this.app.workspace.getLeftLeaf(false);
      if (leftLeaf) {
        await leftLeaf.setViewState({
          type: OUTLINE_VIEW_TYPE,
          active: true,
        });
        leaf = leftLeaf;
      }
    }

    if (leaf) {
      this.app.workspace.revealLeaf(leaf);
    }

    return leaf?.view instanceof OutlineView ? leaf.view : null;
  }

  async toggleOutline(): Promise<void> {
    const leaf = this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE)[0];
    if (leaf?.getRoot()) {
      leaf.detach();
      return;
    }

    await this.openOutline();
  }

  async openAnnotations(): Promise<AnnotationsView | null> {
    let leaf = this.app.workspace.getLeavesOfType(ANNOTATIONS_VIEW_TYPE)[0];

    if (!leaf) {
      const rightLeaf = this.app.workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: ANNOTATIONS_VIEW_TYPE,
          active: true,
        });
        leaf = rightLeaf;
      }
    }

    if (leaf) {
      this.app.workspace.revealLeaf(leaf);
    }

    return leaf?.view instanceof AnnotationsView ? leaf.view : null;
  }

  async toggleAnnotations(): Promise<void> {
    const leaf = this.app.workspace.getLeavesOfType(ANNOTATIONS_VIEW_TYPE)[0];
    if (leaf?.getRoot()) {
      leaf.detach();
      return;
    }

    await this.openAnnotations();
  }

  closeCompanionViews(): void {
    this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE)[0]?.detach();
    this.app.workspace.getLeavesOfType(ANNOTATIONS_VIEW_TYPE)[0]?.detach();
  }

  getReaderView(): ReaderView | null {
    const leaf = this.app.workspace.getLeavesOfType(READER_VIEW_TYPE)[0];
    return leaf?.view instanceof ReaderView ? leaf.view : null;
  }

  getOutlineView(): OutlineView | null {
    const leaf = this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE)[0];
    return leaf?.view instanceof OutlineView ? leaf.view : null;
  }

  getAnnotationsView(): AnnotationsView | null {
    const leaf = this.app.workspace.getLeavesOfType(ANNOTATIONS_VIEW_TYPE)[0];
    return leaf?.view instanceof AnnotationsView ? leaf.view : null;
  }
}
