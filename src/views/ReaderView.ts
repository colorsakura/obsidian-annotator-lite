import React from 'react';
import { TFile, type WorkspaceLeaf } from 'obsidian';
import { READER_VIEW_TYPE } from '../constants';
import { BaseReactView } from './BaseReactView';
import { getReaderAPI } from '../contexts/ReaderAPIContext';
import ReaderViewInner from '../components/ReaderViewInner';
import type { ReaderFlowMode, ColumnMode } from '../components/ReaderViewInner';

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
  private readerFlowModeAction: HTMLElement | null = null;
  private columnMode: ColumnMode = 'double';
  private columnModeAction: HTMLElement | null = null;
  private fontSize = 100;
  private decreaseFontSizeAction: HTMLElement | null = null;
  private increaseFontSizeAction: HTMLElement | null = null;

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
    const outlineAction = this.addAction('list-tree', 'Open outline', () => {
      const api = getReaderAPI();
      api?.toggleOutline();
    });
    const annotationsAction = this.addAction('highlighter', 'Open annotations', () => {
      const api = getReaderAPI();
      api?.toggleAnnotations();
    });
    const readerFlowModeAction = this.addAction('scroll-text', '切换滚动模式', () => {
      this.toggleReaderFlowMode();
    });
    this.readerFlowModeAction = readerFlowModeAction;
    this.updateReaderFlowModeAction();
    const decreaseFontSizeAction = this.addAction('zoom-out', '减小字体', () => {
      this.decreaseFontSize();
    });
    this.decreaseFontSizeAction = decreaseFontSizeAction;
    const increaseFontSizeAction = this.addAction('zoom-in', '增大字体', () => {
      this.increaseFontSize();
    });
    this.increaseFontSizeAction = increaseFontSizeAction;
    this.updateFontSizeActions();
    const columnModeAction = this.addAction('columns', '切换为单列', () => {
      this.toggleColumnMode();
    });
    this.columnModeAction = columnModeAction;
    this.updateColumnModeAction();
    const comebackAction = this.addAction('left-arrow', '返回笔记', () => {
      if (this.sourcePath) {
        const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
        if (file instanceof TFile) {
          this.leaf.openFile(file, { state: { mode: 'preview' } });
        }
      }
    });
    const setupHeader = () => {
      const header = outlineAction.closest('.view-header');
      if (!header) return;
      const navButtons = header.querySelector('.view-header-nav-buttons');
      navButtons?.remove();
      const leftGroup = header.querySelector('.view-header-left');
      if (leftGroup) {
        leftGroup.prepend(comebackAction);
        leftGroup.prepend(outlineAction);
      } else {
        header.prepend(outlineAction);
      }
      const viewActions = header.querySelector('.view-actions');
      if (viewActions) {
        viewActions.appendChild(decreaseFontSizeAction);
        viewActions.appendChild(increaseFontSizeAction);
        viewActions.appendChild(columnModeAction);
        viewActions.appendChild(readerFlowModeAction);
        viewActions.appendChild(annotationsAction);
      }
    };
    activeWindow.requestAnimationFrame(setupHeader);
    this.render();
  }

  async onClose() {
    const api = getReaderAPI();
    api?.closeSession();
    await super.onClose();
  }

  private toggleReaderFlowMode() {
    this.readerFlowMode = this.readerFlowMode === 'scrolled' ? 'paginated' : 'scrolled';
    this.updateReaderFlowModeAction();
    this.render();
  }

  private updateReaderFlowModeAction() {
    const action = this.readerFlowModeAction;
    if (!action) return;
    const isScrolled = this.readerFlowMode === 'scrolled';
    const label = isScrolled ? '切换到分页模式' : '切换到滚动模式';
    action.setAttribute('aria-label', label);
    action.classList.toggle('is-active', isScrolled);
  }

  private toggleColumnMode() {
    this.columnMode = this.columnMode === 'single' ? 'double' : 'single';
    this.updateColumnModeAction();
    this.render();
  }

  private updateColumnModeAction() {
    const action = this.columnModeAction;
    if (!action) return;
    const isSingle = this.columnMode === 'single';
    const label = isSingle ? '切换为双列' : '切换为单列';
    action.setAttribute('aria-label', label);
    action.classList.toggle('is-active', isSingle);
  }

  private decreaseFontSize() {
    const nextSize = Math.max(READER_FONT_SIZE_MIN, this.fontSize - READER_FONT_SIZE_STEP);
    if (nextSize === this.fontSize) return;
    this.fontSize = nextSize;
    this.updateFontSizeActions();
    this.render();
  }

  private increaseFontSize() {
    const nextSize = Math.min(READER_FONT_SIZE_MAX, this.fontSize + READER_FONT_SIZE_STEP);
    if (nextSize === this.fontSize) return;
    this.fontSize = nextSize;
    this.updateFontSizeActions();
    this.render();
  }

  private updateFontSizeActions() {
    this.updateFontSizeAction(
      this.decreaseFontSizeAction,
      '减小字体',
      this.fontSize <= READER_FONT_SIZE_MIN,
    );
    this.updateFontSizeAction(
      this.increaseFontSizeAction,
      '增大字体',
      this.fontSize >= READER_FONT_SIZE_MAX,
    );
  }

  private updateFontSizeAction(action: HTMLElement | null, label: string, disabled: boolean) {
    if (!action) return;
    action.setAttribute('aria-label', `${label}（当前 ${this.fontSize}%）`);
    action.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    action.classList.toggle('is-disabled', disabled);
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
