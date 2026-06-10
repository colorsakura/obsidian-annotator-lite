import React from 'react';
import { TFile, type WorkspaceLeaf } from 'obsidian';
import { READER_VIEW_TYPE, type ReaderFlowMode, type ColumnMode } from '../constants';
import { BaseReactView } from './BaseReactView';
import { getReaderAPI } from '../contexts/ReaderAPIContext';
import ReaderViewInner from '../components/ReaderViewInner';
import { setupReaderHeader, type ReaderHeaderHandle } from './readerHeader';

const READER_FONT_SIZE_MIN = 80;
const READER_FONT_SIZE_MAX = 160;
const READER_FONT_SIZE_STEP = 10;

// ──────────────────────────────────────────
// Obsidian ItemView (extends BaseReactView)
// ──────────────────────────────────────────
export class ReaderView extends BaseReactView<object> {
  /** Public for multi-reader lookup by ViewCoordinator. */
  targetFile: string | null = null;
  sourcePath: string | null = null;
  highlightColors: import('../constants').HighlightColor[] | undefined;

  private readerFlowMode: ReaderFlowMode = 'paginated';
  private columnMode: ColumnMode = 'double';
  private fontSize = 100;
  private headerHandle: ReaderHeaderHandle | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf, 'reader-view-container');
    this.contentEl.style.position = 'relative';
  }

  getViewType() {
    return READER_VIEW_TYPE;
  }

  getDisplayText() {
    if (!this.targetFile) return 'Reader';
    const name = this.targetFile.split('/').pop() ?? this.targetFile;
    const dotIndex = name.lastIndexOf('.');
    return dotIndex > 0 ? name.substring(0, dotIndex) : name;
  }

  async onOpen() {
    this.headerHandle = setupReaderHeader(this, {
      toggleReaderFlowMode: () => this.toggleReaderFlowMode(),
      toggleColumnMode: () => this.toggleColumnMode(),
      decreaseFontSize: () => this.decreaseFontSize(),
      increaseFontSize: () => this.increaseFontSize(),
      toggleOutline: () => getReaderAPI()?.toggleOutline(),
      toggleAnnotations: () => getReaderAPI()?.toggleAnnotations(),
      goBack: () => {
        if (this.sourcePath) {
          const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
          if (file instanceof TFile) {
            this.leaf.openFile(file, { state: { mode: 'preview' } });
          }
        }
      },
    });
    this.render();
  }

  async onClose() {
    getReaderAPI()?.closeSession();
    await super.onClose();
  }

  private toggleReaderFlowMode() {
    this.readerFlowMode = this.readerFlowMode === 'scrolled' ? 'paginated' : 'scrolled';
    this.headerHandle?.update(this.readerFlowMode, this.columnMode, this.fontSize);
    this.render();
  }

  private toggleColumnMode() {
    this.columnMode = this.columnMode === 'single' ? 'double' : 'single';
    this.headerHandle?.update(this.readerFlowMode, this.columnMode, this.fontSize);
    this.render();
  }

  private decreaseFontSize() {
    const nextSize = Math.max(READER_FONT_SIZE_MIN, this.fontSize - READER_FONT_SIZE_STEP);
    if (nextSize === this.fontSize) return;
    this.fontSize = nextSize;
    this.headerHandle?.update(this.readerFlowMode, this.columnMode, this.fontSize);
    this.render();
  }

  private increaseFontSize() {
    const nextSize = Math.min(READER_FONT_SIZE_MAX, this.fontSize + READER_FONT_SIZE_STEP);
    if (nextSize === this.fontSize) return;
    this.fontSize = nextSize;
    this.headerHandle?.update(this.readerFlowMode, this.columnMode, this.fontSize);
    this.render();
  }

  /** Change the target file — triggers a full re-mount via render() */
  setTargetFile(fileName: string | null, sourcePath: string | null) {
    this.targetFile = fileName;
    this.sourcePath = sourcePath;
    (this.leaf as any)?.updateHeader();
    this.render();
  }

  protected renderReact() {
    return React.createElement(ReaderViewInner, {
      targetFile: this.targetFile,
      readerFlowMode: this.readerFlowMode,
      columnMode: this.columnMode,
      fontSize: this.fontSize,
      highlightColors: this.highlightColors,
    });
  }
}
