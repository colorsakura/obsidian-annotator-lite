import type { App, WorkspaceLeaf } from 'obsidian';
import { AnnotationsView } from '../views/AnnotationsView';
import { OutlineView } from '../views/OutlineView';
import { ReaderView } from '../views/ReaderView';
import { ANNOTATIONS_VIEW_TYPE, OUTLINE_VIEW_TYPE, READER_VIEW_TYPE } from '../constants';

export interface ViewCoordinator {
  /**
   * Open or reuse a reader view.
   *
   * When `targetLeaf` is provided, that leaf is converted to a reader view
   * (replacing the Markdown view that triggered "Annotate").
   *
   * When omitted, reuses an existing reader leaf or creates one via
   * `getLeaf(false)` (the default "replace current pane" behaviour).
   */
  openReader(targetLeaf?: WorkspaceLeaf): Promise<ReaderView | null>;
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
  constructor(
    private app: App,
    /** 侧边栏切换前回调（用于激活 ResizeObserver 防抖） */
    private onBeforeToggle?: () => void,
  ) {}

  async openReader(targetLeaf?: WorkspaceLeaf): Promise<ReaderView | null> {
    let leaf: WorkspaceLeaf | undefined;

    if (targetLeaf) {
      await targetLeaf.setViewState({
        type: READER_VIEW_TYPE,
        active: true,
      });
      leaf = targetLeaf;
    } else {
      leaf = this.app.workspace.getLeavesOfType(READER_VIEW_TYPE)[0];

      if (!leaf) {
        const newLeaf = this.app.workspace.getLeaf(false);
        if (newLeaf) {
          await newLeaf.setViewState({
            type: READER_VIEW_TYPE,
            active: true,
          });
          leaf = newLeaf;
        }
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
      this.onBeforeToggle?.();
      leaf.detach();
      return;
    }

    this.onBeforeToggle?.();
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
      this.onBeforeToggle?.();
      leaf.detach();
      return;
    }

    this.onBeforeToggle?.();
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
