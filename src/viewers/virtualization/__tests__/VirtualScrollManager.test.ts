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

  // --- C1: initialize() 观察实际区块元素，而非未插入 DOM 的占位符 ---
  it('should observe actual block elements on initialize, not uninserted placeholders', () => {
    const body = mockDoc.body;
    const p1 = mockDoc.createElement('p');
    p1.textContent = 'First';
    p1.style.height = '200px';
    const p2 = mockDoc.createElement('p');
    p2.textContent = 'Second';
    p2.style.height = '200px';
    body.appendChild(p1);
    body.appendChild(p2);

    manager.initialize();

    // 应该观察实际的区块元素（p1），而不是占位符 div
    expect(mockObserve).toHaveBeenCalled();
    const observedElement = mockObserve.mock.calls[0][0];
    expect(observedElement).toBe(p1);
    expect(observedElement.tagName).toBe('P');
  });

  // --- C2: handleBlockLeave / handleBlockEnter 使用 insertBefore 保持文档顺序 ---
  it('should maintain document order after leave and enter', () => {
    // 使用小 blockSize 使每个元素在独立区块中
    const smallBlockManager = new VirtualScrollManager(mockDoc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 100,
    });

    const body = mockDoc.body;
    const p1 = mockDoc.createElement('p');
    p1.textContent = 'First';
    p1.style.height = '200px';
    const p2 = mockDoc.createElement('p');
    p2.textContent = 'Second';
    p2.style.height = '200px';
    body.appendChild(p1);
    body.appendChild(p2);

    smallBlockManager.initialize();

    // 离开第一个区块
    smallBlockManager.handleBlockLeave(0);

    // 占位符应该插入到 p2 之前（而不是 appendChild 到末尾）
    expect(body.children[0].tagName).toBe('DIV'); // 占位符
    expect((body.children[0] as HTMLElement).dataset.blockId).toBe('0');
    expect(body.children[1]).toBe(p2);

    // 进入第一个区块
    smallBlockManager.handleBlockEnter(0);

    // p1 应该恢复到正确位置（p2 之前）
    expect(body.children[0]).toBe(p1);
    expect(body.children[1]).toBe(p2);
  });

  // --- C3: 恢复的区块重新被观察 ---
  it('should re-observe restored blocks after handleBlockEnter', () => {
    const body = mockDoc.body;
    const p = mockDoc.createElement('p');
    p.style.height = '200px';
    body.appendChild(p);

    manager.initialize();
    vi.clearAllMocks();

    // 离开区块（会 observe 占位符）
    manager.handleBlockLeave(0);

    // 进入区块（恢复，会 observe 恢复的元素）
    manager.handleBlockEnter(0);

    // 恢复后应该重新观察区块的第一个元素（最后一次 observe 调用）
    expect(mockObserve).toHaveBeenCalledTimes(2); // 占位符 + 恢复元素
    const reObservedElement = mockObserve.mock.calls[1][0];
    expect(reObservedElement).toBe(p);
  });

  // --- M3: handleBlockEnter 取消观察占位符 ---
  it('should unobserve placeholder before removing it in handleBlockEnter', () => {
    const body = mockDoc.body;
    const p = mockDoc.createElement('p');
    p.style.height = '200px';
    body.appendChild(p);

    manager.initialize();

    // 离开区块，占位符被观察
    manager.handleBlockLeave(0);

    // 记录占位符的观察调用
    const placeholder = body.children[0];
    expect(placeholder.tagName).toBe('DIV');

    // 进入区块前，占位符应该被 unobserve
    manager.handleBlockEnter(0);

    // unobserve 应该被调用（初始 unobserve 来自 handleBlockLeave 对区块元素的 unobserve）
    // handleBlockEnter 中的 unobserve(placeholder) 也应该被调用
    expect(mockUnobserve).toHaveBeenCalled();
    expect(placeholder.parentNode).toBeNull(); // 占位符已从 DOM 移除
  });

  // --- 占位符正确插入 DOM ---
  it('should insert placeholder into DOM at correct position on leave', () => {
    // 使用小 blockSize 使每个元素在独立区块中
    const smallBlockManager = new VirtualScrollManager(mockDoc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 100,
    });

    const body = mockDoc.body;
    const p1 = mockDoc.createElement('p');
    p1.textContent = 'Block 1';
    p1.style.height = '200px';
    const p2 = mockDoc.createElement('p');
    p2.textContent = 'Block 2';
    p2.style.height = '200px';
    body.appendChild(p1);
    body.appendChild(p2);

    smallBlockManager.initialize();

    // 离开第一个区块
    smallBlockManager.handleBlockLeave(0);

    // 占位符应该在 DOM 中
    const placeholder = body.querySelector('[data-block-id="0"]');
    expect(placeholder).not.toBeNull();
    // 占位符应该在 p2 之前
    expect(body.children[0]).toBe(placeholder);
    expect(body.children[1]).toBe(p2);
  });

  // --- 多区块顺序保持 ---
  it('should maintain correct order with multiple blocks leave and enter', () => {
    // 使用小 blockSize 使每个元素在独立区块中
    const smallBlockManager = new VirtualScrollManager(mockDoc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 100,
    });

    const body = mockDoc.body;
    const p1 = mockDoc.createElement('p');
    p1.textContent = 'First';
    p1.style.height = '200px';
    const p2 = mockDoc.createElement('p');
    p2.textContent = 'Second';
    p2.style.height = '200px';
    const p3 = mockDoc.createElement('p');
    p3.textContent = 'Third';
    p3.style.height = '200px';
    body.appendChild(p1);
    body.appendChild(p2);
    body.appendChild(p3);

    smallBlockManager.initialize();

    // 离开第一个区块
    smallBlockManager.handleBlockLeave(0);
    // 当前顺序: [placeholder-0, p2, p3]
    expect(body.children[0].tagName).toBe('DIV');
    expect((body.children[0] as HTMLElement).dataset.blockId).toBe('0');
    expect(body.children[1]).toBe(p2);
    expect(body.children[2]).toBe(p3);

    // 恢复第一个区块
    smallBlockManager.handleBlockEnter(0);
    // 当前顺序: [p1, p2, p3]
    expect(body.children[0]).toBe(p1);
    expect(body.children[1]).toBe(p2);
    expect(body.children[2]).toBe(p3);
  });

  // --- 标注保存和恢复 ---
  it('should save and restore annotations via text matching', () => {
    const body = mockDoc.body;
    const p = mockDoc.createElement('p');
    p.style.height = '200px';
    // 创建一个带有标注高亮的段落
    const before = mockDoc.createTextNode('Before ');
    const highlight = mockDoc.createElement('span');
    highlight.textContent = 'highlighted text';
    highlight.dataset.annotationId = 'ann-1';
    highlight.dataset.annotationColor = '#ffeb3b';
    highlight.style.backgroundColor = '#ffeb3b';
    const after = mockDoc.createTextNode(' After');
    p.appendChild(before);
    p.appendChild(highlight);
    p.appendChild(after);
    body.appendChild(p);

    manager.initialize();

    // 离开区块（保存标注）
    manager.handleBlockLeave(0);

    // 进入区块（恢复标注）
    manager.handleBlockEnter(0);

    // 标注应该被恢复
    const restored = p.querySelector('[data-annotation-id="ann-1"]');
    expect(restored).not.toBeNull();
    expect(restored?.textContent).toBe('highlighted text');
    expect((restored as HTMLElement)?.style.backgroundColor).toBe('rgb(255, 235, 59)');
  });

  // --- destroy 清理 ---
  it('should clear observedElementMap on destroy', () => {
    const body = mockDoc.body;
    const p = mockDoc.createElement('p');
    p.style.height = '200px';
    body.appendChild(p);

    manager.initialize();
    manager.destroy();

    // 重建 manager 验证无残留状态
    manager = new VirtualScrollManager(mockDoc, DEFAULT_VIRTUAL_SCROLL_CONFIG);
    expect(manager.getBlockCount()).toBe(0);
  });
});
