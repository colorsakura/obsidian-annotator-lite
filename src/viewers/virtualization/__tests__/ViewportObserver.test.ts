import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ViewportObserver } from '../ViewportObserver';

/**
 * 模拟 IntersectionObserver
 * 收集构造参数并暴露实例方法供测试验证
 */
let lastCallback: IntersectionObserverCallback | null = null;
let lastOptions: IntersectionObserverInit | undefined;
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

    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit
    ) {
      lastCallback = callback;
      lastOptions = options;
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
 * 创建模拟的 IntersectionObserverEntry
 */
function createEntry(
  target: Element,
  isIntersecting: boolean
): IntersectionObserverEntry {
  return {
    target,
    isIntersecting,
    intersectionRatio: isIntersecting ? 1 : 0,
    boundingClientRect: new DOMRect(),
    intersectionRect: new DOMRect(),
    rootBounds: new DOMRect(),
    time: 0,
  } as IntersectionObserverEntry;
}

describe('ViewportObserver', () => {
  let observer: ViewportObserver;
  let mockDoc: Document;
  let enterCallback: ReturnType<typeof vi.fn>;
  let leaveCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    lastCallback = null;
    lastOptions = undefined;
    mockDoc = document.implementation.createHTMLDocument();
    enterCallback = vi.fn();
    leaveCallback = vi.fn();
    observer = new ViewportObserver(mockDoc, {
      rootMargin: '200px 0px',
      onBlockEnter: enterCallback as (blockId: number) => void,
      onBlockLeave: leaveCallback as (blockId: number) => void,
    });
  });

  it('should create IntersectionObserver with correct options', () => {
    expect(lastCallback).toBeTypeOf('function');
    expect(lastOptions?.rootMargin).toBe('200px 0px');
    expect(lastOptions?.root).toBe(mockDoc.documentElement);
    expect(lastOptions?.threshold).toBe(0);
  });

  it('should observe elements', () => {
    const element = mockDoc.createElement('div');
    mockDoc.body.appendChild(element);
    observer.observe(element, 0);
    expect(mockObserve).toHaveBeenCalledWith(element);
  });

  it('should unobserve elements', () => {
    const element = mockDoc.createElement('div');
    mockDoc.body.appendChild(element);
    observer.observe(element, 0);
    observer.unobserve(element);
    expect(mockUnobserve).toHaveBeenCalledWith(element);
  });

  it('should disconnect all observers', () => {
    const element = mockDoc.createElement('div');
    mockDoc.body.appendChild(element);
    observer.observe(element, 0);
    observer.disconnect();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('should call onBlockEnter when element becomes visible', () => {
    const element = mockDoc.createElement('div');
    mockDoc.body.appendChild(element);
    observer.observe(element, 42);

    // 触发 IntersectionObserver 回调
    lastCallback!([createEntry(element, true)], {} as IntersectionObserver);

    expect(enterCallback).toHaveBeenCalledWith(42);
    expect(leaveCallback).not.toHaveBeenCalled();
  });

  it('should call onBlockLeave when element becomes invisible', () => {
    const element = mockDoc.createElement('div');
    mockDoc.body.appendChild(element);
    observer.observe(element, 7);

    lastCallback!([createEntry(element, false)], {} as IntersectionObserver);

    expect(leaveCallback).toHaveBeenCalledWith(7);
    expect(enterCallback).not.toHaveBeenCalled();
  });

  it('should ignore entries for unknown elements', () => {
    const unknownElement = mockDoc.createElement('div');

    lastCallback!(
      [createEntry(unknownElement, true)],
      {} as IntersectionObserver
    );

    expect(enterCallback).not.toHaveBeenCalled();
    expect(leaveCallback).not.toHaveBeenCalled();
  });
});
