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
