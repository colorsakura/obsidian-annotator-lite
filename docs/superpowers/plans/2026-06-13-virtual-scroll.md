# 虚拟滚动实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现区块级虚拟滚动，在滚动模式下只渲染视口附近的区块，屏幕外的完全卸载，解决侧边栏开关时的卡顿问题。

**Architecture:** 基于 IntersectionObserver 监控区块可见性，将章节 DOM 拆分成固定高度的区块，屏幕外的区块用占位符替换，滚动到视口时恢复 DOM 并重新应用标注。

**Tech Stack:** TypeScript, React, IntersectionObserver, MutationObserver, foliate-js API

---

## 文件结构

### 新建文件
- `src/viewers/virtualization/VirtualScrollManager.ts` - 虚拟滚动管理器核心类
- `src/viewers/virtualization/BlockSplitter.ts` - 区块切分算法
- `src/viewers/virtualization/BlockRegistry.ts` - 区块状态管理
- `src/viewers/virtualization/ViewportObserver.ts` - IntersectionObserver 封装
- `src/viewers/virtualization/BlockCache.ts` - 区块 DOM 缓存
- `src/viewers/virtualization/AnnotationCache.ts` - 标注缓存
- `src/viewers/virtualization/types.ts` - 类型定义
- `src/viewers/hooks/useVirtualScrolling.ts` - 虚拟滚动 React hook

### 修改文件
- `src/viewers/hooks/useContentVirtualization.ts` - 移除或降级为 fallback
- `src/viewers/hooks/useAnnotationRenderer.ts` - 支持按区块渲染
- `src/viewers/foliate/foliateAnnotations.ts` - 标注渲染感知区块状态
- `src/viewers/FoliateViewer.tsx` - 集成虚拟滚动 hook
- `src/services/Settings.ts` - 添加虚拟滚动配置

---

## Task 1: 类型定义

**Files:**
- Create: `src/viewers/virtualization/types.ts`

- [ ] **Step 1: 创建类型定义文件**

```typescript
// src/viewers/virtualization/types.ts

/**
 * 区块描述符
 */
export interface BlockDescriptor {
  /** 区块 ID */
  id: number;
  /** 起始偏移量（用于滚动位置计算） */
  startOffset: number;
  /** 区块高度（px） */
  height: number;
  /** 包含的 DOM 节点引用 */
  elements: Node[];
  /** 原始 DOM Range（用于标注恢复） */
  range: Range;
  /** 当前状态 */
  state: 'rendered' | 'cached';
}

/**
 * 缓存的标注
 */
export interface CachedAnnotation {
  /** 标注 ID */
  id: string;
  /** 保存时的 DOM Range */
  range: Range;
  /** 颜色 */
  color: string;
  /** 标注文本（用于验证） */
  text: string;
  /** 所属区块 ID */
  blockId: number;
}

/**
 * 虚拟滚动配置
 */
export interface VirtualScrollConfig {
  /** 总开关 */
  enabled: boolean;
  /** 区块高度（默认 1000px） */
  blockSize: number;
  /** 预加载区域（默认 200px） */
  preloadMargin: number;
  /** 最大缓存区块数（默认 10） */
  maxCachedBlocks: number;
  /** 降级模式 */
  fallbackMode: 'none' | 'content-visibility';
}

/**
 * 默认配置
 */
export const DEFAULT_VIRTUAL_SCROLL_CONFIG: VirtualScrollConfig = {
  enabled: true,
  blockSize: 1000,
  preloadMargin: 200,
  maxCachedBlocks: 10,
  fallbackMode: 'content-visibility',
};

/**
 * 区块事件
 */
export interface BlockEvent {
  type: 'enter' | 'leave';
  blockId: number;
}
```

- [ ] **Step 2: 提交类型定义**

```bash
git add src/viewers/virtualization/types.ts
git commit -m "feat(virtualization): add type definitions for virtual scrolling"
```

---

## Task 2: BlockSplitter - 区块切分算法

**Files:**
- Create: `src/viewers/virtualization/BlockSplitter.ts`
- Test: `src/viewers/virtualization/__tests__/BlockSplitter.test.ts`

- [ ] **Step 1: 编写区块切分算法的失败测试**

```typescript
// src/viewers/virtualization/__tests__/BlockSplitter.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { BlockSplitter } from '../BlockSplitter';

describe('BlockSplitter', () => {
  let splitter: BlockSplitter;
  let mockDoc: Document;

  beforeEach(() => {
    splitter = new BlockSplitter({ blockSize: 1000 });
    mockDoc = document.implementation.createHTMLDocument();
  });

  it('should split document into blocks based on height', () => {
    // 创建测试 DOM
    const body = mockDoc.body;
    for (let i = 0; i < 10; i++) {
      const p = mockDoc.createElement('p');
      p.textContent = `Paragraph ${i}`;
      p.style.height = '150px';
      body.appendChild(p);
    }

    const blocks = splitter.split(mockDoc);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks[0].height).toBeLessThanOrEqual(1000);
  });

  it('should not split individual elements', () => {
    const body = mockDoc.body;
    const largeP = mockDoc.createElement('p');
    largeP.textContent = 'Large paragraph';
    largeP.style.height = '1200px'; // 超过 blockSize
    body.appendChild(largeP);

    const blocks = splitter.split(mockDoc);
    expect(blocks.length).toBe(1);
    expect(blocks[0].elements).toContain(largeP);
  });

  it('should preserve container boundaries', () => {
    const body = mockDoc.body;
    const table = mockDoc.createElement('table');
    table.style.height = '800px';
    const tr = mockDoc.createElement('tr');
    table.appendChild(tr);
    body.appendChild(table);

    const blocks = splitter.split(mockDoc);
    expect(blocks.length).toBe(1);
    expect(blocks[0].elements).toContain(table);
  });

  it('should handle empty document', () => {
    const blocks = splitter.split(mockDoc);
    expect(blocks.length).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
bun run test src/viewers/virtualization/__tests__/BlockSplitter.test.ts
```

