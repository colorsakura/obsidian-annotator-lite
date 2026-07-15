# Research: 重构 Engine 层

**Feature**: 002-engine-refactor
**Date**: 2025-07-15

## 1. 模块分解策略

### Decision

将 `ReaderEngine` 按关注点分解为 6 个独立模块 + 1 个门面：

| 模块                 | 职责                                      | 来源                 |
| -------------------- | ----------------------------------------- | -------------------- |
| `ReaderEngine`       | 生命周期协调门面，组合各子模块            | 现有精简             |
| `FoliateViewAdapter` | foliate-js 视图的类型安全包装             | **NEW**              |
| `BookLoader`         | 书籍加载管道（文件→视图→初始化）          | 从现有函数提取       |
| `AnnotationManager`  | 标注数据 CRUD + 事件发射                  | 现有增强             |
| `AnnotationRenderer` | overlay 创建/删除，持有 appliedOverlayMap | 从 ReaderEngine 提取 |
| `SelectionDetector`  | 文本选择检测                              | 现有保持             |

保留独立工具模块：`readerSettings`、`foliateNavigation`（合并 `foliateKeyboard`）、`foliateAnnotations`、`foliateBookMetadata`、`theme`、`androidPatches`。

### Rationale

现有 `ReaderEngine` 承担了 coordination + book loading + annotation rendering + settings + navigation + keyboard 六项职责。按"单一职责"原则分解，每个新模块有单一接口、独立文件、独立测试。门面模式保留 `ReaderEngine` 作为向后兼容的公共 API 入口。

### Alternatives Considered

- **单文件大重构**：保持 `ReaderEngine` 为单文件大改——被拒绝，因为不解决可维护性问题。
- **reader/ 子目录分组**：按功能分 `reader/`、`annotation/`、`view/` 子目录——被拒绝，因为现有 13 个文件不值得引入嵌套结构，会增加导入路径复杂度。

---

## 2. 依赖注入模式

### Decision

采用**构造函数注入 + 接口抽象**模式，不使用 DI 容器。依赖通过接口定义，构造函数接收具体实现。

```typescript
// 示例接口（简化）
interface IViewAdapter {
  /* ... */
}
interface IAnnotationRenderer {
  /* ... */
}

class ReaderEngine {
  constructor(
    private container: HTMLElement,
    private bus: EngineEventBus,
    private viewAdapter: IViewAdapter,
    private annotationRenderer: IAnnotationRenderer,
    private annotationManager: AnnotationManager,
  ) {}
}
```

foliate-js 是唯一例外——因其体积大且只在 `BookLoader` 中实际需要，通过 `BookLoader` 内部动态导入（保持现有行为），其他模块通过接口注入。

### Rationale

- 构造函数注入是 TypeScript 中最简洁的 DI 方式
- 接口抽象允许测试时 mock 任意依赖
- 不使用 DI 容器遵守"不引入框架级依赖"的约束
- foliate-js 动态导入例外是实用主义的妥协（200KB+ 的库无法静态导入到每个测试）

### Alternatives Considered

- **工厂函数模式**：`createEngine(deps)` 替代 class——被拒绝，因为现有 API 是 class 风格，改为工厂函数会破坏消费者代码。
- **参数注入（本文）**：所有依赖作为函数参数传递——被拒绝，因为会导致 `open()` 等方法的签名膨胀。

---

## 3. foliate-js API 适配层设计

### Decision

`FoliateViewAdapter` 封装以下 foliate-js 操作，提供类型安全接口：

- `open(book)`, `init(opts)`, `close()` — 生命周期
- `goTo(target)`, `next()`, `prev()` — 导航
- `addAnnotation()`, `deleteAnnotation()` — 标注渲染
- `resolveNavigation(cfi)` — CFI 解析
- `getCFI(index, range)` — CFI 获取
- `renderer.getContents()`, `renderer.setStyles()` — 渲染器操作
- `book` 属性访问（sections, toc, metadata）

适配层内部使用 `(view as any)` 但对外暴露为类型化方法。如果 foliate-js 未来提供官方类型，只需修改适配层。

### Rationale

当前 13 个文件中至少有 7 个使用了 `(view as any)` 或 `(view as FoliateViewElement)` 类型断言。集中到适配层后，类型不安全的代码从 ~40 处减少到 1 个文件 ~20 处。

### Alternatives Considered

- **为 foliate-js 编写 `.d.ts` 声明文件**：更彻底但维护成本高——foliate-js API 无文档且频繁变动。适配层模式隔离变更影响更好。

