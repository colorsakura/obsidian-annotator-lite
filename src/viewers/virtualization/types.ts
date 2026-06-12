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
