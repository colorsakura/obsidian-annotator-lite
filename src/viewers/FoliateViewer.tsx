import React, { useCallback, useEffect, useRef } from 'react';
import { useObsidianApp } from '../hooks/useObsidianApp';
import type { Annotation, BookMetadata, NavigationTarget, OutlineItem } from '../types/annotations';
import { isAnnotatableType } from '../services/TargetResolver';
import 'foliate-js/view.js';
import {
  useBookLoader,
  useAnnotationRendering,
  useAnnotationOverlays,
  useContextMenu,
  useNavigationTarget,
  useSectionTarget,
  usePageTurnTarget,
  useRelocateListener,
  useAndroidPatches,
  useFlowMode,
  useColumnMode,
  useFontSize,
  useContentVirtualization,
} from './hooks';
import { installKeyboardNavigation } from './foliate/foliateKeyboard';
import SelectionMenu from '../components/SelectionMenu';
import type { ReaderFlowMode, ColumnMode } from '../constants';

function getAnnotatableType(file: string): 'pdf' | 'epub' | undefined {
  const ext = file.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'epub') return 'epub';
  return undefined;
}

// ─── Props ────────────────────────────────────────────────────────────────
interface ViewerTarget {
  file: string;
  navigationTarget?: NavigationTarget | null;
  sectionTarget?: number | null;
  pageTurnTarget?: { direction: 'prev' | 'next'; nonce: number } | null;
}

interface ViewerConfig {
  flowMode: ReaderFlowMode;
  columnMode: ColumnMode;
  fontSize: number;
  annotations: Annotation[];
  highlightColors?: import('../constants').HighlightColor[];
  sectionIndicator?: React.ReactNode;
}

interface ViewerCallbacks {
  onOutlineLoaded?: (items: OutlineItem[]) => void;
  onBookMetadataLoaded?: (metadata: BookMetadata) => void;
  onSectionChange?: (
    currentIndex: number,
    totalSections: number,
    currentLabel?: string,
    canGoPrev?: boolean,
    canGoNext?: boolean,
    cfi?: string,
  ) => void;
  onAddAnnotation?: (params: {
    type: 'pdf' | 'epub';
    cfiRange: string;
    text: string;
    prefix: string;
    suffix: string;
    note?: string;
    color?: string;
  }) => void;
  onDeleteAnnotation?: (id: string) => void;
}

interface FoliateViewerProps {
  target: ViewerTarget;
  config: ViewerConfig;
  callbacks: ViewerCallbacks;
}

// ─── Component ────────────────────────────────────────────────────────────
const FoliateViewer: React.FC<FoliateViewerProps> = React.memo(({ target, config, callbacks }) => {
  const app = useObsidianApp();
  const containerRef = useRef<HTMLDivElement>(null);

  const { file, navigationTarget, sectionTarget, pageTurnTarget } = target;

  const { flowMode, columnMode, fontSize, annotations, highlightColors, sectionIndicator } = config;

  const {
    onOutlineLoaded,
    onBookMetadataLoaded,
    onSectionChange,
    onAddAnnotation,
    onDeleteAnnotation,
  } = callbacks;

  // ─── Book loader ──────────────────────────────────────────────────────
  const onSectionChangeRef = useRef(onSectionChange);
  onSectionChangeRef.current = onSectionChange;

  const handleSectionChange = useCallback(
    (
      currentIndex: number,
      totalSections: number,
      currentLabel?: string,
      canGoPrev?: boolean,
      canGoNext?: boolean,
      cfi?: string,
    ) => {
      onSectionChangeRef.current?.(
        currentIndex,
        totalSections,
        currentLabel,
        canGoPrev,
        canGoNext,
        cfi,
      );
    },
    [],
  );

  const { view, isLoaded } = useBookLoader(
    containerRef,
    file,
    { flowMode, columnMode, fontSize },
    {
      onOutlineLoaded,
      onBookMetadataLoaded,
      onSectionChanged: handleSectionChange,
    },
  );

  // ─── Android patches ──────────────────────────────────────────────────
  useAndroidPatches(isLoaded);

  // ─── Reader settings ──────────────────────────────────────────────────
  useFlowMode(view, isLoaded, flowMode);
  useColumnMode(view, isLoaded, columnMode);
  useFontSize(view, isLoaded, fontSize);

  // ─── Content virtualization (scrolled mode perf) ─────────────────────
  useContentVirtualization(view, isLoaded);

  // ─── Annotations ──────────────────────────────────────────────────────
  const fileType = getAnnotatableType(file);
  const ext = file.split('.').pop()?.toLowerCase();
  const isAnnotatable = ext ? isAnnotatableType(ext) : false;

  useAnnotationRendering(view, isLoaded, annotations, isAnnotatable);
  useAnnotationOverlays(view, isLoaded, annotations);
  const menuResult = useContextMenu(
    view,
    isLoaded,
    isAnnotatable,
    fileType,
    onAddAnnotation,
    app!,
    containerRef,
    annotations,
    onDeleteAnnotation ?? (() => {}),
    highlightColors,
  );

  // ─── Navigation ───────────────────────────────────────────────────────
  useNavigationTarget(view, navigationTarget ?? null);
  useSectionTarget(view, sectionTarget ?? null);
  usePageTurnTarget(view, pageTurnTarget ?? null);
  useRelocateListener(view, isLoaded, handleSectionChange);

  // ─── Keyboard navigation ──────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isLoaded || !view) return;
    return installKeyboardNavigation(container, () => view);
  }, [isLoaded, view]);

  return (
    <div ref={containerRef} className="foliate-viewer-container" tabIndex={0}>
      {sectionIndicator}
      {menuResult?.menuState && (
        <SelectionMenu
          visible={menuResult.menuState.visible}
          position={menuResult.menuState.position}
          colors={menuResult.menuState.colors}
          existingAnnotation={menuResult.menuState.existingAnnotation}
          onHighlight={menuResult.menuActions.onHighlight}
          onAddNote={menuResult.menuActions.onAddNote}
          onDelete={menuResult.menuActions.onDelete}
          onCopy={menuResult.menuActions.onCopy}
          menuRef={menuResult.menuRef}
        />
      )}
    </div>
  );
});

FoliateViewer.displayName = 'FoliateViewer';

export default FoliateViewer;
