TanStack Query 迁移实施计划

## 概述

将标注数据的手动同步机制迁移到 TanStack Query，消除 isStoreUpdateRef / lastNotifiedAnnotationsRef 等防循环 ref，简化数据流为声明
式的 query/mutation 模式。

────────────────────────────────────────────────────────────────────────────────

## 架构决策

- QueryClient 使用模块级单例：复用 setSessionStore 模式，解决 Obsidian registerView 工厂函数无法传参的问题
- 保留 ReaderEventBus：仅用于 UI 事件（outline、metadata、section、location、session-close），移除 view:annotations-changed
- AnnotationService 瘦身：移除 SessionStore 依赖，改为直接操作 QueryClient 缓存
- 乐观更新：用户添加标注时立即写入缓存，异步持久化到 Markdown

────────────────────────────────────────────────────────────────────────────────

## 依赖图

```
  @tanstack/react-query (package.json)
      │
      ├── QueryProvider.tsx (新文件)
      │       │
      │       ├── BaseReactView.ts (加入 Provider)
      │       │
      │       └── useAnnotations.ts (新文件 - hooks)
      │               │
      │               ├── ReaderViewInner.tsx (改用 hooks)
      │               │
      │               └── AnnotationService.ts (移除 SessionStore 依赖)
      │                       │
      │                       ├── ReaderSessionStore.ts (移除 annotations 字段)
      │                       │
      │                       └── ReaderEventBus.ts (移除 annotations-changed 事件)
      │
      └── ReaderController.ts (简化 wireViewEvents)
```

────────────────────────────────────────────────────────────────────────────────

## 任务列表

### Phase 1: 基础设施（低风险）

#### Task 1: 添加 TanStack Query 依赖

描述： 在 package.json 中添加 @tanstack/react-query 依赖。

验收标准：

- [ ] @tanstack/react-query 出现在 dependencies 中
- [ ] bun install 成功
- [ ] bun run check 通过（无类型错误）

验证：

- [ ] bun install 无报错
- [ ] bun run check 通过

依赖： 无

预估范围： XS（1 文件）

────────────────────────────────────────────────────────────────────────────────

#### Task 2: 创建 QueryProvider 并集成到 BaseReactView

描述： 创建 src/providers/QueryProvider.tsx，实现 QueryClient 单例和 Provider 组件。修改 BaseReactView 在 React 树根部添加
QueryClientProvider。

验收标准：

- [ ] src/providers/QueryProvider.tsx 存在，导出 setQueryClient / getQueryClient
- [ ] QueryClient 配置符合规格（staleTime: Infinity, gcTime: Infinity 等）
- [ ] BaseReactView 的 render 方法中包含 <QueryClientProvider>
- [ ] 现有功能不受影响（无回归）

验证：

- [ ] bun run check 通过
- [ ] 手动测试：打开一个标注文件，阅读器正常加载

依赖： Task 1

文件：

- src/providers/QueryProvider.tsx（新增）
- src/views/BaseReactView.ts（修改）

预估范围： S（2 文件）

────────────────────────────────────────────────────────────────────────────────

### Phase 2: Query Hooks（低风险）

#### Task 3: 创建 useAnnotations query hook

描述： 创建 src/hooks/useAnnotations.ts，实现 useAnnotations query hook 用于读取标注数据。

验收标准：

- [ ] annotationKeys 常量定义正确（all, byFile）
- [ ] useAnnotations hook 使用 useQuery 从 AnnotationRepository 加载数据
- [ ] enabled 参数正确处理 sourcePath 为 null 的情况
- [ ] 类型定义正确

验证：

- [ ] bun run check 通过
- [ ] 代码审查：hook 签名与规格一致

依赖： Task 2

文件：

- src/hooks/useAnnotations.ts（新增）

预估范围： S（1 文件）

────────────────────────────────────────────────────────────────────────────────

#### Task 4: 创建 useBatchUpdateAnnotations mutation hook

描述： 在 src/hooks/useAnnotations.ts 中添加 useBatchUpdateAnnotations mutation hook，用于批量更新并持久化标注。

验收标准：

- [ ] useBatchUpdateAnnotations 使用 useMutation
- [ ] mutationFn 调用 repository.save()
- [ ] onSuccess 使用 queryClient.setQueryData 更新缓存
- [ ] 防重入保护（复用 persistInProgress 标志或类似机制）

