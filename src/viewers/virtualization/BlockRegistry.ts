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
