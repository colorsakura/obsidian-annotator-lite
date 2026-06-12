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
   */
  initialize(): void {
    const blocks = this.splitter.split(this.doc);

    for (const block of blocks) {
      this.registry.register(block);

      // 初始区块已经在 DOM 中（state: 'rendered'），无需额外操作
      // 仅对区块创建占位符并观察，以便后续视口事件驱动缓存切换
      const placeholder = this.createPlaceholder(block);
      this.placeholderMap.set(block.id, placeholder);

      this.observer.observe(placeholder, block.id);
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

    // 移除占位符
    const placeholder = this.placeholderMap.get(blockId);
    if (placeholder) {
      placeholder.remove();
      this.placeholderMap.delete(blockId);
    }

    // 将缓存的 DOM 节点重新插入文档
    const parent = this.doc.body;
    for (const element of cachedElements) {
      parent.appendChild(element);
    }

    this.registry.updateState(blockId, 'rendered');
    this.restoreAnnotations(blockId);
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

    // 从 DOM 中移除区块元素
    for (const element of block.elements) {
      if (element instanceof Element) {
        element.remove();
      }
    }

    // 用占位符替代，维持文档滚动高度
    const placeholder = this.createPlaceholder(block);
    this.placeholderMap.set(blockId, placeholder);
    this.doc.body.appendChild(placeholder);

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
   */
  private saveAnnotations(blockId: number): void {
    const block = this.registry.getBlock(blockId);
    if (!block) return;

    const highlights = this.doc.querySelectorAll('[data-annotation-id]');
    for (const highlight of highlights) {
      const annotationId = highlight.getAttribute('data-annotation-id');
      if (!annotationId) continue;

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
   * 恢复区块中已缓存的标注
   */
  private restoreAnnotations(blockId: number): void {
    const annotations = this.annotationCache.getByBlock(blockId);
    for (const annotation of annotations) {
      if (this.isRangeValid(annotation.range)) {
        this.createHighlightElement(annotation);
      }
    }
  }

  /**
   * 检查元素是否属于指定区块
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
   * 检查 Range 是否仍然有效（起止节点仍连接在文档中）
   */
  private isRangeValid(range: Range): boolean {
    try {
      return range.startContainer.isConnected && range.endContainer.isConnected;
    } catch {
      return false;
    }
  }

  /**
   * 创建高亮元素包裹标注 Range
   */
  private createHighlightElement(annotation: CachedAnnotation): void {
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
   * 获取区块当前状态
   */
  getBlockState(blockId: number): 'rendered' | 'cached' | undefined {
    return this.registry.getBlock(blockId)?.state;
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
    this.splitter.reset();
  }
}
