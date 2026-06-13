import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useObsidianApp } from '../hooks/useObsidianApp';
import type { Annotation, BookMetadata, OutlineItem } from '../types/annotations';
import { createAnnotation } from '../types/annotations';
import { isAnnotatableType } from '../services/TargetResolver';
import { useSessionField } from '../contexts/ReaderStoreContext';
import { useReader } from '../contexts/ReaderAPIContext';
import { useAnnotations, useBatchUpdateAnnotations, annotationKeys } from '../hooks/useAnnotations';
import type { ReaderSectionState } from '../services/ReaderSessionStore';
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
  useFlowMode,
  useColumnMode,
  useFontSize,
} from './hooks';
import { installKeyboardNavigation } from './foliate/foliateKeyboard';
import SelectionMenu from '../components/SelectionMenu';
import SectionIndicator from '../components/SectionIndicator';
import type { ReaderFlowMode, ColumnMode, HighlightColor } from '../constants';
import { DEFAULT_HIGHLIGHT_COLORS } from '../constants';

// ─── Helpers ─────────────────────────────────────────────────────────────

function getAnnotatableType(file: string): 'pdf' | 'epub' | undefined {
  const ext = file.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'epub') return 'epub';
  return undefined;
}

// ─── Types ───────────────────────────────────────────────────────────────

interface AnnotationAddParams {
  type: 'pdf' | 'epub';
  cfiRange: string;
  text: string;
  prefix: string;
  suffix: string;
  note?: string;
  color?: string;
}

interface FoliateViewerProps {
  /** 目标文件路径（EPUB/PDF） */
  file: string;
  /** 源 Markdown 路径（用于标注持久化） */
  sourcePath: string;

  /** 阅读模式，默认 'paginated' */
  flowMode?: ReaderFlowMode;
  /** 分栏模式，默认 'double' */
  columnMode?: ColumnMode;
  /** 字体大小百分比，默认 100 */
  fontSize?: number;
  /** 高亮颜色列表，默认 DEFAULT_HIGHLIGHT_COLORS */
  highlightColors?: HighlightColor[];