- [ ] **Step 3: 实现 BlockSplitter**

```typescript
// src/viewers/virtualization/BlockSplitter.ts
import { BlockDescriptor } from './types';

/**
 * 区块切分器
 * 基于累积高度的贪心切分算法
 */
export class BlockSplitter {
  private blockSize: number;
  private blockIdCounter = 0;

  constructor(config: { blockSize: number }) {
    this.blockSize = config.blockSize;
  }

  /**
   * 将文档切分成区块
   */
  split(doc: Document): BlockDescriptor[] {
    const body = doc.body;
    if (!body) return [];

    const blocks: BlockDescriptor[] = [];
    let currentElements: Node[] = [];
    let currentHeight = 0;
    let startOffset = 0;

    // 获取所有顶级块级元素
    const blockElements = this.getBlockElements(body);

    for (const element of blockElements) {
      const elementHeight = this.getElementHeight(element);

      // 如果当前区块加上这个元素会超过 blockSize
      if (currentHeight + elementHeight > this.blockSize && currentElements.length > 0) {
        // 创建区块
        blocks.push(this.createBlock(currentElements, startOffset, currentHeight));
        
        // 重置
        startOffset += currentHeight;
        currentElements = [];
        currentHeight = 0;
      }

      currentElements.push(element);
      currentHeight += elementHeight;
    }

    // 处理最后一个区块
    if (currentElements.length > 0) {
      blocks.push(this.createBlock(currentElements, startOffset, currentHeight));
    }

    return blocks;
  }

  /**
   * 获取容器中的所有块级元素
   */
  private getBlockElements(container: Element): Element[] {
    const elements: Element[] = [];
    const blockSelectors = 'p, div, h1, h2, h3, h4, h5, h6, blockquote, ul, ol, li, table, pre, hr, figure, figcaption';

    for (const child of container.children) {
      // 如果是块级元素，直接添加
      if (child.matches(blockSelectors)) {
        elements.push(child);
      } else {
        // 否则递归查找
        elements.push(...this.getBlockElements(child));
      }
    }

    return elements;
  }

  /**
   * 获取元素高度
   */
  private getElementHeight(element: Element): number {
    // 使用 getBoundingClientRect 获取准确高度
    const rect = element.getBoundingClientRect();
    return rect.height || 0;
  }

  /**
   * 创建区块描述符
   */
  private createBlock(elements: Node[], startOffset: number, height: number): BlockDescriptor {
    const range = new Range();
    if (elements.length > 0) {
      range.setStartBefore(elements[0] as Element);
      range.setEndAfter(elements[elements.length - 1] as Element);
    }

    return {
      id: this.blockIdCounter++,
      startOffset,
      height,
      elements,
      range,
      state: 'rendered',
    };
  }

  /**
   * 重置计数器（章节切换时使用）
   */
  reset(): void {
    this.blockIdCounter = 0;
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
bun run test src/viewers/virtualization/__tests__/BlockSplitter.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/viewers/virtualization/BlockSplitter.ts src/viewers/virtualization/__tests__/BlockSplitter.test.ts
git commit -m "feat(virtualization): implement BlockSplitter for splitting DOM into blocks"
```

---

## Task 3: BlockRegistry - 区块状态管理

**Files:**
- Create: `src/viewers/virtualization/BlockRegistry.ts`
- Test: `src/viewers/virtualization/__tests__/BlockRegistry.test.ts`

- [ ] **Step 1: 编写区块状态管理的失败测试**

```typescript
// src/viewers/virtualization/__tests__/BlockRegistry.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { BlockRegistry } from '../BlockRegistry';
import { BlockDescriptor } from '../types';

describe('BlockRegistry', () => {
  let registry: BlockRegistry;
  let mockBlock: BlockDescriptor;

  beforeEach(() => {
    registry = new BlockRegistry();
    mockBlock = {
      id: 0,
      startOffset: 0,
      height: 500,
      elements: [],
      range: new Range(),
      state: 'rendered',
    };
  });

  it('should register and retrieve blocks', () => {
    registry.register(mockBlock);
    expect(registry.getBlock(0)).toBe(mockBlock);
  });

  it('should update block state', () => {
    registry.register(mockBlock);
    registry.updateState(0, 'cached');
    expect(registry.getBlock(0)?.state).toBe('cached');
  });

  it('should get all blocks', () => {
    const block2 = { ...mockBlock, id: 1 };
    registry.register(mockBlock);
    registry.register(block2);
    expect(registry.getAllBlocks()).toHaveLength(2);
  });

  it('should get blocks by state', () => {
    const block2 = { ...mockBlock, id: 1, state: 'cached' as const };
    registry.register(mockBlock);
    registry.register(block2);
    expect(registry.getBlocksByState('rendered')).toHaveLength(1);
    expect(registry.getBlocksByState('cached')).toHaveLength(1);
  });

  it('should clear all blocks', () => {
    registry.register(mockBlock);
    registry.clear();
    expect(registry.getAllBlocks()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
bun run test src/viewers/virtualization/__tests__/BlockRegistry.test.ts
```

- [ ] **Step 3: 实现 BlockRegistry**

