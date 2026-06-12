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

    const blockElements = this.getBlockElements(body);

    for (const element of blockElements) {
      const elementHeight = this.getElementHeight(element);

      if (currentHeight + elementHeight > this.blockSize && currentElements.length > 0) {
        blocks.push(this.createBlock(currentElements, startOffset, currentHeight));
        startOffset += currentHeight;
        currentElements = [];
        currentHeight = 0;
      }

      currentElements.push(element);
      currentHeight += elementHeight;
    }

    if (currentElements.length > 0) {
      blocks.push(this.createBlock(currentElements, startOffset, currentHeight));
    }

    return blocks;
  }

  /**
   * 获取容器中的块级元素
   * 递归遍历，但遇到块级选择器匹配的元素时不再深入其子节点
   */
  private getBlockElements(container: Element): Element[] {
    const elements: Element[] = [];
    const blockSelectors =
      'p, div, h1, h2, h3, h4, h5, h6, blockquote, ul, ol, li, table, pre, hr, figure, figcaption';

    for (const child of Array.from(container.children)) {
      if (child.matches(blockSelectors)) {
        elements.push(child);
      } else {
        elements.push(...this.getBlockElements(child));
      }
    }

    return elements;
  }

  /**
   * 获取元素高度
   */
  private getElementHeight(element: Element): number {
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
   * 重置区块 ID 计数器
   */
  reset(): void {
    this.blockIdCounter = 0;
  }
}
