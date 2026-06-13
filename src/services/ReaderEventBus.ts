import type { BookMetadata, OutlineItem } from '../types/annotations';
import type { ReaderSectionState } from './ReaderSessionStore';
import { createLogger } from '../utils/logger';

const log = createLogger('ReaderEventBus');

// ─── Event map ────────────────────────────────────────────────────────────
export interface ReaderEventMap {
  // ── View → Controller 事件（由 View emit，Controller 监听） ──────────
  'view:outline-loaded': { items: OutlineItem[] };
  'view:metadata-loaded': { metadata: BookMetadata };
  'view:section-changed': { section: ReaderSectionState };
  'view:session-close': Record<string, never>;
  /** 位置变化（含 CFI） */
  'view:location-changed': { cfi: string; sectionIndex: number };
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
  emit<K extends keyof ReaderEventMap>(event: K, payload: ReaderEventMap[K]): void {
    log.debug('emit:', event as string);
    const set = this.listeners.get(event as string);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (e) {
        log.error(`Error in handler for "${event as string}":`, e);
      }
    }
  }

  /**
   * 取消订阅。
   */
  off<K extends keyof ReaderEventMap>(event: K, handler: EventHandler<ReaderEventMap[K]>): void {
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