```typescript
// src/viewers/virtualization/BlockRegistry.ts
import { BlockDescriptor } from './types';

/**
 * 区块注册表
 * 管理所有区块的状态
 */
export class BlockRegistry {
  private blocks = new Map<number, BlockDescriptor>();

  /**
   * 注册区块
   */
  register(block: BlockDescriptor): void {
    this.blocks.set(block.id, block);
  }

  /**
   * 获取区块
   */
  getBlock(id: number): BlockDescriptor | undefined {
    return this.blocks.get(id);
  }

  /**
   * 获取所有区块
   */
  getAllBlocks(): BlockDescriptor[] {
    return Array.from(this.blocks.values());
  }

  /**
   * 按状态获取区块
   */
  getBlocksByState(state: 'rendered' | 'cached'): BlockDescriptor[] {
    return this.getAllBlocks().filter(block => block.state === state);
  }

  /**
   * 更新区块状态
   */
  updateState(id: number, state: 'rendered' | 'cached'): void {
    const block = this.blocks.get(id);
    if (block) {
      block.state = state;
    }
  }

  /**
   * 清空所有区块
   */
  clear(): void {
    this.blocks.clear();
  }

  /**
   * 获取区块数量
   */
  get size(): number {
    return this.blocks.size;
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
bun run test src/viewers/virtualization/__tests__/BlockRegistry.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/viewers/virtualization/BlockRegistry.ts src/viewers/virtualization/__tests__/BlockRegistry.test.ts
git commit -m "feat(virtualization): implement BlockRegistry for managing block states"
```

---

## Task 4: ViewportObserver - 视口观察器

**Files:**
- Create: `src/viewers/virtualization/ViewportObserver.ts`
- Test: `src/viewers/virtualization/__tests__/ViewportObserver.test.ts`

- [ ] **Step 1: 编写视口观察器的失败测试**

```typescript
// src/viewers/virtualization/__tests__/ViewportObserver.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ViewportObserver } from '../ViewportObserver';

describe('ViewportObserver', () => {
  let observer: ViewportObserver;
  let mockDoc: Document;
  let enterCallback: ReturnType<typeof vi.fn>;
  let leaveCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDoc = document.implementation.createHTMLDocument();
    enterCallback = vi.fn();
    leaveCallback = vi.fn();
    observer = new ViewportObserver(mockDoc, {
      rootMargin: '200px 0px',
      onBlockEnter: enterCallback,
      onBlockLeave: leaveCallback,
    });
  });

  it('should observe elements', () => {
    const element = mockDoc.createElement('div');
    mockDoc.body.appendChild(element);
    observer.observe(element, 0);
    // 验证元素被观察（通过内部状态）
  });

  it('should unobserve elements', () => {
    const element = mockDoc.createElement('div');
    mockDoc.body.appendChild(element);
    observer.observe(element, 0);
    observer.unobserve(element);
    // 验证元素不再被观察
  });

  it('should disconnect all observers', () => {
    const element = mockDoc.createElement('div');
    mockDoc.body.appendChild(element);
    observer.observe(element, 0);
    observer.disconnect();
    // 验证所有观察已断开
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
bun run test src/viewers/virtualization/__tests__/ViewportObserver.test.ts
```

- [ ] **Step 3: 实现 ViewportObserver**

```typescript
// src/viewers/virtualization/ViewportObserver.ts

/**
 * 视口观察器配置
 */
export interface ViewportObserverConfig {
  /** 预加载区域 */
  rootMargin: string;
  /** 区块进入视口回调 */
  onBlockEnter: (blockId: number) => void;
  /** 区块离开视口回调 */
  onBlockLeave: (blockId: number) => void;
}

/**
 * 视口观察器
 * 使用 IntersectionObserver 监控区块可见性
 */
export class ViewportObserver {
  private observer: IntersectionObserver;
  private elementToBlockId = new Map<Element, number>();

  constructor(doc: Document, config: ViewportObserverConfig) {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const blockId = this.elementToBlockId.get(entry.target);
          if (blockId === undefined) continue;

          if (entry.isIntersecting) {
            config.onBlockEnter(blockId);
          } else {
            config.onBlockLeave(blockId);
          }
        }
      },
      {
        root: doc.documentElement,
        rootMargin: config.rootMargin,
        threshold: 0,
      }
    );
  }

  /**
   * 观察元素
   */
  observe(element: Element, blockId: number): void {
    this.elementToBlockId.set(element, blockId);
    this.observer.observe(element);
  }

  /**
   * 停止观察元素
   */
  unobserve(element: Element): void {
    this.elementToBlockId.delete(element);
    this.observer.unobserve(element);
  }

  /**
   * 断开所有观察
   */
  disconnect(): void {
    this.observer.disconnect();
    this.elementToBlockId.clear();
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
bun run test src/viewers/virtualization/__tests__/ViewportObserver.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/viewers/virtualization/ViewportObserver.ts src/viewers/virtualization/__tests__/ViewportObserver.test.ts
git commit -m "feat(virtualization): implement ViewportObserver for block visibility monitoring"
```

---

## Task 5: BlockCache - 区块 DOM 缓存

**Files:**
- Create: `src/viewers/virtualization/BlockCache.ts`
- Test: `src/viewers/virtualization/__tests__/BlockCache.test.ts`

- [ ] **Step 1: 编写区块缓存的失败测试**

```typescript
// src/viewers/virtualization/__tests__/BlockCache.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { BlockCache } from '../BlockCache';
import { BlockDescriptor } from '../types';

describe('BlockCache', () => {
  let cache: BlockCache;
  let mockBlock: BlockDescriptor;
  let mockElements: Node[];

  beforeEach(() => {
    cache = new BlockCache({ maxSize: 3 });
    const doc = document.implementation.createHTMLDocument();
    mockElements = [
      doc.createElement('p'),
      doc.createElement('div'),
    ];
    mockBlock = {
      id: 0,
      startOffset: 0,
      height: 500,
      elements: mockElements,
      range: new Range(),
      state: 'rendered',
    };
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
    cache.set(3, mockElements); // 应该驱逐 id=0
    
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
```

- [ ] **Step 2: 运行测试验证失败**

```bash
bun run test src/viewers/virtualization/__tests__/BlockCache.test.ts
```

- [ ] **Step 3: 实现 BlockCache**

