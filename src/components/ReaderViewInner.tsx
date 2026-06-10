import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { HighlightColor, ReaderFlowMode, ColumnMode } from '../constants';
import SectionIndicator from './SectionIndicator';

export interface ReaderViewInnerProps {
  targetFile: string | null;
  readerFlowMode: ReaderFlowMode;
  columnMode: ColumnMode;
  fontSize: number;
  highlightColors?: HighlightColor[];
}

// ──────────────────────────────────────────
// Inner React component — reads annotations/navigation from SessionStore.
// Uses useReader() to emit events to Controller via EventBus.
// ──────────────────────────────────────────
const ReaderViewInner: React.FC<ReaderViewInnerProps> = ({
  targetFile,
  readerFlowMode,
  columnMode,
  fontSize,
  highlightColors,
}) => {
  const reader = useReader();
  const bus = reader.bus;

  const storeAnnotations = useSessionField('annotations') ?? [];
  const navigationTarget = useSessionField('navigationTarget') ?? null;

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
  // vs from the user (local). This prevents the annotations-changed event
  // from firing when the store pushes back the same data we just sent.
  const isStoreUpdateRef = useRef(false);
  const lastNotifiedAnnotationsRef = useRef<Annotation[]>(storeAnnotations);

  const targetUri = React.useMemo(() => (targetFile ? `urn:${targetFile}` : null), [targetFile]);

  // Sync local annotations when store changes (external updates)
  useEffect(() => {
    isStoreUpdateRef.current = true;
    lastNotifiedAnnotationsRef.current = storeAnnotations;
    setLocalAnnotations(storeAnnotations);
  }, [storeAnnotations]);

  // Notify Controller of annotation changes (user-added annotations) via EventBus
  useEffect(() => {
    if (isStoreUpdateRef.current) {
      isStoreUpdateRef.current = false;
      return;
    }

    const prev = lastNotifiedAnnotationsRef.current;
    const changed =
      localAnnotations.length !== prev.length ||
      localAnnotations.some((a, i) => a.id !== prev[i]?.id || a.text !== prev[i]?.text);

    if (changed) {
      lastNotifiedAnnotationsRef.current = localAnnotations;
      bus.emit('view:annotations-changed', { annotations: localAnnotations });
    }
  }, [localAnnotations, bus]);

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
      reader.deleteAnnotation(id);
    },
    [reader],
  );

  // Determine annotatability from the file extension
  const extension = targetFile ? targetFile.split('.').pop()?.toLowerCase() : undefined;
  const isSupported = extension ? isReaderTargetType(extension) : false;
  const isAnnotatable = extension ? isAnnotatableType(extension) : false;

  // Filter annotations by supported types
  const activeAnnotations = React.useMemo(
    () =>
      isAnnotatable ? localAnnotations.filter((a) => a.type === 'pdf' || a.type === 'epub') : [],
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
      bus.emit('view:section-changed', { section });
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
