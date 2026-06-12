import React, { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Module-level singleton ─────────────────────────────────────────────
// 与 setSessionStore 相同的模式：解决 Obsidian registerView 工厂函数无法传参的问题。
// 插件 onload 时调用 setQueryClient()，所有 React 组件通过 QueryClientProvider 访问。

let _queryClient: QueryClient | null = null;

/**
 * 初始化 QueryClient 单例。在插件 onload 时调用一次。
 */
export function setQueryClient(client: QueryClient): void {
  _queryClient = client;
}

/**
 * 获取 QueryClient 单例。
 */
export function getQueryClient(): QueryClient | null {
  return _queryClient;
}

/**
 * 创建预配置的 QueryClient 实例。
 *
 * 配置说明：
 * - staleTime / gcTime: Infinity — 标注数据由用户操作驱动，不需要自动刷新
 * - retry: 1 — 写入失败时重试一次
 * - refetchOnWindowFocus: false — Obsidian 无窗口焦点切换场景
 * - refetchOnReconnect: false — 标注数据不依赖网络
 */
export function createConfiguredQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: Infinity,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
      },
      mutations: {
        retry: 1,
      },
    },
  });
}

// ─── Provider 组件 ──────────────────────────────────────────────────────

interface QueryProviderProps {
  children: ReactNode;
}

/**
 * QueryClientProvider 包装组件。
 * 自动从模块级单例获取 QueryClient，无需 props 传入。
 */
export function QueryProvider({ children }: QueryProviderProps): React.ReactElement | null {
  const client = _queryClient;
  if (!client) return null;

  return React.createElement(QueryClientProvider, { client }, children);
}