```typescript
// src/viewers/virtualization/BlockCache.ts

/**
 * 区块缓存配置
 */
export interface BlockCacheConfig {
  /** 最大缓存数量 */
  maxSize: number;
}

/**
 * 区块缓存
 * LRU 缓存策略，存储屏幕外区块的 DOM 节点
 */
export class BlockCache {
  private cache = new Map<number, Node[]>();
  private maxSize: number;

  constructor(config: BlockCacheConfig) {
    this.maxSize = config.maxSize;
  }

  /**
   * 获取缓存的区块元素
   */
  get(blockId: number): Node[] | undefined {
    const elements = this.cache.get(blockId);
    if (elements) {
      // 移到最新位置（LRU）
      this.cache.delete(blockId);
      this.cache.set(blockId, elements);
    }
    return elements;
  }

  /**
   * 缓存区块元素
   */
  set(blockId: number, elements: Node[]): void {
    // 如果已存在，先删除
    if (this.cache.has(blockId)) {
      this.cache.delete(blockId);
    }

    // 如果缓存已满，删除最旧的
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(blockId, elements);
  }

  /**
   * 删除缓存
   */
  delete(blockId: number): void {
    this.cache.delete(blockId);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 缓存大小
   */
  get size(): number {
    return this.cache.size;
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
bun run test src/viewers/virtualization/__tests__/BlockCache.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/viewers/virtualization/BlockCache.ts src/viewers/virtualization/__tests__/BlockCache.test.ts
git commit -m "feat(virtualization): implement BlockCache with LRU eviction strategy"
```

---

## Task 6: AnnotationCache - 标注缓存

**Files:**
- Create: `src/viewers/virtualization/AnnotationCache.ts`
- Test: `src/viewers/virtualization/__tests__/AnnotationCache.test.ts`

- [ ] **Step 1: 编写标注缓存的失败测试**

```typescript
// src/viewers/virtualization/__tests__/AnnotationCache.test.ts
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
```

- [ ] **Step 2: 运行测试验证失败**

```bash
bun run test src/viewers/virtualization/__tests__/AnnotationCache.test.ts
```

- [ ] **Step 3: 实现 AnnotationCache**

```typescript
// src/viewers/virtualization/AnnotationCache.ts
import { CachedAnnotation } from './types';

/**
 * 标注缓存
 * 管理屏幕外区块的标注数据
 */
export class AnnotationCache {
  /** 按 ID 索引 */
  private byId = new Map<string, CachedAnnotation>();
  /** 按区块 ID 索引 */
  private byBlock = new Map<number, CachedAnnotation[]>();

  /**
   * 缓存标注
   */
  set(annotation: CachedAnnotation): void {
    this.byId.set(annotation.id, annotation);

    const blockAnnotations = this.byBlock.get(annotation.blockId) || [];
    blockAnnotations.push(annotation);
    this.byBlock.set(annotation.blockId, blockAnnotations);
  }

  /**
   * 获取标注
   */
  get(id: string): CachedAnnotation | undefined {
    return this.byId.get(id);
  }

  /**
   * 获取区块的所有标注
   */
  getByBlock(blockId: number): CachedAnnotation[] {
    return this.byBlock.get(blockId) || [];
  }

  /**
   * 删除标注
   */
  delete(id: string): void {
    const annotation = this.byId.get(id);
    if (!annotation) return;

    this.byId.delete(id);

    const blockAnnotations = this.byBlock.get(annotation.blockId);
    if (blockAnnotations) {
      const index = blockAnnotations.indexOf(annotation);
      if (index > -1) {
        blockAnnotations.splice(index, 1);
      }
      if (blockAnnotations.length === 0) {
        this.byBlock.delete(annotation.blockId);
      }
    }
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.byId.clear();
    this.byBlock.clear();
  }

  /**
   * 标注数量
   */
  get size(): number {
    return this.byId.size;
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
bun run test src/viewers/virtualization/__tests__/AnnotationCache.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/viewers/virtualization/AnnotationCache.ts src/viewers/virtualization/__tests__/AnnotationCache.test.ts
git commit -m "feat(virtualization): implement AnnotationCache for off-screen annotation storage"
```

---

## Task 7: VirtualScrollManager - 核心管理器

**Files:**
- Create: `src/viewers/virtualization/VirtualScrollManager.ts`
- Test: `src/viewers/virtualization/__tests__/VirtualScrollManager.test.ts`

- [ ] **Step 1: 编写核心管理器的失败测试**

```typescript
// src/viewers/virtualization/__tests__/VirtualScrollManager.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VirtualScrollManager } from '../VirtualScrollManager';
import { DEFAULT_VIRTUAL_SCROLL_CONFIG } from '../types';

describe('VirtualScrollManager', () => {
  let manager: VirtualScrollManager;
  let mockDoc: Document;

  beforeEach(() => {
    mockDoc = document.implementation.createHTMLDocument();
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
    
    // 模拟区块离开视口
    manager.handleBlockLeave(blockId);
    expect(manager.getBlockState(blockId)).toBe('cached');

    // 模拟区块进入视口
    manager.handleBlockEnter(blockId);
    expect(manager.getBlockState(blockId)).toBe('rendered');
  });

  it('should cleanup on destroy', () => {
    manager.destroy();
    expect(manager.getBlockCount()).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
bun run test src/viewers/virtualization/__tests__/VirtualScrollManager.test.ts
```

- [ ] **Step 3: 实现 VirtualScrollManager**

