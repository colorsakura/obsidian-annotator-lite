TanStack Query 迁移方案

### 一、当前问题分析

当前标注数据流经 4 层手动同步：

```
  用户操作 → localAnnotations (useState)
    → useEffect 检测变化
      → bus.emit('view:annotations-changed')
        → Controller.wireViewEvents()
          → AnnotationService.handleUserAnnotationsChanged()
            → sessionStore.setAnnotations()
              → 所有订阅者重渲染
```

核心痛点：

- ReaderViewInner 里有 isStoreUpdateRef / lastNotifiedAnnotationsRef 两个 ref 来防止循环通知，代码复杂
- 数据流向非声明式：View 手动 emit → Controller 手动路由 → Service 手动更新 Store
- 新增状态字段需要改 EventBus 类型定义、wireViewEvents、SessionStore setter 三处

### 二、迁移目标

```
  TanStack Query (缓存 + 自动重渲染)
    ↓ useQuery          ↑ useMutation + invalidateQueries
  AnnotationRepository  ←→  Markdown 文件
```

保留：

- ReaderEventBus — 只保留 UI 事件（view:outline-loaded、view:metadata-loaded、view:section-changed、view:session-close
  、view:location-changed）
- ReaderSessionStore — 只管会话/UI 状态（outline、metadata、section、navigationTarget）
- AnnotationService — 保留为纯业务逻辑层，移除与 SessionStore 的耦合

移除：

- view:annotations-changed 事件
- ReaderSessionStore.annotations 字段
- ReaderViewInner 中的 isStoreUpdateRef / lastNotifiedAnnotationsRef / useEffect 同步逻辑

### 三、新增/变更文件清单

┌───────────────────────────────────┬──────┬──────────────────────────────────────────────────────────────────────────┐
│ 文件 │ 操作 │ 说明 │
├───────────────────────────────────┼──────┼──────────────────────────────────────────────────────────────────────────┤
│ src/hooks/useAnnotations.ts │ 新增 │ TanStack Query hooks（useAnnotations, useCreateAnnotation, │
│ │ │ useUpdateAnnotation, useDeleteAnnotation） │
├───────────────────────────────────┼──────┼──────────────────────────────────────────────────────────────────────────┤
│ src/providers/QueryProvider.tsx │ 新增 │ QueryClient Provider，挂在 BaseReactView 的 React 树根部 │
├───────────────────────────────────┼──────┼──────────────────────────────────────────────────────────────────────────┤
│ src/services/AnnotationService.ts │ 修改 │ 移除 SessionStore 依赖，变为纯数据操作 │
├───────────────────────────────────┼──────┼──────────────────────────────────────────────────────────────────────────┤
│ src/services/ReaderSessionStore.t │ 修改 │ 移除 annotations 字段和 setAnnotations() │
│ s │ │ │
├───────────────────────────────────┼──────┼──────────────────────────────────────────────────────────────────────────┤
│ src/services/ReaderEventBus.ts │ 修改 │ 移除 view:annotations-changed 事件 │
├───────────────────────────────────┼──────┼──────────────────────────────────────────────────────────────────────────┤
│ src/services/ReaderController.ts │ 修改 │ 移除 wireViewEvents 中的 annotations 分支，navigateToAnnotation 改用 │
│ │ │ queryClient │
├───────────────────────────────────┼──────┼──────────────────────────────────────────────────────────────────────────┤
│ src/components/ReaderViewInner.ts │ 修改 │ 移除手动状态同步，改用 useAnnotations() + mutation hooks │
│ x │ │ │
├───────────────────────────────────┼──────┼──────────────────────────────────────────────────────────────────────────┤
│ src/views/BaseReactView.ts │ 修改 │ 在 Provider 树中加入 QueryClientProvider │
├───────────────────────────────────┼──────┼──────────────────────────────────────────────────────────────────────────┤
│ src/services/ReaderAPI.ts │ 修改 │ updateAnnotation / deleteAnnotation 签名不变，内部实现调整 │
├───────────────────────────────────┼──────┼──────────────────────────────────────────────────────────────────────────┤
│ package.json │ 修改 │ 添加 @tanstack/react-query 依赖 │
└───────────────────────────────────┴──────┴──────────────────────────────────────────────────────────────────────────┘

### 四、核心实现设计

#### 4.1 QueryClient 初始化

```typescript
// src/providers/QueryProvider.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity, // 标注数据不会过期（本地文件）
      gcTime: Infinity, // 不自动清理（会话期间常驻）
      refetchOnWindowFocus: false, // Obsidian 无此概念
      refetchOnMount: false, // 避免重复读取文件
    },
    mutations: {
      retry: 1, // 写入失败重试一次
    },
  },
});

// 模块级单例（与 setSessionStore 同模式）
let _queryClient: QueryClient | null = null;
export function setQueryClient(client: QueryClient): void {
  _queryClient = client;
}
export function getQueryClient(): QueryClient | null {
  return _queryClient;
}
```

