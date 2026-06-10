import { createContext, useContext, useEffect, useState } from 'react';
import type {
  ReaderSessionState,
  ReaderSessionStore,
} from '../services/ReaderSessionStore';

// ─── Context ──────────────────────────────────────────────────────────────
export const ReaderStoreContext = createContext<ReaderSessionStore | null>(null);

// ─── Module-level provider ────────────────────────────────────────────────
// Obsidian 的 registerView 工厂函数无法传参，因此使用模块级单例。
// 插件 onload 时调用 setSessionStore()，所有 React 组件通过 useSessionStore() 访问。
let _store: ReaderSessionStore | null = null;

export function setSessionStore(store: ReaderSessionStore): void {
  _store = store;
}

export function getSessionStore(): ReaderSessionStore | null {
  return _store;
}

// ─── Hook ─────────────────────────────────────────────────────────────────
/**
 * 订阅 ReaderSessionStore，返回当前会话状态。
 * 状态变化时自动触发 React 重渲染。
 */
export function useSessionStore(): ReaderSessionState | null {
  const store = useContext(ReaderStoreContext);
  const [state, setState] = useState<ReaderSessionState | null>(
    () => store?.getSnapshot() ?? null,
  );

  useEffect(() => {
    if (!store) return;
    // 同步最新快照（可能在 useState 初始化后又变了）
    setState(store.getSnapshot());
    return store.subscribe((newState) => {
      setState(newState);
    });
  }, [store]);

  return state;
}

/**
 * 订阅 SessionStore 的某个字段，仅在该字段变化时重渲染。
 * 适用于只需要部分状态的组件，避免无关状态变化引起重渲染。
 */
export function useSessionField<K extends keyof ReaderSessionState>(
  field: K,
): ReaderSessionState[K] | null {
  const store = useContext(ReaderStoreContext);
  const [value, setValue] = useState<ReaderSessionState[K] | null>(
    () => store?.getSnapshot()?.[field] ?? null,
  );

  useEffect(() => {
    if (!store) return;
    const snapshot = store.getSnapshot();
    if (snapshot) setValue(snapshot[field]);
    return store.subscribe((newState) => {
      if (newState) setValue(newState[field]);
    });
  }, [store, field]);

  return value;
}
