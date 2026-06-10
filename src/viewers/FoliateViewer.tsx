import React, { useCallback, useEffect, useRef } from 'react';
import { useObsidianApp } from '../hooks/useObsidianApp';
import type { Annotation, BookMetadata, NavigationTarget, OutlineItem } from '../types/annotations';
import { ANNOTATABLE_READER_TYPES } from '../services/TargetResolver';
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
} from './hooks';
import { installKeyboardNavigation } from './foliate/foliateKeyboard';
import SelectionMenu from '../components/SelectionMenu';

// ─── Types ────────────────────────────────────────────────────────────────
type ReaderFlowMode = 'paginated' | 'scrolled';
type ColumnMode = 'single' | 'double';

function getAnnotatableType(file: string): 'pdf' | 'epub' | undefined {
  const ext = file.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'epub') return 'epub';
  return undefined;
}

// ─── Props ────────────────────────────────────────────────────────────────
interface FoliateViewerProps {
  file: string;
  annotations: Annotation[];
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
  highlightColors?: import('../constants').HighlightColor[];
  onOutlineLoaded?: (items: OutlineItem[]) => void;
  onBookMetadataLoaded?: (metadata: BookMetadata) => void;
  navigationTarget?: NavigationTarget | null;
  sectionTarget?: number | null;
  flowMode: ReaderFlowMode;
  columnMode: ColumnMode;
  fontSize: number;
  pageTurnTarget?: { direction: 'prev' | 'next'; nonce: number } | null;
  onSectionChange?: (
    currentIndex: number,
    totalSections: number,
    currentLabel?: string,
    canGoPrev?: boolean,
    canGoNext?: boolean,
  ) => void;
  sectionIndicator?: React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────
const FoliateViewer: React.FC<FoliateViewerProps> = ({
  file,
  annotations,
  onAddAnnotation,
  onDeleteAnnotation,
  highlightColors,
  onOutlineLoaded,
  onBookMetadataLoaded,
  navigationTarget,
  sectionTarget,
  pageTurnTarget,
  flowMode,
  columnMode,
  fontSize,
  onSectionChange,
  sectionIndicator,
}) => {
  const app = useObsidianApp();
  const containerRef = useRef<HTMLDivElement>(null);

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
    ) => {
      onSectionChangeRef.current?.(
        currentIndex, totalSections, currentLabel, canGoPrev, canGoNext,
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

  // ─── Annotations ──────────────────────────────────────────────────────
  const fileType = getAnnotatableType(file);
  const isAnnotatable = ANNOTATABLE_READER_TYPES.some(
    (type) => type === file.split('.').pop()?.toLowerCase(),
  );

  useAnnotationRendering(view, isLoaded, annotations, isAnnotatable);
  useAnnotationOverlays(view, isLoaded, annotations);
  const menuResult = useContextMenu(
    view, isLoaded, isAnnotatable, fileType, onAddAnnotation,
    app!, containerRef, annotations, onDeleteAnnotation ?? (() => {}),
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
          menuRef={menuResult.menuRef}
        />
      )}
    </div>
  );
};

export default FoliateViewer;