#### 4.2 Query Hooks

```typescript
  // src/hooks/useAnnotations.ts
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import type { Annotation } from '../types/annotations';
  import type { AnnotationRepository } from '../services/AnnotationRepository';
  import { TFile, App } from 'obsidian';

  // Query Key
  export const annotationKeys = {
    all: ['annotations'] as const,
    byFile: (sourcePath: string) => ['annotations', sourcePath] as const,
  };

  // 读取标注
  export function useAnnotations(
    app: App,
    repository: AnnotationRepository,
    sourcePath: string | null,
    targetUri: string | null,
  ) {
    return useQuery({
      queryKey: annotationKeys.byFile(sourcePath ?? ''),
      queryFn: async () => {
        const file = app.vault.getAbstractFileByPath(sourcePath!);
        if (!(file instanceof TFile)) return [];
        return repository.load(file, targetUri);
      },
      enabled: !!sourcePath,
    });
  }

  // 创建标注（乐观更新）
  export function useCreateAnnotation(sourcePath: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (annotation: Annotation) => annotation, // 不做持久化，由 FoliateViewer 触发批量保存
      onMutate: async (newAnnotation) => {
        await queryClient.cancelQueries({ queryKey: annotationKeys.byFile(sourcePath) });
        const previous = queryClient.getQueryData<Annotation[]>(annotationKeys.byFile(sourcePath));
        queryClient.setQueryData<Annotation[]>(
          annotationKeys.byFile(sourcePath),
          (old = [...old, newAnnotation],
        );
        return { previous };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(annotationKeys.byFile(sourcePath), context.previous);
        }
      },
    });
  }

  // 批量更新标注（用于 FoliateViewer 批量同步）
  export function useBatchUpdateAnnotations(
    app: App,
    repository: AnnotationRepository,
    sourcePath: string,
  ) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (annotations: Annotation[]) => {
        const file = app.vault.getAbstractFileByPath(sourcePath);
        if (!(file instanceof TFile)) return;
        await repository.save(file, annotations);
      },
      onSuccess: (_data, annotations) => {
        // 直接用 mutation 的入参更新缓存，无需 refetch
        queryClient.setQueryData(annotationKeys.byFile(sourcePath), annotations);
      },
    });
  }
```

#### 4.3 AnnotationService 瘦身

```typescript
// 修改后的 AnnotationService — 移除 SessionStore 依赖
export class AnnotationService {
  constructor(
    private app: App,
    private repository: AnnotationRepository,
    private annotationIndex: AnnotationIndexService,
    // 移除 sessionStore 依赖
  ) {}

  async load(sourceFile: TFile, targetUri: string | null): Promise<Annotation[]> {
    return this.repository.load(sourceFile, targetUri);
  }

  async update(id: string, updates: Partial<Annotation>, sourcePath: string): Promise<void> {
    const queryClient = getQueryClient();
    if (!queryClient) return;

    const annotations = queryClient.getQueryData<Annotation[]>(annotationKeys.byFile(sourcePath));
    if (!annotations) return;

    const idx = annotations.findIndex((a) => a.id === id);
    if (idx === -1) return;

    const updated = { ...annotations[idx], ...updates, updated: new Date().toISOString() };
    const newAnnotations = [...annotations];
    newAnnotations[idx] = updated;

    await this.persist(newAnnotations, sourcePath, queryClient);
  }

  async delete(id: string, sourcePath: string): Promise<void> {
    const queryClient = getQueryClient();
    if (!queryClient) return;

    const annotations = queryClient.getQueryData<Annotation[]>(annotationKeys.byFile(sourcePath));
    if (!annotations) return;

    const newAnnotations = annotations.filter((a) => a.id !== id);
    await this.persist(newAnnotations, sourcePath, queryClient);
  }

  private async persist(
    annotations: Annotation[],
    sourcePath: string,
    queryClient: QueryClient,
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) return;

    await this.repository.save(file, annotations);
    queryClient.setQueryData(annotationKeys.byFile(sourcePath), annotations);
    this.annotationIndex.rebuildIndex(sourcePath, annotations);
  }
}
```

#### 4.4 ReaderViewInner 简化

