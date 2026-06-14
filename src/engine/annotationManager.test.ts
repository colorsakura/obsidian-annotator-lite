import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnnotationManager } from './annotationManager';
import type { Annotation } from '../types/annotations';
import type { EngineEventBus } from './engineTypes';

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'test-id',
    uri: 'urn:book.epub',
    document: { title: 'Test Book' },
    target: [{ source: 'urn:book.epub', selector: [{ type: 'TextQuoteSelector', exact: 'hello', prefix: '', suffix: '' }] }],
    text: '',
    tags: [],
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
    cfiRange: 'epubcfi(/6/4[chap01]!/4/2/1:0)',
    type: 'epub',
    color: '#ffe066',
    ...overrides,
  };
}

describe('AnnotationManager', () => {
  let bus: EngineEventBus;
  let emitSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    emitSpy = vi.fn();
    bus = { emit: emitSpy as EngineEventBus['emit'] };
  });

  it('starts with empty annotations', () => {
    const mgr = new AnnotationManager(bus);
    expect(mgr.getAnnotations()).toEqual([]);
  });

  it('setAnnotations replaces the list', () => {
    const mgr = new AnnotationManager(bus);
    const anns = [makeAnnotation({ id: 'a1' }), makeAnnotation({ id: 'a2' })];
    mgr.setAnnotations(anns);
    expect(mgr.getAnnotations()).toHaveLength(2);
  });

  it('addAnnotation appends and emits annotations-changed', () => {
    const mgr = new AnnotationManager(bus);
    mgr.setAnnotations([makeAnnotation({ id: 'existing' })]);

    const added = mgr.addAnnotation({
      type: 'epub',
      cfiRange: 'epubcfi(/6/4[chap02]!/4/2/1:0)',
      text: 'selected text',
      prefix: 'before',
      suffix: 'after',
      color: '#ff6b6b',
    });

    expect(added.id).toBeTruthy();
    expect(mgr.getAnnotations()).toHaveLength(2);
    expect(emitSpy).toHaveBeenCalledWith('annotations-changed', {
      annotations: mgr.getAnnotations(),
    });
  });

  it('deleteAnnotation removes by id and emits', () => {
    const mgr = new AnnotationManager(bus);
    const ann = makeAnnotation({ id: 'to-delete' });
    mgr.setAnnotations([ann]);

    mgr.deleteAnnotation('to-delete');

    expect(mgr.getAnnotations()).toHaveLength(0);
    expect(emitSpy).toHaveBeenCalledWith('annotations-changed', {
      annotations: [],
    });
  });

  it('deleteAnnotation is no-op for unknown id', () => {
    const mgr = new AnnotationManager(bus);
    mgr.setAnnotations([makeAnnotation({ id: 'a1' })]);
    emitSpy.mockClear();

    mgr.deleteAnnotation('nonexistent');

    expect(mgr.getAnnotations()).toHaveLength(1);
    expect(emitSpy).not.toHaveBeenCalled();
  });
});
