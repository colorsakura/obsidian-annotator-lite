import { describe, it, expect, beforeEach } from 'vitest';
import { AnnotationCache } from '../AnnotationCache';
import { CachedAnnotation } from '../types';

describe('AnnotationCache', () => {
  let cache: AnnotationCache;
  let mockAnnotation: CachedAnnotation;

  beforeEach(() => {
    cache = new AnnotationCache();
    mockAnnotation = {
      id: 'anno-1',
      range: new Range(),
      color: '#ffeb3b',
      text: 'test annotation',
      blockId: 0,
    };
  });

  it('should cache and retrieve annotations by block', () => {
    cache.set(mockAnnotation);
    const annotations = cache.getByBlock(0);
    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toBe(mockAnnotation);
  });

  it('should return empty array for non-existent block', () => {
    expect(cache.getByBlock(999)).toHaveLength(0);
  });

  it('should delete annotation', () => {
    cache.set(mockAnnotation);
    cache.delete('anno-1');
    expect(cache.getByBlock(0)).toHaveLength(0);
  });

  it('should clear all annotations', () => {
    cache.set(mockAnnotation);
    cache.clear();
    expect(cache.getByBlock(0)).toHaveLength(0);
  });

  it('should get annotation by id', () => {
    cache.set(mockAnnotation);
    expect(cache.get('anno-1')).toBe(mockAnnotation);
  });
});
