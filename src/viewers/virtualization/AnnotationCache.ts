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