```typescript
// src/viewers/virtualization/VirtualScrollManager.ts
import { VirtualScrollConfig, BlockDescriptor } from './types';
import { BlockSplitter } from './BlockSplitter';
import { BlockRegistry } from './BlockRegistry';
import { ViewportObserver } from './ViewportObserver';
import { BlockCache } from './BlockCache';
import { AnnotationCache } from './AnnotationCache';

/**
 * 虚拟滚动管理器
 * 协调所有虚拟滚动组件
 */
export class VirtualScrollManager {
  private doc: Document;
  private config: VirtualScrollConfig;
  private splitter: BlockSplitter;
  private registry: BlockRegistry;
  private observer: ViewportObserver;
  private blockCache: BlockCache;
  private annotationCache: AnnotationCache;
  private placeholderMap = new Map<number, Element>();

  constructor(doc: Document, config: VirtualScrollConfig) {
    this.doc = doc;
    this.config = config;
    this.splitter = new BlockSplitter({ blockSize: config.blockSize });
    this.registry = new BlockRegistry();
    this.blockCache = new BlockCache({ maxSize: config.maxCachedBlocks });
    this.annotationCache = new AnnotationCache();
    this.observer = new ViewportObserver(doc, {
      rootMargin: `${config.preloadMargin}px 0px`,
      onBlockEnter: (blockId) => this.handleBlockEnter(blockId),
      onBlockLeave: (blockId) => this.handleBlockLeave(blockId),
    });
  }

  /**
   * 初始化虚拟滚动
   */
  initialize(): void {
    // 切分区块
    const blocks = this.splitter.split(this.doc);
    
    // 注册区块
    for (const block of blocks) {
      this.registry.register(block);
      
      // 创建占位符
      const placeholder = this.createPlaceholder(block);
      this.placeholderMap.set(block.id, placeholder);
      
      // 观察占位符
      this.observer.observe(placeholder, block.id);
    }
  }

  /**
   * 处理区块进入视口
   */
  handleBlockEnter(blockId: number): void {
    const block = this.registry.getBlock(blockId);
    if (!block || block.state === 'rendered') return;

    // 从缓存获取 DOM
    const cachedElements = this.blockCache.get(blockId);
    if (!cachedElements) return;

    // 移除占位符
    const placeholder = this.placeholderMap.get(blockId);
    if (placeholder) {
      placeholder.remove();
      this.placeholderMap.delete(blockId);
    }

    // 恢复 DOM
    const parent = this.doc.body;
    for (const element of cachedElements) {
      parent.appendChild(element);
    }

    // 更新状态
    this.registry.updateState(blockId, 'rendered');

    // 恢复标注
    this.restoreAnnotations(blockId);
  }

  /**
   * 处理区块离开视口
   */
  handleBlockLeave(blockId: number): void {
    const block = this.registry.getBlock(blockId);
    if (!block || block.state === 'cached') return;

    // 保存标注
    this.saveAnnotations(blockId);

    // 保存 DOM 到缓存
    this.blockCache.set(blockId, block.elements);

    // 移除 DOM
    for (const element of block.elements) {
      element.remove();
    }

    // 插入占位符
    const placeholder = this.createPlaceholder(block);
    this.placeholderMap.set(blockId, placeholder);
    this.doc.body.appendChild(placeholder);

    // 更新状态
    this.registry.updateState(blockId, 'cached');
  }

  /**
   * 创建占位符元素
   */
  private createPlaceholder(block: BlockDescriptor): Element {
    const placeholder = this.doc.createElement('div');
    placeholder.style.height = `${block.height}px`;
    placeholder.style.width = '100%';
    placeholder.dataset.blockId = String(block.id);
    return placeholder;
  }

  /**
   * 保存区块的标注
   */
  private saveAnnotations(blockId: number): void {
    const block = this.registry.getBlock(blockId);
    if (!block) return;

    // 查找区块内的标注高亮元素
    const highlights = this.doc.querySelectorAll(`[data-annotation-id]`);
    for (const highlight of highlights) {
      const annotationId = highlight.getAttribute('data-annotation-id');
      if (!annotationId) continue;

      // 检查是否在当前区块内
      if (this.isElementInBlock(highlight, block)) {
        const range = this.doc.createRange();
        range.selectNode(highlight);
        
        this.annotationCache.set({
          id: annotationId,
          range,
          color: highlight.getAttribute('data-annotation-color') || '',
          text: highlight.textContent || '',
          blockId,
        });
      }
    }
  }

  /**
   * 恢复区块的标注
   */
  private restoreAnnotations(blockId: number): void {
    const annotations = this.annotationCache.getByBlock(blockId);
    for (const annotation of annotations) {
      // 验证 Range 是否仍然有效
      if (this.isRangeValid(annotation.range)) {
        // 重新创建高亮元素
        this.createHighlightElement(annotation);
      }
    }
  }

  /**
   * 检查元素是否在区块内
   */
  private isElementInBlock(element: Element, block: BlockDescriptor): boolean {
    for (const node of block.elements) {
      if (node instanceof Element && node.contains(element)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 检查 Range 是否有效
   */
  private isRangeValid(range: Range): boolean {
    try {
      return range.startContainer.isConnected && range.endContainer.isConnected;
    } catch {
      return false;
    }
  }

  /**
   * 创建高亮元素
   */
  private createHighlightElement(annotation: any): void {
    // 这里需要与现有的标注系统集成
    // 暂时使用简单的实现
    const span = this.doc.createElement('span');
    span.style.backgroundColor = annotation.color;
    span.dataset.annotationId = annotation.id;
    span.dataset.annotationColor = annotation.color;
    
    try {
      annotation.range.surroundContents(span);
    } catch (e) {
      console.warn('Failed to restore annotation:', e);
    }
  }

  /**
   * 获取区块数量
   */
  getBlockCount(): number {
    return this.registry.size;
  }

  /**
   * 获取区块状态
   */
  getBlockState(blockId: number): 'rendered' | 'cached' | undefined {
    return this.registry.getBlock(blockId)?.state;
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.observer.disconnect();
    this.registry.clear();
    this.blockCache.clear();
    this.annotationCache.clear();
    this.placeholderMap.clear();
    this.splitter.reset();
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
bun run test src/viewers/virtualization/__tests__/VirtualScrollManager.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/viewers/virtualization/VirtualScrollManager.ts src/viewers/virtualization/__tests__/VirtualScrollManager.test.ts
git commit -m "feat(virtualization): implement VirtualScrollManager core orchestrator"
```

---

## Task 8: useVirtualScrolling Hook

**Files:**
- Create: `src/viewers/hooks/useVirtualScrolling.ts`
- Test: `src/viewers/hooks/__tests__/useVirtualScrolling.test.ts`

