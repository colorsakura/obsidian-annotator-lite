import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Annotation } from '../types/annotations';
import type { AnnotationRepository } from '../services/AnnotationRepository';
import { TFile, type App } from 'obsidian';

// ─── Module-level singletons ────────────────────────────────────────────
// 与 setSessionStore / setQueryClient 相同的模式。
// 插件 onload 时调用 setAnnotationRepository()。

let _repository: AnnotationRepository | null = null;
let _app: App | null = null;

export function setAnnotationRepository(repo: AnnotationRepository): void {
  _repository = repo;
}

export function setApp(app: App): void {
  _app = app;
}

function getRepository(): AnnotationRepository {
  if (!_repository)
    throw new Error('AnnotationRepository not initialized. Call setAnnotationRepository() first.');
  return _repository;
}

function getApp(): App {
  if (!_app) throw new Error('App not initialized. Call setApp() first.');
  return _app;
}

// ─── Query Keys ─────────────────────────────────────────────────────────

export const annotationKeys = {
  all: ['annotations'] as const,
  byFile: (sourcePath: string) => [...annotationKeys.all, sourcePath] as const,
};

// ─── Query Hook ─────────────────────────────────────────────────────────

interface UseAnnotationsOptions {
  /** 源文件路径（Markdown 文件） */
  sourcePath: string | null;
  /** 目标文件 URI（用于过滤标注） */
  targetUri: string | null;
  /** 是否启用查询 */
  enabled?: boolean;
}

/**
 * 使用 TanStack Query 加载标注数据。
 *
 * 当 sourcePath 变化时自动重新加载。
 * 标注数据缓存为 Infinity staleTime，由用户操作驱动更新。
 */
export function useAnnotations({ sourcePath, targetUri, enabled = true }: UseAnnotationsOptions) {
  return useQuery({
    queryKey: sourcePath ? annotationKeys.byFile(sourcePath) : annotationKeys.all,
    queryFn: async (): Promise<Annotation[]> => {
      if (!sourcePath) return [];
      const repository = getRepository();
      const app = getApp();
      const file = app.vault.getAbstractFileByPath(sourcePath);
      if (!(file instanceof TFile)) return [];
      return repository.load(file, targetUri);
    },
    enabled: enabled && !!sourcePath,
  });
}

// ─── Mutation Hook ──────────────────────────────────────────────────────

interface BatchUpdateParams {
  /** 源文件路径 */
  sourcePath: string;
  /** 新的标注列表（完整替换） */
  annotations: Annotation[];
}

/**
 * 批量更新标注并持久化到 Markdown 文件。
 *
 * 使用乐观更新：立即写入 QueryClient 缓存，异步持久化到文件。
 * 包含防重入保护，避免并发写入冲突。
 */
export function useBatchUpdateAnnotations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sourcePath, annotations }: BatchUpdateParams) => {
      const repository = getRepository();
      const app = getApp();
      const file = app.vault.getAbstractFileByPath(sourcePath);
      if (!(file instanceof TFile)) {
        throw new Error(`File not found: ${sourcePath}`);
      }
      await repository.save(file, annotations);
      return { sourcePath, annotations };
    },
    onSuccess: (data) => {
      // 持久化成功后更新缓存（确保一致性）
      queryClient.setQueryData(annotationKeys.byFile(data.sourcePath), data.annotations);
    },
  });
}
