import type { Annotation, OutlineItem, BookMetadata, PendingSelection } from '../types/annotations';
import type { ReaderSectionState } from '../services/ReaderSessionStore';
import type { ReaderFlowMode, ColumnMode, HighlightColor } from '../constants';

/** Events emitted by ReaderEngine */
export interface EngineEventMap {
  'outline-loaded': { items: OutlineItem[] };
  'metadata-loaded': { metadata: BookMetadata };
  'section-changed': { section: ReaderSectionState };
  'annotations-changed': { annotations: Annotation[] };
  'location-changed': { cfi: string; sectionIndex: number };
  selection: {
    selection: PendingSelection;
    existingAnnotation?: Annotation;
    position: { x: number; y: number };
  };
}

/** Minimal bus interface the engine depends on */
export interface EngineEventBus {
  emit<K extends keyof EngineEventMap>(event: K, payload: EngineEventMap[K]): void;
}

/** Reader display settings */
export interface ReaderSettings {
  flowMode: ReaderFlowMode;
  columnMode: ColumnMode;
  fontSize: number;
}

/** Options for engine.open() */
export interface OpenOptions {
  settings?: Partial<ReaderSettings>;
  highlightColors?: HighlightColor[];
}

/** Params for engine.addAnnotation() */
export interface AddAnnotationParams {
  type: 'pdf' | 'epub';
  cfiRange: string;
  text: string;
  prefix: string;
  suffix: string;
  note?: string;
  color?: string;
}

/** Engine lifecycle state */
export type EngineState = 'idle' | 'loading' | 'ready' | 'closed';
