import type { Annotation } from '../types/annotations';
import { createAnnotation } from '../types/annotations';
import type { EngineEventBus, AddAnnotationParams } from './engineTypes';

/**
 * Manages the internal annotation list and syncs overlays with foliate-js.
 * Emits 'annotations-changed' on mutations.
 */
export class AnnotationManager {
  private annotations: Annotation[] = [];

  constructor(private bus: EngineEventBus) {}

  getAnnotations(): Annotation[] {
    return [...this.annotations];
  }

  /** Replace the full annotation list (e.g. on initial load).
   * Also emits 'annotations-changed' event for consistency. */
  setAnnotations(list: Annotation[]): void {
    this.annotations = [...list];
    this.bus.emit('annotations-changed', { annotations: this.getAnnotations() });
  }

  /** Create a new annotation, append it, and emit the change event. */
  addAnnotation(params: AddAnnotationParams, uri?: string): Annotation {
    const annotation = createAnnotation({
      ...params,
      uri: uri ?? '',
    });
    this.annotations = [...this.annotations, annotation];
    this.bus.emit('annotations-changed', { annotations: this.getAnnotations() });
    return annotation;
  }

  /** Remove an annotation by id and emit the change event. */
  deleteAnnotation(id: string): void {
    const index = this.annotations.findIndex((a) => a.id === id);
    if (index === -1) return;
    this.annotations = this.annotations.filter((a) => a.id !== id);
    this.bus.emit('annotations-changed', { annotations: this.getAnnotations() });
  }
}
