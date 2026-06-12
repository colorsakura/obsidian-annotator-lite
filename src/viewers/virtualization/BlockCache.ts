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
      this.cache.delete(blockId);
      this.cache.set(blockId, elements);
    }
    return elements;
  }

  /**
   * 缓存区块元素
   */
  set(blockId: number, elements: Node[]): void {
    if (this.cache.has(blockId)) {
      this.cache.delete(blockId);
    }

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
