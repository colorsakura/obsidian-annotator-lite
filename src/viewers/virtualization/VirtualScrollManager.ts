import { VirtualScrollConfig, BlockDescriptor, CachedAnnotation } from './types';
import { BlockSplitter } from './BlockSplitter';
import { BlockRegistry } from './BlockRegistry';
import { ViewportObserver } from './ViewportObserver';
import { BlockCache } from './BlockCache';
import { AnnotationCache } from './AnnotationCache';

/**
 * 虚拟滚动管理器
 * 协调所有虚拟滚动组件（BlockSplitter、BlockRegistry、ViewportObserver、BlockCache、AnnotationCache），
 * 负责区块的生命周期管理、视口驱动的渲染/缓存切换、以及标注的保存与恢复。
 */
export class VirtualScrollManager {
  private doc: Document;
  private config: VirtualScrollConfig;
  private splitter: BlockSplitter;
  private registry: BlockRegistry;
  private observer: ViewportObserver;
  private blockCache: BlockCache;
  private annotationCache: AnnotationCache;
  /** 占位符元素映射（blockId → placeholder） */
  private placeholderMap = new Map<number, Element>();
  /** 每个区块当前被观察的元素（blockId → observed element） */
  private observedElementMap = new Map<number, Element>();

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
   * 初始化虚拟滚动：切分文档并注册所有区块
   * 初始区块已经在 DOM 中（state: 'rendered'），直接观察实际区块元素
   */
  initialize(): void {
    const blocks = this.splitter.split(this.doc);

    for (const block of blocks) {
      this.registry.register(block);

      // 观察区块的第一个元素，以便后续视口事件驱动缓存切换
      if (block.elements.length > 0) {
        const observeTarget = block.elements[0] as Element;
        this.observer.observe(observeTarget, block.id);
        this.observedElementMap.set(block.id, observeTarget);
      }
    }
  }

  /**
   * 处理区块进入视口：从缓存恢复区块内容
   */
  handleBlockEnter(blockId: number): void {
    const block = this.registry.getBlock(blockId);
    if (!block || block.state === 'rendered') return;

    const cachedElements = this.blockCache.get(blockId);
    if (!cachedElements) return;

    const placeholder = this.placeholderMap.get(blockId);
    if (!placeholder) return;

    // 取消观察占位符（M3）
    this.observer.unobserve(placeholder);

    // 记录占位符的位置，用于 insertBefore 保持文档顺序（C2）
    const nextSibling = placeholder.nextElementSibling;
    const parent = placeholder.parentNode;

    // 移除占位符
    placeholder.remove();
    this.placeholderMap.delete(blockId);

    // 在正确的位置恢复 DOM 元素（C2: 使用 insertBefore 保持顺序）
    for (const element of cachedElements) {
      if (element instanceof Element) {
        if (nextSibling && parent) {
          parent.insertBefore(element, nextSibling);
        } else if (parent) {
          parent.appendChild(element);
        }
      }
    }

    this.registry.updateState(blockId, 'rendered');
    this.restoreAnnotations(blockId);

    // 重新观察区块的第一个元素（C3: 恢复的区块需要重新被观察）
    if (cachedElements.length > 0) {
      const observeTarget = cachedElements[0] as Element;
      this.observer.observe(observeTarget, blockId);
      this.observedElementMap.set(blockId, observeTarget);
    }
  }

  /**
   * 处理区块离开视口：缓存区块内容并替换为占位符
   */
  handleBlockLeave(blockId: number): void {
    const block = this.registry.getBlock(blockId);
    if (!block || block.state === 'cached') return;

    // 先保存当前区块中的标注数据
    this.saveAnnotations(blockId);

    // 将区块元素缓存起来
    this.blockCache.set(blockId, block.elements);

    // 取消观察区块元素
    const observedElement = this.observedElementMap.get(blockId);
    if (observedElement) {
      this.observer.unobserve(observedElement);
      this.observedElementMap.delete(blockId);
    }

    // 使用最后一个元素的 nextSibling 定位区块之后的位置（C2）
    // 区块元素是连续的，firstElement 的 nextSibling 可能也是区块元素
    const lastElement = block.elements[block.elements.length - 1] as Element;
    const nextSibling = lastElement.nextElementSibling;
    const parent = lastElement.parentNode;

    // 从 DOM 中移除区块元素
    for (const element of block.elements) {
      if (element instanceof Element) {
        element.remove();
      }
    }

    // 用占位符替代，在正确位置插入以维持文档顺序（C2）
    const placeholder = this.createPlaceholder(block);
    this.placeholderMap.set(blockId, placeholder);

    if (nextSibling && parent) {
      parent.insertBefore(placeholder, nextSibling);
    } else if (parent) {
      parent.appendChild(placeholder);
    }

    // 观察占位符
    this.observer.observe(placeholder, blockId);
    this.registry.updateState(blockId, 'cached');
  }