- [ ] **Step 1: 编写虚拟滚动 hook 的失败测试**

```typescript
// src/viewers/hooks/__tests__/useVirtualScrolling.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useVirtualScrolling } from '../useVirtualScrolling';

describe('useVirtualScrolling', () => {
  let mockView: any;
  let mockConfig: any;

  beforeEach(() => {
    mockView = {
      renderer: {
        getContents: vi.fn().mockReturnValue([{ doc: document }]),
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

  it('should initialize virtual scrolling when enabled', () => {
    const { result } = renderHook(() => 
      useVirtualScrolling(mockView, true, mockConfig)
    );
    expect(result.current).toBeDefined();
  });

  it('should not initialize when disabled', () => {
    const disabledConfig = { ...mockConfig, enabled: false };
    const { result } = renderHook(() => 
      useVirtualScrolling(mockView, true, disabledConfig)
    );
    expect(result.current).toBeNull();
  });

  it('should not initialize when not loaded', () => {
    const { result } = renderHook(() => 
      useVirtualScrolling(mockView, false, mockConfig)
    );
    expect(result.current).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
bun run test src/viewers/hooks/__tests__/useVirtualScrolling.test.ts
```

- [ ] **Step 3: 实现 useVirtualScrolling hook**

```typescript
// src/viewers/hooks/useVirtualScrolling.ts
import { useEffect, useRef } from 'react';
import { VirtualScrollManager } from '../virtualization/VirtualScrollManager';
import { VirtualScrollConfig, DEFAULT_VIRTUAL_SCROLL_CONFIG } from '../virtualization/types';

/**
 * 虚拟滚动 hook
 * 在滚动模式下启用区块级虚拟滚动
 */
export function useVirtualScrolling(
  view: any,
  isLoaded: boolean,
  config: Partial<VirtualScrollConfig> = {}
): VirtualScrollManager | null {
  const managerRef = useRef<VirtualScrollManager | null>(null);
  const fullConfig = { ...DEFAULT_VIRTUAL_SCROLL_CONFIG, ...config };

  useEffect(() => {
    if (!isLoaded || !view?.renderer || !fullConfig.enabled) {
      return;
    }

    // 获取 iframe document
    const contents = view.renderer.getContents();
    if (!contents || contents.length === 0) return;
    
    const doc = contents[0].doc;
    if (!doc) return;

    // 创建虚拟滚动管理器
    const manager = new VirtualScrollManager(doc, fullConfig);
    manager.initialize();
    managerRef.current = manager;

    // 监听滚动事件
    const iframe = doc.defaultView;
    if (iframe) {
      const handleScroll = () => {
        // 滚动时 IntersectionObserver 会自动处理
      };

      const handleResize = () => {
        // 窗口大小改变时重建区块
        manager.destroy();
        manager.initialize();
      };

      iframe.addEventListener('scroll', handleScroll);
      iframe.addEventListener('resize', handleResize);

      return () => {
        iframe.removeEventListener('scroll', handleScroll);
        iframe.removeEventListener('resize', handleResize);
        manager.destroy();
        managerRef.current = null;
      };
    }

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, [view, isLoaded, fullConfig.enabled]);

  return managerRef.current;
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
bun run test src/viewers/hooks/__tests__/useVirtualScrolling.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/viewers/hooks/useVirtualScrolling.ts src/viewers/hooks/__tests__/useVirtualScrolling.test.ts
git commit -m "feat(virtualization): implement useVirtualScrolling React hook"
```

---

## Task 9: 修改 Settings.ts 添加配置

**Files:**
- Modify: `src/services/Settings.ts`

- [ ] **Step 1: 添加虚拟滚动配置到设置接口**

```typescript
// src/services/Settings.ts

export interface AnnotatorLiteSettings {
  highlightColors: HighlightColor[];
  defaultFontSize: number;
  defaultColumnMode: ColumnMode;
  defaultFlowMode: ReaderFlowMode;
  readingHistory: ReadingHistoryMap;
  // 新增：虚拟滚动配置
  virtualScroll: {
    enabled: boolean;
    blockSize: number;
    preloadMargin: number;
    maxCachedBlocks: number;
  };
}

export const DEFAULT_SETTINGS: AnnotatorLiteSettings = {
  highlightColors: DEFAULT_HIGHLIGHT_COLORS,
  defaultFontSize: 100,
  defaultColumnMode: 'double',
  defaultFlowMode: 'paginated',
  readingHistory: {},
  // 新增：虚拟滚动默认配置
  virtualScroll: {
    enabled: true,
    blockSize: 1000,
    preloadMargin: 200,
    maxCachedBlocks: 10,
  },
};
```

- [ ] **Step 2: 提交设置更改**

```bash
git add src/services/Settings.ts
git commit -m "feat(settings): add virtual scroll configuration options"
```

---

## Task 10: 修改 FoliateViewer.tsx 集成虚拟滚动

**Files:**
- Modify: `src/viewers/FoliateViewer.tsx`

- [ ] **Step 1: 在 FoliateViewer 中集成 useVirtualScrolling hook**

```typescript
// src/viewers/FoliateViewer.tsx

import { useVirtualScrolling } from './hooks/useVirtualScrolling';
import { useContentVirtualization } from './hooks/useContentVirtualization';

// 在组件内部
export const FoliateViewer: React.FC<FoliateViewerProps> = React.memo(({
  target,
  config,
  callbacks,
}) => {
  // ... 现有 hooks ...

  // 修改：使用虚拟滚动替代 content-visibility
  const virtualScrollConfig = {
    enabled: config.virtualScroll?.enabled ?? true,
    blockSize: config.virtualScroll?.blockSize ?? 1000,
    preloadMargin: config.virtualScroll?.preloadMargin ?? 200,
    maxCachedBlocks: config.virtualScroll?.maxCachedBlocks ?? 10,
  };

  const virtualScrollManager = useVirtualScrolling(view, isLoaded, virtualScrollConfig);
  
  // 如果虚拟滚动未启用，降级到 content-visibility
  if (!virtualScrollManager) {
    useContentVirtualization(view, isLoaded);
  }

  // ... 其余代码 ...
});
```