  /** 自定义标注添加行为（覆盖默认的乐观更新 + 持久化） */
  onAnnotationAdd?: (params: AnnotationAddParams) => void;
  /** 自定义标注删除行为（覆盖默认的乐观更新 + 持久化） */
  onAnnotationDelete?: (id: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────

/**
 * FoliateViewer — foliate-js 阅读器的 React 封装。
 *
 * 内部管理：
 * - 导航目标（从 SessionStore 读取 navigationTarget）
 * - 章节状态（sectionInfo）和 SectionIndicator 渲染
 * - 标注数据加载（TanStack Query）和 CRUD（乐观更新 + 持久化）
 * - 事件总线通信（outline/metadata/section/location 变化）
 *
 * 最简用法只需 file + sourcePath，其他一切有合理默认值。
 */
const FoliateViewer: React.FC<FoliateViewerProps> = React.memo(
  ({
    file,
    sourcePath,
    flowMode = 'paginated',
    columnMode = 'double',
    fontSize = 100,
    highlightColors = DEFAULT_HIGHLIGHT_COLORS,
    onAnnotationAdd,
    onAnnotationDelete,
  }) => {
    const app = useObsidianApp();
    const containerRef = useRef<HTMLDivElement>(null);
    const queryClient = useQueryClient();
    const reader = useReader();
    const bus = reader.bus;

    // ─── SessionStore 订阅 ────────────────────────────────────────────────
    const navigationTarget = useSessionField('navigationTarget') ?? null;

    // ─── 章节状态（内部管理）─────────────────────────────────────────────
    const [sectionInfo, setSectionInfo] = useState<ReaderSectionState>({
      currentIndex: 0,
      totalSections: 0,
    });
    const [sectionTarget, setSectionTarget] = useState<{ index: number; nonce: number } | null>(
      null,
    );
    const [pageTurnTarget, setPageTurnTarget] = useState<{
      direction: 'prev' | 'next';
      nonce: number;
    } | null>(null);

    // ─── 标注数据（TanStack Query）────────────────────────────────────────
    const targetUri = useMemo(() => `urn:${file}`, [file]);
    const { data: annotationsData } = useAnnotations({ sourcePath, targetUri });
    const annotations = annotationsData ?? [];
    const batchUpdateMutation = useBatchUpdateAnnotations();

    // ─── 标注 CRUD（默认行为：乐观更新 + 持久化）─────────────────────────
    const defaultAddAnnotation = useCallback(
      (params: AnnotationAddParams) => {
        const annotation = createAnnotation({ ...params, uri: targetUri });
        const current =
          queryClient.getQueryData<Annotation[]>(annotationKeys.byFile(sourcePath)) ?? [];
        const next = [...current, annotation];
        queryClient.setQueryData(annotationKeys.byFile(sourcePath), next);
        batchUpdateMutation.mutate({ sourcePath, annotations: next });
      },
      [targetUri, sourcePath, queryClient, batchUpdateMutation],
    );

    const defaultDeleteAnnotation = useCallback(
      (id: string) => {
        const current =
          queryClient.getQueryData<Annotation[]>(annotationKeys.byFile(sourcePath)) ?? [];
        const next = current.filter((a) => a.id !== id);
        queryClient.setQueryData(annotationKeys.byFile(sourcePath), next);
        batchUpdateMutation.mutate({ sourcePath, annotations: next });
      },
      [sourcePath, queryClient, batchUpdateMutation],
    );

    const handleAddAnnotation = onAnnotationAdd ?? defaultAddAnnotation;
    const handleDeleteAnnotation = onAnnotationDelete ?? defaultDeleteAnnotation;

    // ─── 事件路由（View → Controller）─────────────────────────────────────
    const handleOutlineLoaded = useCallback(
      (items: OutlineItem[]) => {
        bus.emit('view:outline-loaded', { items });
      },
      [bus],
    );

    const handleBookMetadataLoaded = useCallback(
      (metadata: BookMetadata) => {
        bus.emit('view:metadata-loaded', { metadata });
      },
      [bus],
    );

    const handleSectionChange = useCallback(
      (
        currentIndex: number,
        totalSections: number,
        currentLabel?: string,
        canGoPrev?: boolean,
        canGoNext?: boolean,
        cfi?: string,
      ) => {
        const section = {
          currentIndex,
          totalSections,
          currentLabel,
          canGoPrev: canGoPrev ?? currentIndex > 0,
          canGoNext: canGoNext ?? currentIndex < totalSections - 1,
        };
        setSectionInfo(section);
        bus.emit('view:section-changed', { section });
        if (cfi) {
          bus.emit('view:location-changed', { cfi, sectionIndex: currentIndex });
        }
      },
      [bus],
    );

    // ─── Book loader ──────────────────────────────────────────────────────
    const handleSectionChangeRef = useRef(handleSectionChange);
    handleSectionChangeRef.current = handleSectionChange;

    const stableSectionChange = useCallback(
      (
        currentIndex: number,
        totalSections: number,
        currentLabel?: string,
        canGoPrev?: boolean,
        canGoNext?: boolean,
        cfi?: string,
      ) => {
        handleSectionChangeRef.current(
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
        onOutlineLoaded: handleOutlineLoaded,
        onBookMetadataLoaded: handleBookMetadataLoaded,
        onSectionChanged: stableSectionChange,
      },
    );

    // ─── Reader settings ──────────────────────────────────────────────────
    useFlowMode(view, isLoaded, flowMode);
    useColumnMode(view, isLoaded, columnMode);
    useFontSize(view, isLoaded, fontSize);

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
      handleAddAnnotation,
      app!,
      containerRef,
      annotations,
      handleDeleteAnnotation,
      highlightColors,
    );

    // ─── Navigation ───────────────────────────────────────────────────────
    useNavigationTarget(view, navigationTarget ?? null);
    useSectionTarget(view, sectionTarget?.index ?? null);
    usePageTurnTarget(view, pageTurnTarget ?? null);
    useRelocateListener(view, isLoaded, stableSectionChange);

    // ─── Keyboard navigation ──────────────────────────────────────────────
    useEffect(() => {
      const container = containerRef.current;
      if (!container || !isLoaded || !view) return;
      return installKeyboardNavigation(container, () => view);
    }, [isLoaded, view]);

    // ─── SectionIndicator 导航 ────────────────────────────────────────────
    const handlePrev = useCallback(() => {
      if (flowMode === 'paginated') {
        setPageTurnTarget({ direction: 'prev', nonce: Date.now() });
      } else {
        setSectionTarget((prev) => ({
          index: Math.max(0, (prev?.index ?? sectionInfo.currentIndex) - 1),
          nonce: Date.now(),
        }));
      }
    }, [flowMode, sectionInfo.currentIndex]);

    const handleNext = useCallback(() => {
      if (flowMode === 'paginated') {
        setPageTurnTarget({ direction: 'next', nonce: Date.now() });
      } else {
        setSectionTarget((prev) => ({
          index: Math.min(
            sectionInfo.totalSections - 1,
            (prev?.index ?? sectionInfo.currentIndex) + 1,
          ),
          nonce: Date.now(),
        }));
      }
    }, [flowMode, sectionInfo]);

    // ─── Render ───────────────────────────────────────────────────────────
    return (
      <div ref={containerRef} className="foliate-viewer-container" tabIndex={0}>
        {sectionInfo.totalSections > 0 && (
          <SectionIndicator
            currentIndex={sectionInfo.currentIndex}
            totalSections={sectionInfo.totalSections}
            canGoPrev={sectionInfo.canGoPrev ?? sectionInfo.currentIndex > 0}
            canGoNext={
              sectionInfo.canGoNext ?? sectionInfo.currentIndex < sectionInfo.totalSections - 1
            }
            onPrev={handlePrev}
            onNext={handleNext}
          />
        )}
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
  },
);

FoliateViewer.displayName = 'FoliateViewer';

export default FoliateViewer;
