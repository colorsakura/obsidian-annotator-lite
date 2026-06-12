import React, { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import FoliateViewer from '../viewers/FoliateViewer';
import {
  type Annotation,
  type BookMetadata,
  createAnnotation,
  type OutlineItem,
} from '../types/annotations';
import type { ReaderSectionState } from '../services/ReaderSessionStore';
import { isAnnotatableType, isReaderTargetType } from '../services/TargetResolver';
import { useSessionField } from '../contexts/ReaderStoreContext';
import { useReader } from '../contexts/ReaderAPIContext';
import { useAnnotations, useBatchUpdateAnnotations, annotationKeys } from '../hooks/useAnnotations';
import type { HighlightColor, ReaderFlowMode, ColumnMode } from '../constants';
import SectionIndicator from './SectionIndicator';

export interface ReaderViewInnerProps {
  targetFile: string | null;
  sourcePath: string | null;
  readerFlowMode: ReaderFlowMode;
  columnMode: ColumnMode;
  fontSize: number;
  highlightColors?: HighlightColor[];
}

// ──────────────────────────────────────────
// Inner React component — uses TanStack Query for annotation data.
// Reads navigation from SessionStore via useSessionField.
// ──────────────────────────────────────────
const ReaderViewInner: React.FC<ReaderViewInnerProps> = ({
  targetFile,
  sourcePath,
  readerFlowMode,
  columnMode,
  fontSize,
  highlightColors,
}) => {
  const reader = useReader();
  const bus = reader.bus;
  const queryClient = useQueryClient();

  const navigationTarget = useSessionField('navigationTarget') ?? null;

  const [sectionTarget, setSectionTarget] = useState<{ index: number; nonce: number } | null>(null);
  const [pageTurnTarget, setPageTurnTarget] = useState<{
    direction: 'prev' | 'next';
    nonce: number;
  } | null>(null);
  const [sectionInfo, setSectionInfo] = useState<ReaderSectionState>({
    currentIndex: 0,
    totalSections: 0,
  });

  const targetUri = React.useMemo(() => (targetFile ? `urn:${targetFile}` : null), [targetFile]);

  // TanStack Query: 从缓存加载标注数据
  const { data: annotationsData } = useAnnotations({
    sourcePath,
    targetUri,
  });
  const storeAnnotations = annotationsData ?? [];

  // TanStack Query: 标注持久化 mutation（含乐观更新）
  const batchUpdateMutation = useBatchUpdateAnnotations();

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
      if (!targetUri || !sourcePath) return;
      const annotation = createAnnotation({ ...params, uri: targetUri });

      // 乐观更新：立即写入 QueryClient 缓存
      const currentAnnotations =
        queryClient.getQueryData<Annotation[]>(annotationKeys.byFile(sourcePath)) ?? [];
      const newAnnotations = [...currentAnnotations, annotation];
      queryClient.setQueryData(annotationKeys.byFile(sourcePath), newAnnotations);

      // 异步持久化到 Markdown
      batchUpdateMutation.mutate({
        sourcePath,
        annotations: newAnnotations,
      });
    },
    [targetUri, sourcePath, queryClient, batchUpdateMutation],
  );

  // Delete annotation callback
  const deleteAnnotation = useCallback(
    (id: string) => {
      if (!sourcePath) return;

      // 乐观更新：立即从 QueryClient 缓存中移除
      const currentAnnotations =
        queryClient.getQueryData<Annotation[]>(annotationKeys.byFile(sourcePath)) ?? [];
      const newAnnotations = currentAnnotations.filter((a) => a.id !== id);
      queryClient.setQueryData(annotationKeys.byFile(sourcePath), newAnnotations);

      // 异步持久化到 Markdown
      batchUpdateMutation.mutate({
        sourcePath,
        annotations: newAnnotations,
      });

      // 通知 Controller（用于其他需要知道标注删除的场景）
      reader.deleteAnnotation(id);
    },
    [sourcePath, queryClient, batchUpdateMutation, reader],
  );

  // Determine annotatability from the file extension
  const extension = targetFile ? targetFile.split('.').pop()?.toLowerCase() : undefined;
  const isSupported = extension ? isReaderTargetType(extension) : false;
  const isAnnotatable = extension ? isAnnotatableType(extension) : false;

  // Filter annotations by supported types
  const activeAnnotations = React.useMemo(
    () =>
      isAnnotatable ? storeAnnotations.filter((a) => a.type === 'pdf' || a.type === 'epub') : [],
    [storeAnnotations, isAnnotatable],
  );

  // Section change handler
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

      // 发射位置变化事件（含 CFI）
      if (cfi) {
        bus.emit('view:location-changed', { cfi, sectionIndex: currentIndex });
      }
    },
    [bus],
  );

  // Memoize callbacks to avoid unnecessary re-renders of FoliateViewer
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

  const callbacks = useMemo(
    () => ({
      ...(isAnnotatable
        ? {
            onAddAnnotation: addAnnotation,
            onDeleteAnnotation: deleteAnnotation,
          }
        : {}),
      onOutlineLoaded: handleOutlineLoaded,
      onBookMetadataLoaded: handleBookMetadataLoaded,
      onSectionChange: handleSectionChange,
    }),
    [
      isAnnotatable,
      addAnnotation,
      deleteAnnotation,
      handleOutlineLoaded,
      handleBookMetadataLoaded,
      handleSectionChange,
    ],
  );

  if (!targetFile) {
    return (
      <div className="reader-placeholder">
        No file selected. Open a note with <code>annotation-target</code> in its frontmatter.
      </div>
    );
  }

  if (!extension || !isSupported) {
    return <div className="reader-placeholder">Unsupported file type: {extension}</div>;
  }

  return (
    <FoliateViewer
      key={targetFile}
      target={{
        file: targetFile,
        navigationTarget,
        sectionTarget: sectionTarget?.index ?? null,
        pageTurnTarget,
      }}
      config={{
        flowMode: readerFlowMode,
        columnMode,
        fontSize,
        annotations: activeAnnotations,
        highlightColors,
        sectionIndicator: sectionInfo.totalSections > 0 && (
          <SectionIndicator
            currentIndex={sectionInfo.currentIndex}
            totalSections={sectionInfo.totalSections}
            canGoPrev={sectionInfo.canGoPrev ?? sectionInfo.currentIndex > 0}
            canGoNext={
              sectionInfo.canGoNext ?? sectionInfo.currentIndex < sectionInfo.totalSections - 1
            }
            onPrev={() => {
              if (readerFlowMode === 'paginated') {
                setPageTurnTarget({ direction: 'prev', nonce: Date.now() });
                return;
              }
              setSectionTarget({
                index: Math.max(0, sectionInfo.currentIndex - 1),
                nonce: Date.now(),
              });
            }}
            onNext={() => {
              if (readerFlowMode === 'paginated') {
                setPageTurnTarget({ direction: 'next', nonce: Date.now() });
                return;
              }
              setSectionTarget({
                index: Math.min(sectionInfo.totalSections - 1, sectionInfo.currentIndex + 1),
                nonce: Date.now(),
              });
            }}
          />
        ),
      }}
      callbacks={callbacks}
    />
  );
};

export default ReaderViewInner;
