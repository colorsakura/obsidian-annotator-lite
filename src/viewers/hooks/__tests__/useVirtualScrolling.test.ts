import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useVirtualScrolling } from '../useVirtualScrolling';

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

describe('useVirtualScrolling', () => {
  let mockView: any;
  let mockConfig: any;
  let mockDoc: Document;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDoc = document.implementation.createHTMLDocument();

    // 添加一些 DOM 内容供 BlockSplitter 切分
    for (let i = 0; i < 5; i++) {
      const p = mockDoc.createElement('p');
      p.textContent = `Paragraph ${i}`;
      p.style.height = '200px';
      mockDoc.body.appendChild(p);
    }

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

    mockView = {
      renderer: {
        getContents: vi.fn().mockReturnValue([{ doc: mockDoc }]),
      },
    };

    mockConfig = {
      enabled: true,
      blockSize: 1000,
      preloadMargin: 200,
      maxCachedBlocks: 10,
      fallbackMode: 'content-visibility',
    };
  });

  it('should initialize virtual scrolling when enabled', async () => {
    const { result } = renderHook(() => useVirtualScrolling(mockView, true, mockConfig));

    // useEffect 在首次渲染后执行，waitFor 等待状态更新
    const { waitFor } = await import('@testing-library/react');
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
  });

  it('should not initialize when disabled', () => {
    const disabledConfig = { ...mockConfig, enabled: false };
    const { result } = renderHook(() => useVirtualScrolling(mockView, true, disabledConfig));
    expect(result.current).toBeNull();
  });

  it('should not initialize when not loaded', () => {
    const { result } = renderHook(() => useVirtualScrolling(mockView, false, mockConfig));
    expect(result.current).toBeNull();
  });
});
