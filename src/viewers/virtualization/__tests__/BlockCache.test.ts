import { describe, it, expect, beforeEach } from 'vitest';
import { BlockCache } from '../BlockCache';

describe('BlockCache', () => {
  let cache: BlockCache;
  let mockElements: Node[];

  beforeEach(() => {
    cache = new BlockCache({ maxSize: 3 });
    const doc = document.implementation.createHTMLDocument();
    mockElements = [
      doc.createElement('p'),
      doc.createElement('div'),
    ];
  });

  it('should cache and retrieve block elements', () => {
    cache.set(0, mockElements);
    expect(cache.get(0)).toBe(mockElements);
  });

  it('should return undefined for non-existent blocks', () => {
    expect(cache.get(999)).toBeUndefined();
  });

  it('should evict oldest entries when full', () => {
    cache.set(0, mockElements);
    cache.set(1, mockElements);
    cache.set(2, mockElements);
    cache.set(3, mockElements);

    expect(cache.get(0)).toBeUndefined();
    expect(cache.get(3)).toBeDefined();
  });

  it('should delete entries', () => {
    cache.set(0, mockElements);
    cache.delete(0);
    expect(cache.get(0)).toBeUndefined();
  });

  it('should clear all entries', () => {
    cache.set(0, mockElements);
    cache.set(1, mockElements);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
