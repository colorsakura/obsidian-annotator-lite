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
 * 集成测试：验证虚拟滚动的完整生命周期
 * 覆盖从文档初始化、区块切分、离开/进入视口、标注保存恢复到销毁清理的完整流程
 */
describe('Virtual Scroll Integration', () => {
  let doc: Document;

  beforeEach(() => {
    vi.clearAllMocks();
    doc = document.implementation.createHTMLDocument();

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

  /**
   * 完整生命周期测试：
   * 初始化 → 验证区块切分 → 离开区块 → 进入区块 → 销毁
   */
  it('should handle complete virtual scroll lifecycle', () => {
    const body = doc.body;
    for (let i = 0; i < 20; i++) {
      const p = doc.createElement('p');
      p.textContent = `Paragraph ${i}`;
      p.style.height = '100px';
      body.appendChild(p);
    }

    const manager = new VirtualScrollManager(doc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 500,
    });

    // 初始化：20 个 100px 段落，blockSize 500 → 应该切分成多个区块
    manager.initialize();
    expect(manager.getBlockCount()).toBeGreaterThan(1);

    // 初始状态所有区块均为 rendered
    for (let i = 0; i < manager.getBlockCount(); i++) {
      expect(manager.getBlockState(i)).toBe('rendered');
    }

    // 离开第一个区块 → 状态变为 cached
    manager.handleBlockLeave(0);
    expect(manager.getBlockState(0)).toBe('cached');

    // DOM 中应该出现占位符替代被缓存的区块
    const placeholder = body.querySelector('[data-block-id="0"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.tagName).toBe('DIV');

    // 进入第一个区块 → 状态恢复为 rendered
    manager.handleBlockEnter(0);
    expect(manager.getBlockState(0)).toBe('rendered');

    // 占位符应已被移除
    expect(body.querySelector('[data-block-id="0"]')).toBeNull();

    // 销毁后区块计数归零
    manager.destroy();
    expect(manager.getBlockCount()).toBe(0);
  });

  /**
   * 标注跨区块边界测试：
   * 验证标注在离开/进入循环后能正确保存和恢复
   */
  it('should handle annotations across block boundaries', () => {
    const body = doc.body;
    const p = doc.createElement('p');
    p.textContent = 'Test paragraph with annotation';
    p.style.height = '200px';
    body.appendChild(p);

    const span = doc.createElement('span');
    span.textContent = 'annotation';
    span.dataset.annotationId = 'test-anno';
    span.dataset.annotationColor = '#ffeb3b';
    span.style.backgroundColor = '#ffeb3b';
    p.appendChild(span);

    const manager = new VirtualScrollManager(doc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 500,
    });

    manager.initialize();
    expect(manager.getBlockCount()).toBeGreaterThan(0);

    // 离开区块（保存标注到 AnnotationCache）
    manager.handleBlockLeave(0);
    expect(manager.getBlockState(0)).toBe('cached');

    // 标注 span 已从 DOM 移除（随区块一起被缓存）
    expect(doc.querySelector('[data-annotation-id="test-anno"]')).toBeNull();

    // 进入区块（从 AnnotationCache 恢复标注）
    manager.handleBlockEnter(0);
    expect(manager.getBlockState(0)).toBe('rendered');

    // 标注应被恢复到 DOM 中
    const restored = doc.querySelector('[data-annotation-id="test-anno"]');
    expect(restored).toBeDefined();
    expect(restored?.textContent).toBe('annotation');
    expect((restored as HTMLElement)?.style.backgroundColor).toBe('rgb(255, 235, 59)');

    manager.destroy();
  });

  /**
   * 多区块交替离开/进入测试：
   * 模拟滚动场景中多个区块的离开和进入，验证顺序和状态一致性
   */
  it('should handle multiple blocks with alternating leave and enter', () => {
    const body = doc.body;
    const paragraphs: HTMLParagraphElement[] = [];
    for (let i = 0; i < 6; i++) {
      const p = doc.createElement('p');
      p.textContent = `Block ${i}`;
      p.style.height = '150px';
      body.appendChild(p);
      paragraphs.push(p);
    }

    // blockSize 100 → 每个段落独立成块
    const manager = new VirtualScrollManager(doc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 100,
    });

    manager.initialize();
    const blockCount = manager.getBlockCount();
    expect(blockCount).toBe(6);

    // 离开前三个区块
    manager.handleBlockLeave(0);
    manager.handleBlockLeave(1);
    manager.handleBlockLeave(2);

    expect(manager.getBlockState(0)).toBe('cached');
    expect(manager.getBlockState(1)).toBe('cached');
    expect(manager.getBlockState(2)).toBe('cached');
    expect(manager.getBlockState(3)).toBe('rendered');

    // 进入第三个区块
    manager.handleBlockEnter(2);
    expect(manager.getBlockState(2)).toBe('rendered');

    // 进入第一个区块
    manager.handleBlockEnter(0);
    expect(manager.getBlockState(0)).toBe('rendered');

    // 验证文档顺序：block0, block1(placeholder), block2(恢复), block3, block4, block5
    const childNodes = Array.from(body.children);
    // block0 应恢复到最前面
    expect(childNodes[0]).toBe(paragraphs[0]);
    // block1 应为占位符
    expect(childNodes[1].tagName).toBe('DIV');
    expect((childNodes[1] as HTMLElement).dataset.blockId).toBe('1');
    // block2 应恢复
    expect(childNodes[2]).toBe(paragraphs[2]);
    // block3-5 未离开，保持原位
    expect(childNodes[3]).toBe(paragraphs[3]);
    expect(childNodes[4]).toBe(paragraphs[4]);
    expect(childNodes[5]).toBe(paragraphs[5]);

    manager.destroy();
  });

  /**
   * 多标注保存恢复测试：
   * 验证同一区块中的多个标注在离开/进入循环后全部正确恢复
   */
  it('should save and restore multiple annotations in the same block', () => {
    const body = doc.body;
    const p = doc.createElement('p');
    p.style.height = '200px';

    const before = doc.createTextNode('Text before ');
    const highlight1 = doc.createElement('span');
    highlight1.textContent = 'first highlight';
    highlight1.dataset.annotationId = 'anno-1';
    highlight1.dataset.annotationColor = '#ffeb3b';
    highlight1.style.backgroundColor = '#ffeb3b';

    const middle = doc.createTextNode(' and ');
    const highlight2 = doc.createElement('span');
    highlight2.textContent = 'second highlight';
    highlight2.dataset.annotationId = 'anno-2';
    highlight2.dataset.annotationColor = '#4caf50';
    highlight2.style.backgroundColor = '#4caf50';

    const after = doc.createTextNode(' after');

    p.appendChild(before);
    p.appendChild(highlight1);
    p.appendChild(middle);
    p.appendChild(highlight2);
    p.appendChild(after);
    body.appendChild(p);

    const manager = new VirtualScrollManager(doc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 500,
    });

    manager.initialize();

    // 离开区块 → 保存两个标注
    manager.handleBlockLeave(0);

    // 进入区块 → 恢复标注
    manager.handleBlockEnter(0);

    // 两个标注都应该被恢复
    const restored1 = doc.querySelector('[data-annotation-id="anno-1"]');
    const restored2 = doc.querySelector('[data-annotation-id="anno-2"]');
    expect(restored1).toBeDefined();
    expect(restored2).toBeDefined();
    expect(restored1?.textContent).toBe('first highlight');
    expect(restored2?.textContent).toBe('second highlight');

    manager.destroy();
  });

  /**
   * 标注所属区块查询测试：
   * 验证 getBlockForAnnotation 在完整生命周期中正确追踪标注归属
   */
  it('should track annotation block ownership through lifecycle', () => {
    const body = doc.body;
    const p = doc.createElement('p');
    p.style.height = '200px';

    const highlight = doc.createElement('span');
    highlight.textContent = 'tracked';
    highlight.dataset.annotationId = 'tracked-anno';
    highlight.dataset.annotationColor = '#2196f3';
    highlight.style.backgroundColor = '#2196f3';
    p.appendChild(highlight);
    body.appendChild(p);

    const manager = new VirtualScrollManager(doc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 500,
    });

    manager.initialize();

    // 离开区块后，标注应属于 block 0
    manager.handleBlockLeave(0);
    expect(manager.getBlockForAnnotation('tracked-anno')).toBe(0);

    // 进入区块后，标注仍属于 block 0
    manager.handleBlockEnter(0);
    expect(manager.getBlockForAnnotation('tracked-anno')).toBe(0);

    // 不存在的标注应返回 undefined
    expect(manager.getBlockForAnnotation('nonexistent')).toBeUndefined();

    manager.destroy();
  });

  /**
   * destroy 后重新初始化测试：
   * 验证销毁后可以创建新的 manager 并正常工作
   */
  it('should support re-initialization after destroy', () => {
    const body = doc.body;

    // 第一次初始化
    const p1 = doc.createElement('p');
    p1.textContent = 'First round';
    p1.style.height = '200px';
    body.appendChild(p1);

    let manager = new VirtualScrollManager(doc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 500,
    });
    manager.initialize();
    expect(manager.getBlockCount()).toBe(1);
    manager.destroy();
    expect(manager.getBlockCount()).toBe(0);

    // 添加更多内容并重新初始化（blockSize 100 确保每个段落独立成块）
    const p2 = doc.createElement('p');
    p2.textContent = 'Second round';
    p2.style.height = '200px';
    body.appendChild(p2);

    manager = new VirtualScrollManager(doc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 100,
    });
    manager.initialize();
    expect(manager.getBlockCount()).toBe(2);

    manager.handleBlockLeave(0);
    expect(manager.getBlockState(0)).toBe('cached');

    manager.handleBlockEnter(0);
    expect(manager.getBlockState(0)).toBe('rendered');

    manager.destroy();
  });

  /**
   * 空文档测试：
   * 验证空文档的初始化和销毁不会出错
   */
  it('should handle empty document lifecycle', () => {
    const manager = new VirtualScrollManager(doc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 500,
    });

    manager.initialize();
    expect(manager.getBlockCount()).toBe(0);

    // 对不存在的区块调用 leave/enter 应安全跳过
    expect(() => manager.handleBlockLeave(0)).not.toThrow();
    expect(() => manager.handleBlockEnter(0)).not.toThrow();

    manager.destroy();
    expect(manager.getBlockCount()).toBe(0);
  });

  /**
   * 对同一区块重复 leave 操作测试：
   * 验证重复离开已缓存的区块不会导致异常
   */
  it('should be idempotent for duplicate block leave', () => {
    const body = doc.body;
    const p = doc.createElement('p');
    p.style.height = '200px';
    body.appendChild(p);

    const manager = new VirtualScrollManager(doc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 500,
    });

    manager.initialize();

    manager.handleBlockLeave(0);
    expect(manager.getBlockState(0)).toBe('cached');

    // 重复离开已缓存的区块 → 应安全跳过
    manager.handleBlockLeave(0);
    expect(manager.getBlockState(0)).toBe('cached');

    // 重新进入并验证
    manager.handleBlockEnter(0);
    expect(manager.getBlockState(0)).toBe('rendered');

    manager.destroy();
  });

  /**
   * 对已渲染区块重复进入操作测试：
   * 验证重复进入已渲染的区块不会导致异常
   */
  it('should be idempotent for duplicate block enter', () => {
    const body = doc.body;
    const p = doc.createElement('p');
    p.style.height = '200px';
    body.appendChild(p);

    const manager = new VirtualScrollManager(doc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 500,
    });

    manager.initialize();

    // 已渲染的区块再次进入 → 应安全跳过
    manager.handleBlockEnter(0);
    expect(manager.getBlockState(0)).toBe('rendered');

    manager.destroy();
  });
});