---

## 4. 标注操作串行队列

### Decision

`AnnotationRenderer` 内部使用 Promise 链串行化所有 overlay 操作：

```typescript
private queue: Promise<void> = Promise.resolve();

enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    this.queue = this.queue.then(async () => {
      try { resolve(await fn()); }
      catch (e) { reject(e); }
    });
  });
}
```

与上层 `ReaderController.enqueuePersist` 模式一致。

### Rationale

foliate-js 的 `addAnnotation`/`deleteAnnotation` 不是幂等操作——同一个 CFI 重复调用会导致多个重叠 overlay。串行队列保证严格顺序执行，避免竞态条件。

### Alternatives Considered

- **debounce/throttle**：合并连续操作——被拒绝，因为可能丢失中间状态（先创建后删除同一标注）。
- **乐观并发 + 回滚**：先更新 UI 再同步——被拒绝，因为增加了回滚逻辑的复杂度，且 overlay 操作本身很快（<10ms）。

---

## 5. Android 补丁生命周期管理

### Decision

将 `enableAndroidPatches()` / `disableAndroidPatches()` 改为实例化的 `AndroidPatcher` 类，在 `BookLoader` 中创建、在 `ReaderEngine.close()` 时销毁。`close()` 必须调用 `disableAndroidPatches()` 恢复全局原型。

当前实现使用模块级闭包变量（`_iframePatchActive`、`_blobPatchActive`）跟踪状态，但不支持嵌套启用/禁用。重构后增加引用计数或支持幂等启用。

### Rationale

当前 engine 的 `close()` 方法不调用 `disableAndroidPatches()`，导致全局原型补丁残留。移动端用户关闭一本书后打开另一本书，补丁重复启用可能产生意外行为。

### Alternatives Considered

- **保持全局单例但增强 close() 调用**：最简单但无法处理多引擎实例场景（未来可能支持多窗口）。

---

## 6. PDF/EPUB 格式适配

### Decision

在 `BookLoader` 管道中使用策略模式处理格式差异：

- EPUB 路径：`open(fileObj)` → 应用 settings → 应用 theme
- PDF 路径：`makePDF(fileObj)` → 设置 rendition.spread → `open(book)`

`FoliateViewAdapter` 不包含格式分支——由 `BookLoader` 根据 `fileType` 参数选择路径，将初始化的 view 统一传入适配层。

### Rationale

格式差异只存在于**加载阶段**（如何将文件转换为 foliate book 对象）。加载完成后，rendered view 的操作（导航、标注、设置）对 PDF 和 EPUB 是统一的。因此格式条件分支应集中在 `BookLoader` 中。

### Alternatives Considered

- **PDFAdapter / EPUBAdapter 两个独立类**：更纯粹但过度设计——渲染后的 API 相同，分离会引入重复代码。

---

## 7. 测试策略

### Decision

分层测试策略：

1. **单元测试（Vitest）**：每个 engine 模块对应的 `.test.ts`，mock 外部依赖（Obsidian API、foliate-js、DOM）
2. **集成测试（可选）**：`BookLoader` + `FoliateViewAdapter` + `AnnotationRenderer` 组合测试，使用 jsdom mock foliate-view
3. **保留现有测试**：`bookLoader.test.ts`、`annotationManager.test.ts`、`selectionDetector.test.ts` 作为回归测试，后续按重构进度迁移到 `__tests__/`

覆盖率目标：语句覆盖率 ≥ 80%（SC-003）。

### Rationale

Constitution VI 要求 engine 层模块可单元测试。当前只有 5 个测试文件，覆盖不足。重构后每个新模块需要有对应测试。

---

## Summary of Decisions

| #   | Topic        | Decision              | Key Rationale            |
| --- | ------------ | --------------------- | ------------------------ |
| 1   | 模块分解     | 6 模块 + 门面模式     | 单一职责，向后兼容       |
| 2   | 依赖注入     | 构造函数注入 + 接口   | 简洁、可测试、无框架依赖 |
| 3   | foliate 适配 | FoliateViewAdapter 类 | 集中类型不安全代码       |
| 4   | 串行队列     | Promise 链串行化      | 避免 overlay 竞态        |
| 5   | Android 补丁 | 实例化 + close() 清理 | 消除全局副作用           |
| 6   | 格式适配     | BookLoader 策略模式   | 差异仅限于加载阶段       |
| 7   | 测试策略     | 分层测试 + 80% 覆盖率 | 重构信心保障             |
