import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VirtualScrollManager } from '../VirtualScrollManager';
import { DEFAULT_VIRTUAL_SCROLL_CONFIG } from '../types';

/**
 * 模拟 IntersectionObserver
 * ViewportObserver 在构造时创建 IntersectionObserver，需要全局 stub
 */
const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();

vi.stubGlobal(
  'IntersectionObserver',
  class MockIntersectionObserver implements IntersectionObserver {
    root: Element | Document | null = null;
    rootMargin = '';
    scrollMargin = '';
    thresholds: ReadonlyArray<number> = [];

    constructor(_callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.root = options?.root ?? null;
      this.rootMargin = options?.rootMargin ?? '0px';
      this.thresholds = Array.isArray(options?.threshold)
        ? options.threshold
        : [options?.threshold ?? 0];
    }

    observe = mockObserve;
    unobserve = mockUnobserve;
    disconnect = mockDisconnect;

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
);

describe('VirtualScrollManager', () => {
  let manager: VirtualScrollManager;
  let mockDoc: Document;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc = document.implementation.createHTMLDocument();

    // jsdom 不支持布局计算，mock getBoundingClientRect 以返回 style.height
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const styleHeight = this.style.height;
      const height = styleHeight ? parseFloat(styleHeight) : 0;
      return {
        top: 0,
        right: 0,
        bottom: height,
        left: 0,
        width: 0,
        height,
        x: 0,
        y: 0,
        toJSON() {},
      };
    });

    manager = new VirtualScrollManager(mockDoc, DEFAULT_VIRTUAL_SCROLL_CONFIG);
  });

  it('should initialize with document', () => {
    expect(manager).toBeDefined();
  });

  it('should split document into blocks', () => {
    const body = mockDoc.body;
    for (let i = 0; i < 5; i++) {
      const p = mockDoc.createElement('p');
      p.textContent = `Paragraph ${i}`;
      p.style.height = '200px';
      body.appendChild(p);
    }

    manager.initialize();
    expect(manager.getBlockCount()).toBeGreaterThan(0);
  });

  it('should handle block visibility changes', () => {
    const body = mockDoc.body;
    const p = mockDoc.createElement('p');
    p.style.height = '200px';
    body.appendChild(p);

    manager.initialize();
    const blockId = 0;

    manager.handleBlockLeave(blockId);
    expect(manager.getBlockState(blockId)).toBe('cached');

    manager.handleBlockEnter(blockId);
    expect(manager.getBlockState(blockId)).toBe('rendered');
  });

  it('should cleanup on destroy', () => {
    manager.destroy();
    expect(manager.getBlockCount()).toBe(0);
  });
});
