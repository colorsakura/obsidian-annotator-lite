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

/**
 * 性能测试：验证虚拟滚动在大文档和快速滚动场景下的效率
 */
describe('Virtual Scroll Performance', () => {
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
  });

  it('should handle large documents efficiently', () => {
    const body = mockDoc.body;

    for (let i = 0; i < 1000; i++) {
      const p = mockDoc.createElement('p');
      p.textContent = `Paragraph ${i}`;
      p.style.height = '50px';
      body.appendChild(p);
    }

    const startTime = performance.now();

    const manager = new VirtualScrollManager(mockDoc, DEFAULT_VIRTUAL_SCROLL_CONFIG);
    manager.initialize();

    const endTime = performance.now();
    const initTime = endTime - startTime;

    expect(initTime).toBeLessThan(100);
    expect(manager.getBlockCount()).toBeGreaterThan(0);

    manager.destroy();
  });

  it('should maintain performance during rapid scrolling', () => {
    const body = mockDoc.body;

    for (let i = 0; i < 100; i++) {
      const p = mockDoc.createElement('p');
      p.textContent = `Paragraph ${i}`;
      p.style.height = '100px';
      body.appendChild(p);
    }

    const manager = new VirtualScrollManager(mockDoc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 1000,
    });

    manager.initialize();

    const startTime = performance.now();

    const blockCount = manager.getBlockCount();
    for (let i = 0; i < 50; i++) {
      const blockId = i % blockCount;
      manager.handleBlockLeave(blockId);
      manager.handleBlockEnter(blockId);
    }

    const endTime = performance.now();
    const scrollTime = endTime - startTime;

    expect(scrollTime).toBeLessThan(50);

    manager.destroy();
  });

  it('should handle repeated leave/enter cycles on many blocks without degradation', () => {
    const body = mockDoc.body;

    for (let i = 0; i < 500; i++) {
      const p = mockDoc.createElement('p');
      p.textContent = `Paragraph ${i}`;
      p.style.height = '50px';
      body.appendChild(p);
    }

    const manager = new VirtualScrollManager(mockDoc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 500,
    });

    manager.initialize();
    const blockCount = manager.getBlockCount();
    expect(blockCount).toBeGreaterThan(5);

    // 多轮滚动：每轮对所有区块执行 leave → enter 循环
    const rounds = 5;
    const startTime = performance.now();

    for (let round = 0; round < rounds; round++) {
      for (let blockId = 0; blockId < blockCount; blockId++) {
        manager.handleBlockLeave(blockId);
      }
      for (let blockId = 0; blockId < blockCount; blockId++) {
        manager.handleBlockEnter(blockId);
      }
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    // 5 轮完整 leave/enter 循环，每轮遍历所有区块
    // 即使在 jsdom 中也应保持在 200ms 以内
    expect(totalTime).toBeLessThan(200);

    manager.destroy();
  });

  it('should keep destroy fast even after heavy usage', () => {
    const body = mockDoc.body;

    for (let i = 0; i < 200; i++) {
      const p = mockDoc.createElement('p');
      p.textContent = `Paragraph ${i}`;
      p.style.height = '100px';
      body.appendChild(p);
    }

    const manager = new VirtualScrollManager(mockDoc, DEFAULT_VIRTUAL_SCROLL_CONFIG);
    manager.initialize();

    // 模拟一些滚动操作
    const blockCount = manager.getBlockCount();
    for (let i = 0; i < 20; i++) {
      const blockId = i % blockCount;
      manager.handleBlockLeave(blockId);
    }

    const startTime = performance.now();
    manager.destroy();
    const endTime = performance.now();
    const destroyTime = endTime - startTime;

    // 销毁操作应始终快速完成
    expect(destroyTime).toBeLessThan(50);
  });
});