验证：

- [ ] bun run check 通过
- [ ] 代码审查：mutation 逻辑完整

依赖： Task 3

文件：

- src/hooks/useAnnotations.ts（修改）

预估范围： XS（1 文件）

────────────────────────────────────────────────────────────────────────────────

### Phase 3: 核心重构（中风险）

#### Task 5: 重构 ReaderViewInner 使用 TanStack Query hooks

描述： 移除 ReaderViewInner 中的手动状态同步逻辑，改用 useAnnotations 和 useBatchUpdateAnnotations hooks。

验收标准：

- [ ] 移除 isStoreUpdateRef 和 lastNotifiedAnnotationsRef
- [ ] 移除同步 storeAnnotations 到 localAnnotations 的 useEffect
- [ ] 移除 emit view:annotations-changed 的 useEffect
- [ ] addAnnotation 使用乐观更新（queryClient.setQueryData）+ 异步持久化
- [ ] deleteAnnotation 使用乐观更新 + 异步持久化
- [ ] 标注数据直接从 query hook 获取，不再使用 useState

验证：

- [ ] bun run check 通过
- [ ] 手动测试：添加标注 → 标注立即显示 → 切换笔记再回来 → 标注仍存在
- [ ] 手动测试：删除标注 → 标注立即消失 → 切换笔记再回来 → 标注已删除

依赖： Task 4

文件：

- src/components/ReaderViewInner.tsx（修改）

预估范围： M（1 文件，但改动较大）

────────────────────────────────────────────────────────────────────────────────

#### Task 6: 重构 AnnotationService 移除 SessionStore 依赖

描述： 修改 AnnotationService，移除对 ReaderSessionStore 的依赖，改为直接操作 QueryClient 缓存。

验收标准：

- [ ] 构造函数移除 sessionStore 参数
- [ ] update / delete 方法从 QueryClient 读取数据而非 SessionStore
- [ ] persist 方法使用 queryClient.setQueryData 更新缓存
- [ ] handleUserAnnotationsChanged 方法移除或重构（不再需要）
- [ ] 保留 persistInProgress 防重入保护

验证：

- [ ] bun run check 通过
- [ ] 手动测试：通过 ReaderAPI 更新/删除标注功能正常

依赖： Task 5

文件：

- src/services/AnnotationService.ts（修改）

预估范围： M（1 文件）

────────────────────────────────────────────────────────────────────────────────

#### Task 7: 更新 ReaderController 适配新 AnnotationService

描述： 修改 ReaderController，更新 AnnotationService 的实例化方式，简化 wireViewEvents。

验收标准：

- [ ] AnnotationService 实例化不再传入 sessionStore
- [ ] wireViewEvents 移除 view:annotations-changed 分支
- [ ] navigateToAnnotation 如需访问标注数据，改用 QueryClient

验证：

- [ ] bun run check 通过
- [ ] 手动测试：从标注列表跳转到标注位置功能正常

依赖： Task 6

文件：

- src/services/ReaderController.ts（修改）

预估范围： S（1 文件）

────────────────────────────────────────────────────────────────────────────────

### Phase 4: 清理（低风险）

#### Task 8: 移除 ReaderEventBus 中的 annotations-changed 事件

描述： 从 ReaderEventMap 中移除 view:annotations-changed 事件定义。

验收标准：

- [ ] view:annotations-changed 从 ReaderEventMap 中删除
- [ ] 无其他代码引用此事件（grep 验证）

验证：

- [ ] bun run check 通过
- [ ] grep -r "annotations-changed" src/ 无结果

依赖： Task 7

文件：

- src/services/ReaderEventBus.ts（修改）

预估范围： XS（1 文件）

────────────────────────────────────────────────────────────────────────────────

#### Task 9: 移除 ReaderSessionStore 中的 annotations 字段

描述： 从 ReaderSessionStore 和 ReaderSessionState 中移除 annotations 字段和 setAnnotations 方法。

验收标准：

- [ ] ReaderSessionState 接口移除 annotations 字段
- [ ] ReaderSessionStore 类移除 setAnnotations 方法
- [ ] startSession 不再接收 annotations 参数
- [ ] 所有调用点已更新

验证：

- [ ] bun run check 通过
- [ ] grep -r "setAnnotations\|\.annotations" src/ 确认无残留引用

依赖： Task 8

