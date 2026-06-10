import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TFile, type WorkspaceLeaf } from 'obsidian';
import FoliateViewer from '../viewers/FoliateViewer';
import {
  type Annotation,
  type BookMetadata,
  createAnnotation,
  type OutlineItem,
} from '../types/annotations';
import type { ReaderSectionState } from '../services/ReaderSessionStore';
import { ANNOTATABLE_READER_TYPES, isReaderTargetType } from '../services/TargetResolver';
import { READER_VIEW_TYPE } from '../constants';
import { useSessionStore } from '../contexts/ReaderStoreContext';
import { BaseReactView } from './BaseReactView';

type ReaderFlowMode = 'paginated' | 'scrolled';
type ColumnMode = 'single' | 'double';

const READER_FONT_SIZE_MIN = 80;
const READER_FONT_SIZE_MAX = 160;
const READER_FONT_SIZE_STEP = 10;

// ──────────────────────────────────────────
// Section indicator component
// ──────────────────────────────────────────
interface SectionIndicatorProps {
  currentIndex: number;
  totalSections: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

const SectionIndicator: React.FC<SectionIndicatorProps> = ({
  currentIndex,
  totalSections,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
}) => {
  const displayIndex = totalSections > 0 ? currentIndex + 1 : 0;

  return React.createElement(
    'div',
    { className: 'section-indicator' },
    React.createElement(
      'button',
      {
        className: 'section-indicator-btn section-indicator-btn-up',
        onClick: onPrev,
        disabled: !canGoPrev,
        'aria-label': '上一章',
      },
      React.createElement(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: '16',
          height: '16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '2',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        React.createElement('polyline', { points: '18 15 12 9 6 15' }),
      ),
    ),
    React.createElement(
      'div',
      { className: 'section-indicator-label' },
      `${displayIndex} / ${totalSections}`,
    ),
    React.createElement(
      'button',
      {
        className: 'section-indicator-btn section-indicator-btn-down',
        onClick: onNext,
        disabled: !canGoNext,
        'aria-label': '下一章',
      },
      React.createElement(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: '16',
          height: '16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '2',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        React.createElement('polyline', { points: '6 9 12 15 18 9' }),
      ),
    ),
  );
};

// ──────────────────────────────────────────
// Inner React component — reads annotations/navigation from SessionStore.
// ──────────────────────────────────────────
interface ReaderViewInnerProps {
  targetFile: string | null;
  readerFlowMode: ReaderFlowMode;
  columnMode: ColumnMode;
  fontSize: number;
  onOutlineLoaded?: (items: OutlineItem[]) => void;
  onBookMetadataLoaded?: (metadata: BookMetadata) => void;
  onSectionChanged?: (section: ReaderSectionState) => void;
  /** Called when annotations are added by the user in FoliateViewer */
  onAnnotationsChanged?: (annotations: Annotation[]) => void;
  highlightColors?: import('../constants').HighlightColor[];
  onDeleteAnnotation?: (id: string) => void;
}

const ReaderViewInner: React.FC<ReaderViewInnerProps> = ({
  targetFile,
  readerFlowMode,
  columnMode,
  fontSize,
  onOutlineLoaded,
  onBookMetadataLoaded,
  onSectionChanged,
  onAnnotationsChanged,
  highlightColors,
  onDeleteAnnotation,
}) => {
  const session = useSessionStore();
  const storeAnnotations = session?.annotations ?? [];
  const navigationTarget = session?.navigationTarget ?? null;

  const [localAnnotations, setLocalAnnotations] = useState<Annotation[]>(storeAnnotations);
  const [sectionTarget, setSectionTarget] = useState<{ index: number; nonce: number } | null>(null);
  const [pageTurnTarget, setPageTurnTarget] = useState<{
    direction: 'prev' | 'next';
    nonce: number;
  } | null>(null);
  const [sectionInfo, setSectionInfo] = useState<ReaderSectionState>({
    currentIndex: 0,
    totalSections: 0,
  });

  // Track whether the last annotation change came from the store (external)
  // vs from the user (local). This prevents the onAnnotationsChanged callback
  // from firing when the store pushes back the same data we just sent.
  const isStoreUpdateRef = useRef(false);
  const lastNotifiedAnnotationsRef = useRef<Annotation[]>(storeAnnotations);
  const notifyAnnotationsChangedRef = useRef(onAnnotationsChanged);
  notifyAnnotationsChangedRef.current = onAnnotationsChanged;

  const targetUri = React.useMemo(
    () => (targetFile ? `urn:${targetFile}` : null),
    [targetFile],
  );

  // Sync local annotations when store changes (external updates)
  useEffect(() => {
    isStoreUpdateRef.current = true;
    lastNotifiedAnnotationsRef.current = storeAnnotations;
    setLocalAnnotations(storeAnnotations);
  }, [storeAnnotations]);

  // Notify parent of annotation changes (user-added annotations)
  useEffect(() => {
    if (isStoreUpdateRef.current) {
      isStoreUpdateRef.current = false;
      return;
    }

    const prev = lastNotifiedAnnotationsRef.current;
    const changed =
      localAnnotations.length !== prev.length ||
      localAnnotations.some(
        (a, i) => a.id !== prev[i]?.id || a.text !== prev[i]?.text,
      );

    if (changed) {
      lastNotifiedAnnotationsRef.current = localAnnotations;
      notifyAnnotationsChangedRef.current?.(localAnnotations);
    }
  }, [localAnnotations]);

  // Add annotation callback (user highlights text in FoliateViewer)
  const addAnnotation = useCallback(
    (params: {
      type: 'pdf' | 'epub';
      cfiRange: string;
      text: string;
      prefix: string;
      suffix: string;
      note?: string;
      color?: string;
    }) => {
      if (!targetUri) return;
      const annotation = createAnnotation({ ...params, uri: targetUri });
      setLocalAnnotations((prev) => [...prev, annotation]);
    },
    [targetUri],
  );

  // Delete annotation callback
  const deleteAnnotation = useCallback(
    (id: string) => {
      setLocalAnnotations((prev) => prev.filter((a) => a.id !== id));
      onDeleteAnnotation?.(id);
    },
    [onDeleteAnnotation],
  );

  // Determine annotatability from the file extension
  const extension = targetFile
    ? targetFile.split('.').pop()?.toLowerCase()
    : undefined;
  const isSupported = extension ? isReaderTargetType(extension) : false;
  const isAnnotatable = extension
    ? ANNOTATABLE_READER_TYPES.some((type) => type === extension)
    : false;

  // Filter annotations by supported types
  const activeAnnotations = React.useMemo(
    () =>
      isAnnotatable
        ? localAnnotations.filter((a) => a.type === 'pdf' || a.type === 'epub')
        : [],
    [localAnnotations, isAnnotatable],
  );

  // Section change handler
  const handleSectionChange = useCallback(
    (
      currentIndex: number,
      totalSections: number,
      currentLabel?: string,
      canGoPrev?: boolean,
      canGoNext?: boolean,
    ) => {
      const section = {
        currentIndex,
        totalSections,
        currentLabel,
        canGoPrev: canGoPrev ?? currentIndex > 0,
        canGoNext: canGoNext ?? currentIndex < totalSections - 1,
      };
      setSectionInfo(section);
      onSectionChanged?.(section);
    },
    [onSectionChanged],
  );

  if (!targetFile) {
    return React.createElement(
      'div',
      { className: 'reader-placeholder' },
      'No file selected. Open a note with ',
      React.createElement('code', null, 'annotation-target'),
      ' in its frontmatter.',
    );
  }

  if (!extension || !isSupported) {
    return React.createElement(
      'div',
      { className: 'reader-placeholder' },
      'Unsupported file type: ',
      extension,
    );
  }

  return React.createElement(FoliateViewer, {
    key: targetFile,
    file: targetFile,
    annotations: activeAnnotations,
    ...(isAnnotatable ? {
      onAddAnnotation: addAnnotation,
      onDeleteAnnotation: deleteAnnotation,
    } : {}),
    highlightColors,
    onOutlineLoaded,
    onBookMetadataLoaded,
    navigationTarget,
    sectionTarget: sectionTarget?.index ?? null,
    pageTurnTarget,
    flowMode: readerFlowMode,
    columnMode,
    fontSize,
    onSectionChange: handleSectionChange,
    sectionIndicator:
      sectionInfo.totalSections > 0 &&
      React.createElement(SectionIndicator, {
        currentIndex: sectionInfo.currentIndex,
        totalSections: sectionInfo.totalSections,
        canGoPrev: sectionInfo.canGoPrev ?? sectionInfo.currentIndex > 0,
        canGoNext:
          sectionInfo.canGoNext ??
          sectionInfo.currentIndex < sectionInfo.totalSections - 1,
        onPrev: () => {
          if (readerFlowMode === 'paginated') {
            setPageTurnTarget({ direction: 'prev', nonce: Date.now() });
            return;
          }
          setSectionTarget({
            index: Math.max(0, sectionInfo.currentIndex - 1),
            nonce: Date.now(),
          });
        },
        onNext: () => {
          if (readerFlowMode === 'paginated') {
            setPageTurnTarget({ direction: 'next', nonce: Date.now() });
            return;
          }
          setSectionTarget({
            index: Math.min(
              sectionInfo.totalSections - 1,
              sectionInfo.currentIndex + 1,
            ),
            nonce: Date.now(),
          });
        },
      }),
  });
};

// ──────────────────────────────────────────
// Obsidian ItemView (extends BaseReactView)
// ──────────────────────────────────────────
export class ReaderView extends BaseReactView<object> {
  /** Public for multi-reader lookup by ViewCoordinator. */
  targetFile: string | null = null;
  sourcePath: string | null = null;
  private onSwitchToOutlineCallback: (() => void) | null = null;
  private onSwitchToAnnotationsCallback: (() => void) | null = null;
  private onOutlineLoadedCallback: ((items: OutlineItem[]) => void) | null = null;
  private onBookMetadataLoadedCallback: ((metadata: BookMetadata) => void) | null = null;
  private onSectionChangedCallback: ((section: ReaderSectionState) => void) | null = null;
  private onAnnotationsChangedCallback: ((annotations: Annotation[]) => void) | null = null;
  private onDeleteAnnotationCallback: ((id: string) => void) | null = null;
  private onCloseCallback: (() => void) | null = null;
  private highlightColors: import('../constants').HighlightColor[] | undefined;
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
      this.onSwitchToOutlineCallback?.();
    });
    const annotationsAction = this.addAction('highlighter', 'Open annotations', () => {
      this.onSwitchToAnnotationsCallback?.();
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
    this.onCloseCallback?.();
    await super.onClose();
  }

  setOnSwitchToOutline(callback: () => void) {
    this.onSwitchToOutlineCallback = callback;
  }

  setOnSwitchToAnnotations(callback: () => void) {
    this.onSwitchToAnnotationsCallback = callback;
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

  setOnOutlineLoaded(callback: (items: OutlineItem[]) => void) {
    this.onOutlineLoadedCallback = callback;
  }

  setOnBookMetadataLoaded(callback: (metadata: BookMetadata) => void) {
    this.onBookMetadataLoadedCallback = callback;
  }

  setOnSectionChanged(callback: (section: ReaderSectionState) => void) {
    this.onSectionChangedCallback = callback;
  }

  setOnAnnotationsChanged(callback: (annotations: Annotation[]) => void) {
    this.onAnnotationsChangedCallback = callback;
  }

  setOnDeleteAnnotation(callback: (id: string) => void) {
    this.onDeleteAnnotationCallback = callback;
  }

  setHighlightColors(colors: import('../constants').HighlightColor[] | undefined) {
    this.highlightColors = colors;
    this.render();
  }

  setOnClose(callback: () => void) {
    this.onCloseCallback = callback;
  }

  /** Change the target file — triggers a full re-mount via render() */
  setTargetFile(
    fileName: string | null,
    sourcePath: string | null,
  ) {
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
      onOutlineLoaded: (items: OutlineItem[]) => {
        this.onOutlineLoadedCallback?.(items);
      },
      onBookMetadataLoaded: (metadata: BookMetadata) => {
        this.onBookMetadataLoadedCallback?.(metadata);
      },
      onSectionChanged: (section: ReaderSectionState) => {
        this.onSectionChangedCallback?.(section);
      },
      onAnnotationsChanged: (annotations: Annotation[]) => {
        this.onAnnotationsChangedCallback?.(annotations);
      },
      onDeleteAnnotation: (id: string) => {
        this.onDeleteAnnotationCallback?.(id);
      },
      highlightColors: this.highlightColors,
    });
  }
}
