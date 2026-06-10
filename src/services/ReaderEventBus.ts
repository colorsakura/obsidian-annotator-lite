import type { Annotation, BookMetadata, NavigationTarget, OutlineItem } from '../types/annotations';
import type { ReaderSectionState } from './ReaderSessionStore';

// ─── Event map ────────────────────────────────────────────────────────────
export interface ReaderEventMap {
  /** 标注发生变化（用户操作或外部更新） */
  'annotations:changed': { annotations: Annotation[]; source: 'user' | 'external' };
  /** 导航目标变化（点击目录/标注跳转） */
  'navigation:target': { target: NavigationTarget };
  /** 目录加载完成 */
  'outline:loaded': { items: OutlineItem[] };
  /** 书籍元数据加载完成 */
  'metadata:loaded': { metadata: BookMetadata };
  /** 章节位置变化 */
  'section:changed': { section: ReaderSectionState };
  /** 会话关闭 */
  'session:closed': Record<string, never>;
  /** 切换视图 */
  'view:switch': { to: 'outline' | 'annotations' | 'reader' };
}

// ─── Types ────────────────────────────────────────────────────────────────
type EventHandler<T> = (payload: T) => void;

// ─── ReaderEventBus ───────────────────────────────────────────────────────
/**
 * 事件总线：解耦 ReaderController 与各 View 之间的通信。
 *
 * - 替代 setOnXxx 回调接线模式
 * - 支持类型安全的事件发布/订阅
 * - 返回 unsubscribe 函数，便于清理
 */
export class ReaderEventBus {
  private listeners = new Map<string, Set<EventHandler<any>>>();

  /**
   * 订阅事件。返回取消订阅函数。
   */
  on<K extends keyof ReaderEventMap>(
    event: K,
    handler: EventHandler<ReaderEventMap[K]>,
  ): () => void {
    let set = this.listeners.get(event as string);
    if (!set) {
      set = new Set();
      this.listeners.set(event as string, set);
    }
    set.add(handler);

    return () => {
      set!.delete(handler);
      if (set!.size === 0) {
        this.listeners.delete(event as string);
      }
    };
  }

  /**
   * 发布事件。所有订阅者同步调用。
   */
  emit<K extends keyof ReaderEventMap>(
    event: K,
    payload: ReaderEventMap[K],
  ): void {
    const set = this.listeners.get(event as string);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (e) {
        console.error(`[ReaderEventBus] Error in handler for "${event as string}":`, e);
      }
    }
  }

  /**
   * 取消订阅。
   */
  off<K extends keyof ReaderEventMap>(
    event: K,
    handler: EventHandler<ReaderEventMap[K]>,
  ): void {
    const set = this.listeners.get(event as string);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.listeners.delete(event as string);
      }
    }
  }

  /**
   * 清除所有订阅（用于会话关闭或插件卸载）。
   */
  clear(): void {
    this.listeners.clear();
  }
}