文件：

- src/services/ReaderSessionStore.ts（修改）

预估范围： S（1 文件）

────────────────────────────────────────────────────────────────────────────────

#### Task 10: 更新 useSessionField 和相关 hooks

描述： 更新 useSessionField 的类型定义，移除 annotations 字段的访问。更新所有使用 useSessionField('annotations') 的地方。

验收标准：

- [ ] useSessionField('annotations') 调用已全部移除或替换
- [ ] 类型系统正确反映 annotations 字段的移除

验证：

- [ ] bun run check 通过
- [ ] grep -r "useSessionField.\*annotations" src/ 无结果

依赖： Task 9

文件：

- src/contexts/ReaderStoreContext.ts（如有类型约束需更新）
- src/components/ReaderViewInner.tsx（已在 Task 5 中修改）

预估范围： XS（1-2 文件）

────────────────────────────────────────────────────────────────────────────────

#### Task 11: 会话关闭时清理 QueryClient 缓存

描述： 在会话关闭时调用 queryClient.removeQueries 清理标注缓存，避免内存泄漏。

验收标准：

- [ ] 会话关闭时调用 queryClient.removeQueries({ queryKey: annotationKeys.byFile(sourcePath) })
- [ ] 清理逻辑在正确的位置（ReaderController.closeSession 或类似）

验证：

- [ ] bun run check 通过
- [ ] 手动测试：打开/关闭多个阅读会话，内存无明显泄漏

依赖： Task 5

文件：

- src/services/ReaderController.ts（修改）

预估范围： XS（1 文件）

────────────────────────────────────────────────────────────────────────────────

检查点

### Checkpoint 1: 基础设施就绪（Task 1-2）

- [ ] TanStack Query 依赖已安装
- [ ] QueryProvider 已集成到 BaseReactView
- [ ] 现有功能无回归
- [ ] bun run check 通过

### Checkpoint 2: Hooks 就绪（Task 3-4）

- [ ] useAnnotations 和 useBatchUpdateAnnotations hooks 可用
- [ ] hooks 类型定义正确
- [ ] bun run check 通过

### Checkpoint 3: 核心重构完成（Task 5-7）

- [ ] ReaderViewInner 使用 TanStack Query hooks
- [ ] AnnotationService 不再依赖 SessionStore
- [ ] 标注的增删改查功能正常
- [ ] 手动测试通过

### Checkpoint 4: 迁移完成（Task 8-11）

- [ ] view:annotations-changed 事件已移除
- [ ] sessionStore.annotations 已移除
- [ ] 缓存清理逻辑已添加
- [ ] bun run check 通过
- [ ] bun run build 通过
- [ ] 全量手动测试通过

────────────────────────────────────────────────────────────────────────────────

风险与缓解

┌──────────────────────────────────────────┬──────┬───────────────────────────────────────────────────────────────┐
│ 风险 │ 影响 │ 缓解策略 │
├──────────────────────────────────────────┼──────┼───────────────────────────────────────────────────────────────┤
│ 序列化一致性：save → load 往返数据变化 │ 中 │ 在 Task 5 中添加测试验证 setQueryData 的值与 load 结果一致 │
├──────────────────────────────────────────┼──────┼───────────────────────────────────────────────────────────────┤
│ 并发写入：快速连续标注导致 mutation 冲突 │ 中 │ 在 Task 4 中实现 persistInProgress 防重入 │
├──────────────────────────────────────────┼──────┼───────────────────────────────────────────────────────────────┤
│ QueryClient 生命周期：内存泄漏 │ 低 │ Task 11 添加 removeQueries 清理逻辑 │
├──────────────────────────────────────────┼──────┼───────────────────────────────────────────────────────────────┤
│ Provider 嵌套顺序错误 │ 低 │ Task 2 中确认 QueryClientProvider 在 AppContext.Provider 内部 │
└──────────────────────────────────────────┴──────┴───────────────────────────────────────────────────────────────┘

────────────────────────────────────────────────────────────────────────────────

开放问题

1.  乐观更新的回滚策略：如果 repository.save() 失败，是否需要回滚缓存？当前规格建议 retry: 1，但未明确回滚逻辑。
2.  AnnotationIndexService 更新时机：规格中 persist 方法会调用 annotationIndex.rebuildIndex，需确认这是否与 QueryClient 缓存更新
    同步。
