import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelectionDetector } from './selectionDetector';
import type { EngineEventBus } from './engineTypes';
import type { Annotation } from '../types/annotations';

describe('SelectionDetector', () => {
  let bus: EngineEventBus;
  let emitSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    emitSpy = vi.fn();
    bus = { emit: emitSpy as EngineEventBus['emit'] };
  });

  it('findOverlappingAnnotation returns undefined when no match', () => {
    const detector = new SelectionDetector(bus);
    const result = detector.findOverlappingAnnotation(
      'epubcfi(/6/4[chap01]!/4/2/1:0)',
      [],
    );
    expect(result).toBeUndefined();
  });

  it('findOverlappingAnnotation returns matching annotation by cfiRange', () => {
    const detector = new SelectionDetector(bus);
    const ann: Annotation = {
      id: 'a1',
      uri: 'urn:book.epub',
      document: { title: 'Test' },
      target: [],
      text: '',
      tags: [],
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
      cfiRange: 'epubcfi(/6/4[chap01]!/4/2/1:0)',
      type: 'epub',
    };

    const result = detector.findOverlappingAnnotation(
      'epubcfi(/6/4[chap01]!/4/2/1:0)',
      [ann],
    );
    expect(result).toBe(ann);
  });

  it('findOverlappingAnnotation returns undefined for non-matching cfi', () => {
    const detector = new SelectionDetector(bus);
    const ann: Annotation = {
      id: 'a1',
      uri: 'urn:book.epub',
      document: { title: 'Test' },
      target: [],
      text: '',
      tags: [],
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
      cfiRange: 'epubcfi(/6/4[chap01]!/4/2/1:0)',
      type: 'epub',
    };

    const result = detector.findOverlappingAnnotation(
      'epubcfi(/6/4[chap02]!/4/2/1:0)',
      [ann],
    );
    expect(result).toBeUndefined();
  });
});