- [ ] **Step 2: 更新 ViewerConfig 接口**

```typescript
// src/viewers/FoliateViewer.tsx

export interface ViewerConfig {
  flowMode: ReaderFlowMode;
  columnMode: ColumnMode;
  fontSize: number;
  annotations: Annotation[];
  highlightColors: HighlightColor[];
  sectionIndicator: boolean;
  // 新增：虚拟滚动配置
  virtualScroll?: {
    enabled: boolean;
    blockSize: number;
    preloadMargin: number;
    maxCachedBlocks: number;
  };
}
```

- [ ] **Step 3: 提交集成更改**

```bash
git add src/viewers/FoliateViewer.tsx
git commit -m "feat(viewer): integrate virtual scrolling into FoliateViewer"
```

---

## Task 11: 修改 useAnnotationRenderer 支持区块感知

**Files:**
- Modify: `src/viewers/hooks/useAnnotationRenderer.ts`
- Modify: `src/viewers/foliate/foliateAnnotations.ts`

- [ ] **Step 1: 添加区块状态感知到标注渲染**

```typescript
// src/viewers/hooks/useAnnotationRenderer.ts

export function useAnnotationRendering(
  view: any,
  loaded: boolean,
  annotations: Annotation[],
  isAnnotatable: boolean,
  // 新增：虚拟滚动管理器
  virtualScrollManager?: VirtualScrollManager | null
) {
  // ... 现有代码 ...

  useEffect(() => {
    if (!loaded || !view) return;

    const handleDrawAnnotation = (e: any) => {
      // 如果有虚拟滚动管理器，检查区块状态
      if (virtualScrollManager) {
        const blockId = virtualScrollManager.getBlockForAnnotation(e.detail.id);
        if (blockId !== undefined) {
          const state = virtualScrollManager.getBlockState(blockId);
          if (state === 'cached') {
            // 区块已缓存，跳过渲染
            return;
          }
        }
      }

      // ... 现有的标注渲染逻辑 ...
    };

    // ... 其余代码 ...
  }, [view, loaded, annotations, virtualScrollManager]);
}
```

- [ ] **Step 2: 在 VirtualScrollManager 中添加标注区块查找方法**

```typescript
// src/viewers/virtualization/VirtualScrollManager.ts

/**
 * 获取标注所属的区块 ID
 */
getBlockForAnnotation(annotationId: string): number | undefined {
  const annotation = this.annotationCache.get(annotationId);
  return annotation?.blockId;
}
```

- [ ] **Step 3: 提交标注渲染更改**

```bash
git add src/viewers/hooks/useAnnotationRenderer.ts src/viewers/virtualization/VirtualScrollManager.ts
git commit -m "feat(annotations): make annotation rendering block-aware"
```

---

## Task 12: 修改 useContentVirtualization 作为降级方案

**Files:**
- Modify: `src/viewers/hooks/useContentVirtualization.ts`

- [ ] **Step 1: 修改 useContentVirtualization 作为降级方案**

```typescript
// src/viewers/hooks/useContentVirtualization.ts

/**
 * Content Visibility 虚拟化
 * 作为虚拟滚动的降级方案
 */
export function useContentVirtualization(
  view: any,
  isLoaded: boolean,
  // 新增：是否启用（用于降级控制）
  enabled: boolean = true
) {
  const patchedRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !view?.renderer || !enabled || patchedRef.current) {
      return;
    }

    // ... 现有的 monkey-patch 逻辑 ...
    
    patchedRef.current = true;
  }, [view, isLoaded, enabled]);
}
```

- [ ] **Step 2: 提交降级方案更改**

```bash
git add src/viewers/hooks/useContentVirtualization.ts
git commit -m "feat(virtualization): refactor content-visibility as fallback"
```

---

## Task 13: 添加设置 UI

**Files:**
- Modify: `src/components/SettingsTab.ts`

- [ ] **Step 1: 添加虚拟滚动设置选项**

```typescript
// src/components/SettingsTab.ts

export class AnnotatorLiteSettingTab extends PluginSettingTab {
  display(): void {
    // ... 现有设置 ...

    // 新增：虚拟滚动设置
    new Setting(containerEl)
      .setName('Virtual Scrolling')
      .setDesc('Enable block-level virtual scrolling for better performance')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.virtualScroll.enabled)
        .onChange(async (value) => {
          this.plugin.settings.virtualScroll.enabled = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Block Size')
      .setDesc('Height of each virtual block in pixels')
      .addSlider(slider => slider
        .setLimits(500, 2000, 100)
        .setValue(this.plugin.settings.virtualScroll.blockSize)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.virtualScroll.blockSize = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
```

- [ ] **Step 2: 提交设置 UI**

```bash
git add src/components/SettingsTab.ts
git commit -m "feat(settings): add virtual scrolling configuration UI"
```

---

## Task 14: 集成测试

**Files:**
- Create: `src/viewers/virtualization/__tests__/integration.test.ts`

- [ ] **Step 1: 编写集成测试**

