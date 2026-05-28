import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ItemView, TFile, type WorkspaceLeaf } from 'obsidian';
import FoliateViewer from '../viewers/FoliateViewer';
import { AppContext } from '../hooks/useObsidianApp';
import {
  type Annotation,
  type BookMetadata,
  createAnnotation,
  type NavigationTarget,
  type OutlineItem,
} from '../types/annotations';
import type { ReaderSectionState } from '../services/ReaderSessionStore';
import { ANNOTATABLE_READER_TYPES, isReaderTargetType } from '../services/TargetResolver';
import { READER_VIEW_TYPE } from '../constants';

type ReaderFlowMode = 'paginated' | 'scrolled';

// ──────────────────────────────────────────
// Inner React component that manages all mutable state internally.
// The outer ItemView only re-creates this component (via root.render())
// when the target file changes; annotation/navigation updates happen
// via React state and do NOT destroy/recreate FoliateViewer.
// ──────────────────────────────────────────
// ──────────────────────────────────────────
// Section indicator component
// ──────────────────────────────────────────
interface SectionIndicatorProps {
  currentIndex: number;
  totalSections: number;
  onPrev: () => void;
  onNext: () => void;
}

const SectionIndicator: React.FC<SectionIndicatorProps> = ({
  currentIndex,
  totalSections,
  onPrev,
  onNext,
}) => {
  // 0-indexed → 1-indexed for display
  const displayIndex = totalSections > 0 ? currentIndex + 1 : 0;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < totalSections - 1;

  return React.createElement(
    'div',
    { className: 'section-indicator' },
    React.createElement(
      'button',
      {
        className: 'section-indicator-btn section-indicator-btn-up',
        onClick: onPrev,
        disabled: !hasPrev,
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
        disabled: !hasNext,
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

interface ReaderViewInnerProps {
  targetFile: string | null;
  sourcePath: string | null;
  initialAnnotations: Annotation[];
  initialNavigationTarget?: NavigationTarget | null;
  readerFlowMode: ReaderFlowMode;
  onOutlineLoaded?: (items: OutlineItem[]) => void;
  onBookMetadataLoaded?: (metadata: BookMetadata) => void;
  onSectionChanged?: (section: ReaderSectionState) => void;
  /** Called when annotations are added/removed/updated by the user */
  onAnnotationsChanged?: (annotations: Annotation[]) => void;
  /** Ref exposed to the parent ItemView for imperative updates */
  apiRef: React.MutableRefObject<ReaderViewApi | null>;
}

interface ReaderViewApi {
  setNavigationTarget: (target: NavigationTarget | null) => void;
  setExternalAnnotations: (annotations: Annotation[] | null) => void;
}

const ReaderViewInner: React.FC<ReaderViewInnerProps> = ({
  targetFile,
  sourcePath,
  initialAnnotations,
  initialNavigationTarget,
  readerFlowMode,
  onOutlineLoaded,
  onBookMetadataLoaded,
  onSectionChanged,
  onAnnotationsChanged,
  apiRef,
}) => {
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | null>(
    initialNavigationTarget ?? null,
  );
  const [sectionTarget, setSectionTarget] = useState<number | null>(null);
  const [sectionInfo, setSectionInfo] = useState<ReaderSectionState>({
    currentIndex: 0,
    totalSections: 0,
  });

  const isApplyingExternalAnnotationsRef = useRef(false);
  const lastNotifiedAnnotationsRef = useRef<Annotation[]>(initialAnnotations);
  const notifyAnnotationsChangedRef = useRef(onAnnotationsChanged);
  notifyAnnotationsChangedRef.current = onAnnotationsChanged;

  const targetUri = React.useMemo(() => (targetFile ? `urn:${targetFile}` : null), [targetFile]);

  useEffect(() => {
    isApplyingExternalAnnotationsRef.current = true;
    lastNotifiedAnnotationsRef.current = initialAnnotations;
    setAnnotations(initialAnnotations);
  }, [initialAnnotations, sourcePath, targetUri]);

  // Expose imperative API to parent
  useEffect(() => {
    apiRef.current = {
      setNavigationTarget: (target) => setNavigationTarget(target),
      setExternalAnnotations: (anns) => {
        const nextAnnotations = anns ?? [];
        isApplyingExternalAnnotationsRef.current = true;
        lastNotifiedAnnotationsRef.current = nextAnnotations;
        setAnnotations(nextAnnotations);
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);

  // Notify parent of annotation changes (debounced by ref comparison)
  useEffect(() => {
    if (isApplyingExternalAnnotationsRef.current) {
      isApplyingExternalAnnotationsRef.current = false;
      return;
    }

    const prev = lastNotifiedAnnotationsRef.current;
    const changed =
      annotations.length !== prev.length ||
      annotations.some((a, i) => a.id !== prev[i]?.id || a.text !== prev[i]?.text);

    if (changed) {
      lastNotifiedAnnotationsRef.current = annotations;
      notifyAnnotationsChangedRef.current?.(annotations);
    }
  }, [annotations]);

  // Add annotation callback
  const addAnnotation = useCallback(
    (params: {
      type: 'pdf' | 'epub';
      cfiRange: string;
      text: string;
      prefix: string;
      suffix: string;
      note?: string;
    }) => {
      if (!targetUri) return;
      const annotation = createAnnotation({
        ...params,
        uri: targetUri,
      });
      setAnnotations((prev) => [...prev, annotation]);
    },
    [targetUri],
  );

  // Determine annotatability from the file extension
  const extension = targetFile ? targetFile.split('.').pop()?.toLowerCase() : undefined;
  const isSupported = extension ? isReaderTargetType(extension) : false;
  const isAnnotatable = extension
    ? ANNOTATABLE_READER_TYPES.some((type) => type === extension)
    : false;

  // Filter annotations by supported types (only when annotatable)
  const activeAnnotations = React.useMemo(
    () => (isAnnotatable ? annotations.filter((a) => a.type === 'pdf' || a.type === 'epub') : []),
    [annotations, isAnnotatable],
  );

  // Section change handler — receives index and total from FoliateViewer
  const handleSectionChange = useCallback(
    (currentIndex: number, totalSections: number, currentLabel?: string) => {
      const section = { currentIndex, totalSections, currentLabel };
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
    file: targetFile,
    annotations: activeAnnotations,
    ...(isAnnotatable ? { onAddAnnotation: addAnnotation } : {}),
    onOutlineLoaded: onOutlineLoaded,
    onBookMetadataLoaded: onBookMetadataLoaded,
    navigationTarget: navigationTarget,
    sectionTarget: sectionTarget,
    flowMode: readerFlowMode,
    onSectionChange: handleSectionChange,
    sectionIndicator:
      sectionInfo.totalSections > 0 &&
      React.createElement(SectionIndicator, {
        currentIndex: sectionInfo.currentIndex,
        totalSections: sectionInfo.totalSections,
        onPrev: () => {
          setSectionTarget(Math.max(0, sectionInfo.currentIndex - 1));
        },
        onNext: () => {
          setSectionTarget(Math.min(sectionInfo.totalSections - 1, sectionInfo.currentIndex + 1));
        },
      }),
  });
};

// ──────────────────────────────────────────
// Obsidian ItemView — only calls root.render() when targetFile changes.
// All other updates (annotations, navigation) flow through the inner
// component's React state, preserving the FoliateViewer DOM.
// ──────────────────────────────────────────
export class ReaderView extends ItemView {
  private targetFile: string | null = null;
  private sourcePath: string | null = null;
  private annotations: Annotation[] = [];
  private initialNavigationTarget: NavigationTarget | null = null;
  private reactRoot: HTMLElement;
  private root: Root;
  private onSwitchToOutlineCallback: (() => void) | null = null;
  private onSwitchToAnnotationsCallback: (() => void) | null = null;
  private onOutlineLoadedCallback: ((items: OutlineItem[]) => void) | null = null;
  private onBookMetadataLoadedCallback: ((metadata: BookMetadata) => void) | null = null;
  private onSectionChangedCallback: ((section: ReaderSectionState) => void) | null = null;
  private onAnnotationsChangedCallback: ((annotations: Annotation[]) => void) | null = null;
  private onCloseCallback: (() => void) | null = null;
  private readerFlowMode: ReaderFlowMode = 'paginated';
  private readerFlowModeAction: HTMLElement | null = null;
  private apiRef: React.MutableRefObject<ReaderViewApi | null> = { current: null };
  /** Pending data that arrived before React mounted. */
  private pendingNavigationTarget: NavigationTarget | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.reactRoot = this.contentEl.createDiv({ cls: 'reader-view-container' });
    this.root = createRoot(this.reactRoot);
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
        viewActions.appendChild(readerFlowModeAction);
        viewActions.appendChild(annotationsAction);
      }
    };
    activeWindow.requestAnimationFrame(setupHeader);
    this.render();
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
    action.setAttribute('title', label);
    action.classList.toggle('is-active', isScrolled);
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

  setOnClose(callback: () => void) {
    this.onCloseCallback = callback;
  }

  /** Navigate to a target — updates React state without destroying FoliateViewer */
  setNavigationTarget(target: NavigationTarget | null) {
    if (this.apiRef.current) {
      this.apiRef.current.setNavigationTarget(target);
    } else {
      this.pendingNavigationTarget = target;
    }
  }

  /** Set external annotations — updates React state without destroying FoliateViewer */
  setExternalAnnotations(annotations: Annotation[] | null) {
    this.annotations = annotations ?? [];
    if (this.apiRef.current) {
      this.apiRef.current.setExternalAnnotations(annotations);
    } else {
      this.render();
    }
  }

  async onClose() {
    this.onCloseCallback?.();
    this.root.unmount();
  }

  /** Change the target file — this DOES trigger a full re-mount via root.render() */
  setTargetFile(
    fileName: string | null,
    sourcePath: string | null,
    annotations: Annotation[] = [],
    initialNavigationTarget?: NavigationTarget | null,
  ) {
    this.targetFile = fileName;
    this.sourcePath = sourcePath;
    this.annotations = annotations;
    this.initialNavigationTarget = initialNavigationTarget ?? null;
    (this.leaf as any)?.updateHeader();
    this.render();
  }

  /** Only called for structural changes (new file).
   *  Annotation/navigation updates flow through apiRef instead. */
  private render() {
    this.root.render(
      React.createElement(
        AppContext.Provider,
        { value: this.app },
        React.createElement(ReaderViewInner, {
          targetFile: this.targetFile,
          sourcePath: this.sourcePath,
          initialAnnotations: this.annotations,
          initialNavigationTarget: this.initialNavigationTarget,
          readerFlowMode: this.readerFlowMode,
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
          apiRef: this.apiRef,
        }),
      ),
    );
  }
}