```typescript
  // 简化后的 ReaderViewInner 核心变化
  const ReaderViewInner: React.FC<ReaderViewInnerProps> = ({ targetFile, ... }) => {
    const reader = useReader();
    const queryClient = useQueryClient();

    // 一行取代整个 useEffect + ref + bus.emit 同步链路
    const { data: storeAnnotations = [] } = useAnnotations(app, repository, sourcePath, targetUri);
    const batchUpdate = useBatchUpdateAnnotations(app, repository, sourcePath);

    // 移除 localAnnotations useState，直接用 storeAnnotations
    // 移除 isStoreUpdateRef、lastNotifiedAnnotationsRef
    // 移除 annotations-changed 的 useEffect

    const addAnnotation = useCallback((params) => {
      if (!targetUri) return;
      const annotation = createAnnotation({ ...params, uri: targetUri });
      // 乐观更新：立即写入缓存 → FoliateViewer 重渲染
      queryClient.setQueryData<Annotation[]>(
        annotationKeys.byFile(sourcePath),
        (old = [...old, annotation],
      );
      // 异步持久化
      batchUpdate.mutate([...storeAnnotations, annotation]);
    }, [targetUri, sourcePath, storeAnnotations, batchUpdate, queryClient]);

    const deleteAnnotation = useCallback((id: string) => {
      const newAnnotations = storeAnnotations.filter((a) => a.id !== id);
      queryClient.setQueryData(annotationKeys.byFile(sourcePath), newAnnotations);
      batchUpdate.mutate(newAnnotations);
      reader.deleteAnnotation(id); // 保留给 AnnotationIndex 更新
    }, [storeAnnotations, sourcePath, batchUpdate, reader, queryClient]);

    // ... 其余不变
  };
```

#### 4.5 ReaderEventBus 瘦身

```typescript
// 移除 'view:annotations-changed'，保留其余
export interface ReaderEventMap {
  'view:outline-loaded': { items: OutlineItem[] };
  'view:metadata-loaded': { metadata: BookMetadata };
  'view:section-changed': { section: ReaderSectionState };
  // 'view:annotations-changed' → 删除
  'view:session-close': Record<string, never>;
  'view:location-changed': { cfi: string; sectionIndex: number };
}
```

#### 4.6 wireViewEvents 简化

```typescript
  // ReaderController.wireViewEvents() — 移除 annotations 分支
  private wireViewEvents(): void {
    this.bus.on('view:outline-loaded', ({ items }) => this.sessionStore.setOutline(items));
    this.bus.on('view:metadata-loaded', ({ metadata }) => this.sessionStore.setMetadata(metadata));
    this.bus.on('view:section-changed', ({ section }) => this.sessionStore.setSection(section));
    this.bus.on('view:session-close', () => this.closeCurrentSession());
    this.bus.on('view:location-changed', ({ cfi }) => { this.lastKnownCfi = cfi; });
    // annotations 分支删除
  }
```

### 五、迁移步骤（分 4 个 PR）

┌──────┬───────────────────────────────────────────────────────────────────────────────────┬──────────────────────────┐
│ 阶段 │ 内容 │ 风险 │
├──────┼───────────────────────────────────────────────────────────────────────────────────┼──────────────────────────┤
│ PR 1 │ 添加 @tanstack/react-query 依赖 + QueryProvider + setQueryClient/getQueryClient │ 低 — 不改现有逻辑 │
│ │ 模块单例 │ │
├──────┼───────────────────────────────────────────────────────────────────────────────────┼──────────────────────────┤
│ PR 2 │ 新增 useAnnotations / useBatchUpdateAnnotations hooks + annotationKeys │ 低 — 纯新增，不影响现有 │
│ │ │ 代码 │
├──────┼───────────────────────────────────────────────────────────────────────────────────┼──────────────────────────┤
│ PR 3 │ 重构 ReaderViewInner：移除手动同步，改用 hooks；重构 AnnotationService 移除 │ 中 — 核心改动，需充分测 │
│ │ SessionStore 依赖 │ 试 │
├──────┼───────────────────────────────────────────────────────────────────────────────────┼──────────────────────────┤
│ PR 4 │ 清理：移除 view:annotations-changed 事件、sessionStore.annotations、 │ 低 — 纯删除 │
│ │ sessionStore.setAnnotations、wireViewEvents 中的 annotations 分支 │ │
└──────┴───────────────────────────────────────────────────────────────────────────────────┴──────────────────────────┘

### 六、风险与注意事项

1.  序列化一致性：AnnotationRepository.save() → load() 的往返必须保证数据不变。当前 vault.process 是原子的
    ，generateMarkdownWithAnnotations 会重新格式化 JSON——需要验证 refetch 后数据是否 === 上一次 setQueryData 的值，否则
    会触发不必要的重渲染。
2.  QueryClient 生命周期：会话关闭时需要 queryClient.removeQueries({ queryKey: annotationKeys.byFile(sourcePath) }) 清理
    缓存，避免内存泄漏。
3.  并发写入：batchUpdate.mutate 可能在上一次写入完成前又被调用（用户快速连续标注）。TanStack Query 默认不排队
    mutations，需要设置 mutationFn 内部做防重入（复用当前的 persistInProgress 标志）。
4.  BaseReactView Provider 嵌套：QueryClientProvider 需要放在 AppContext.Provider 之外（或之内），确保所有 React 组件都
    能访问。