  /**
   * 创建占位符元素，保持区块原有高度以维持滚动位置
   */
  private createPlaceholder(block: BlockDescriptor): Element {
    const placeholder = this.doc.createElement('div');
    placeholder.style.height = `${block.height}px`;
    placeholder.style.width = '100%';
    placeholder.dataset.blockId = String(block.id);
    return placeholder;
  }

  /**
   * 保存区块中的标注数据到缓存
   * 只查询区块内的元素（M2），保存文本元数据而非 Range 引用（M1）
   */
  private saveAnnotations(blockId: number): void {
    const block = this.registry.getBlock(blockId);
    if (!block) return;

    // 只查询区块内的标注元素（M2: 避免查询整个文档）
    for (const node of block.elements) {
      if (!(node instanceof Element)) continue;

      const highlights = node.querySelectorAll('[data-annotation-id]');
      for (const highlight of highlights) {
        const annotationId = highlight.getAttribute('data-annotation-id');
        if (!annotationId) continue;

        // 保存标注的文本内容和相对位置信息（M1: 避免引用即将被移除的 DOM 节点）
        const text = highlight.textContent || '';
        const parentText = highlight.parentElement?.textContent || '';
        const textOffset = parentText.indexOf(text);

        this.annotationCache.set({
          id: annotationId,
          color: highlight.getAttribute('data-annotation-color') || '',
          text,
          blockId,
          textOffset,
        });
      }
    }
  }

  /**
   * 恢复区块中已缓存的标注
   * 使用文本内容匹配而非 Range 引用，避免引用已断开的 DOM 节点
   */
  private restoreAnnotations(blockId: number): void {
    const annotations = this.annotationCache.getByBlock(blockId);
    for (const annotation of annotations) {
      this.restoreAnnotationByText(annotation);
    }
  }

  /**
   * 基于文本内容在区块内查找并恢复标注高亮
   */
  private restoreAnnotationByText(annotation: CachedAnnotation): void {
    const block = this.registry.getBlock(annotation.blockId);
    if (!block) return;

    for (const node of block.elements) {
      if (!(node instanceof Element)) continue;

      const walker = this.doc.createTreeWalker(node, NodeFilter.SHOW_TEXT);

      let currentNode: Node | null;
      while ((currentNode = walker.nextNode())) {
        const textContent = currentNode.textContent || '';
        const index = textContent.indexOf(annotation.text);

        if (index !== -1) {
          const range = this.doc.createRange();
          range.setStart(currentNode, index);
          range.setEnd(currentNode, index + annotation.text.length);

          const span = this.doc.createElement('span');
          span.style.backgroundColor = annotation.color;
          span.dataset.annotationId = annotation.id;
          span.dataset.annotationColor = annotation.color;

          try {
            range.surroundContents(span);
            return;
          } catch (e) {
            console.warn('Failed to restore annotation:', e);
          }
        }
      }
    }
  }

  /**
   * 获取区块数量
   */
  getBlockCount(): number {
    return this.registry.size;
  }

  /**
   * 获取区块当前状态
   */
  getBlockState(blockId: number): 'rendered' | 'cached' | undefined {
    return this.registry.getBlock(blockId)?.state;
  }

  /**
   * 获取标注所属的区块 ID
   */
  getBlockForAnnotation(annotationId: string): number | undefined {
    const annotation = this.annotationCache.get(annotationId);
    return annotation?.blockId;
  }

  /**
   * 销毁管理器，清理所有资源
   */
  destroy(): void {
    this.observer.disconnect();
    this.registry.clear();
    this.blockCache.clear();
    this.annotationCache.clear();
    this.placeholderMap.clear();
    this.observedElementMap.clear();
    this.splitter.reset();
  }
}