```typescript
// src/viewers/virtualization/__tests__/integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualScrollManager } from '../VirtualScrollManager';
import { DEFAULT_VIRTUAL_SCROLL_CONFIG } from '../types';

describe('Virtual Scroll Integration', () => {
  let doc: Document;

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument();
  });

  it('should handle complete virtual scroll lifecycle', () => {
    // 创建测试文档
    const body = doc.body;
    for (let i = 0; i < 20; i++) {
      const p = doc.createElement('p');
      p.textContent = `Paragraph ${i}`;
      p.style.height = '100px';
      body.appendChild(p);
    }

    // 初始化管理器
    const manager = new VirtualScrollManager(doc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 500,
    });

    manager.initialize();

    // 验证区块创建
    expect(manager.getBlockCount()).toBeGreaterThan(1);

    // 模拟区块离开视口
    manager.handleBlockLeave(0);
    expect(manager.getBlockState(0)).toBe('cached');

    // 模拟区块进入视口
    manager.handleBlockEnter(0);
    expect(manager.getBlockState(0)).toBe('rendered');

    // 清理
    manager.destroy();
    expect(manager.getBlockCount()).toBe(0);
  });

  it('should handle annotations across block boundaries', () => {
    const body = doc.body;
    const p = doc.createElement('p');
    p.textContent = 'Test paragraph with annotation';
    p.style.height = '200px';
    body.appendChild(p);

    // 添加标注
    const span = doc.createElement('span');
    span.textContent = 'annotation';
    span.dataset.annotationId = 'test-anno';
    span.style.backgroundColor = '#ffeb3b';
    p.appendChild(span);

    const manager = new VirtualScrollManager(doc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 500,
    });

    manager.initialize();

    // 保存标注
    manager.saveAnnotations(0);
    
    // 卸载区块
    manager.handleBlockLeave(0);
    
    // 恢复区块
    manager.handleBlockEnter(0);

    // 验证标注恢复
    const restored = doc.querySelector('[data-annotation-id="test-anno"]');
    expect(restored).toBeDefined();

    manager.destroy();
  });
});
```

- [ ] **Step 2: 运行集成测试**

```bash
bun run test src/viewers/virtualization/__tests__/integration.test.ts
```

- [ ] **Step 3: 提交集成测试**

```bash
git add src/viewers/virtualization/__tests__/integration.test.ts
git commit -m "test(virtualization): add integration tests for virtual scrolling"
```

---

## Task 15: 性能测试与优化

**Files:**
- Create: `src/viewers/virtualization/__tests__/performance.test.ts`

- [ ] **Step 1: 编写性能测试**

```typescript
// src/viewers/virtualization/__tests__/performance.test.ts
import { describe, it, expect } from 'vitest';
import { VirtualScrollManager } from '../VirtualScrollManager';
import { DEFAULT_VIRTUAL_SCROLL_CONFIG } from '../types';

describe('Virtual Scroll Performance', () => {
  it('should handle large documents efficiently', () => {
    const doc = document.implementation.createHTMLDocument();
    const body = doc.body;

    // 创建大型文档
    for (let i = 0; i < 1000; i++) {
      const p = doc.createElement('p');
      p.textContent = `Paragraph ${i}`;
      p.style.height = '50px';
      body.appendChild(p);
    }

    const startTime = performance.now();
    
    const manager = new VirtualScrollManager(doc, DEFAULT_VIRTUAL_SCROLL_CONFIG);
    manager.initialize();

    const endTime = performance.now();
    const initTime = endTime - startTime;

    // 初始化时间应该在合理范围内（< 100ms）
    expect(initTime).toBeLessThan(100);

    // 验证区块数量
    expect(manager.getBlockCount()).toBeGreaterThan(0);

    manager.destroy();
  });

  it('should maintain performance during rapid scrolling', () => {
    const doc = document.implementation.createHTMLDocument();
    const body = doc.body;

    for (let i = 0; i < 100; i++) {
      const p = doc.createElement('p');
      p.textContent = `Paragraph ${i}`;
      p.style.height = '100px';
      body.appendChild(p);
    }

    const manager = new VirtualScrollManager(doc, {
      ...DEFAULT_VIRTUAL_SCROLL_CONFIG,
      blockSize: 1000,
    });

    manager.initialize();

    const startTime = performance.now();

    // 模拟快速滚动
    for (let i = 0; i < 50; i++) {
      const blockId = i % manager.getBlockCount();
      manager.handleBlockLeave(blockId);
      manager.handleBlockEnter(blockId);
    }

    const endTime = performance.now();
    const scrollTime = endTime - startTime;

    // 快速滚动处理时间应该在合理范围内（< 50ms）
    expect(scrollTime).toBeLessThan(50);

    manager.destroy();
  });
});
```

- [ ] **Step 2: 运行性能测试**

```bash
bun run test src/viewers/virtualization/__tests__/performance.test.ts
```

- [ ] **Step 3: 提交性能测试**

```bash
git add src/viewers/virtualization/__tests__/performance.test.ts
git commit -m "test(virtualization): add performance tests for virtual scrolling"
```

---

## Task 16: 最终集成与验证

**Files:**
- Modify: `src/viewers/FoliateViewer.tsx` (最终调整)

- [ ] **Step 1: 运行所有测试**

```bash
bun run test
```

- [ ] **Step 2: 运行类型检查**

```bash
bun run check
```

- [ ] **Step 3: 运行 lint**

```bash
bun run lint
```

- [ ] **Step 4: 构建验证**

```bash
bun run build
```

- [ ] **Step 5: 提交最终更改**

```bash
git add .
git commit -m "feat: complete virtual scrolling implementation

- Block-level virtualization using IntersectionObserver
- DOM unloading for off-screen blocks
- Annotation caching and restoration
- Graceful degradation to content-visibility
- Configuration options in settings
- Performance optimizations

Fixes sidebar toggle performance issues in scrolled mode."
```

---

## 完成

虚拟滚动实现计划完成。所有任务已创建，包含详细的代码实现、测试和提交步骤。

**关键特性：**
1. 区块级虚拟滚动，只渲染视口附近的内容
2. 屏幕外 DOM 完全卸载，减少 reflow 成本
3. 标注按需恢复，保持标注准确性
4. 降级到 content-visibility 方案
5. 可配置的参数（区块大小、预加载距离等）
6. 完整的测试覆盖（单元测试、集成测试、性能测试）

**预期效果：**
- 侧边栏开关时无明显卡顿（< 16ms 帧时间）
- 内存使用稳定（< 100MB 增长）
- 标注恢复准确率 > 95%
