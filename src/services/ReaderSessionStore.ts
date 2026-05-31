import type { Annotation, BookMetadata, NavigationTarget, OutlineItem } from '../types/annotations';

export type ReaderTargetType = 'pdf' | 'epub' | 'mobi' | 'azw3' | 'fb2' | 'fbz' | 'cbz';

export interface ReaderTarget {
  sourcePath: string;
  targetPath: string;
  targetUri: string;
  type: ReaderTargetType;
}

export interface ReaderSectionState {
  currentIndex: number;
  totalSections: number;
  currentLabel?: string;
  canGoPrev?: boolean;
  canGoNext?: boolean;
}

export interface ReaderSessionState {
  target: ReaderTarget;
  annotations: Annotation[];
  outline: OutlineItem[];
  metadata: BookMetadata | null;
  section: ReaderSectionState;
  navigationTarget: NavigationTarget | null;
}

export type ReaderSessionListener = (state: ReaderSessionState | null) => void;

export class ReaderSessionStore {
  private state: ReaderSessionState | null = null;
  private listeners: Set<ReaderSessionListener> = new Set();

  getSnapshot(): ReaderSessionState | null {
    return this.state;
  }

  subscribe(listener: ReaderSessionListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  startSession(target: ReaderTarget, annotations: Annotation[]): void {
    this.state = {
      target,
      annotations,
      outline: [],
      metadata: null,
      section: {
        currentIndex: 0,
        totalSections: 0,
      },
      navigationTarget: null,
    };
    this.notify();
  }

  clearSession(): void {
    this.state = null;
    this.notify();
  }

  setAnnotations(annotations: Annotation[]): void {
    this.update({ annotations });
  }

  setOutline(outline: OutlineItem[]): void {
    this.update({ outline });
  }

  setMetadata(metadata: BookMetadata): void {
    this.update({ metadata });
  }

  setSection(section: ReaderSectionState): void {
    this.update({ section });
  }

  setNavigationTarget(target: NavigationTarget | null): void {
    this.update({ navigationTarget: target });
  }

  private update(updates: Partial<ReaderSessionState>): void {
    if (!this.state) return;
    this.state = { ...this.state, ...updates };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
