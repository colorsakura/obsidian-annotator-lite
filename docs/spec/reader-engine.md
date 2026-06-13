# ReaderEngine Interface Design

> Architecture deepening: collapse FoliateViewer (shallow mega-component) into a deep ReaderEngine module.

## Motivation

FoliateViewer is a ~300-line React component that directly orchestrates 11 hooks, manages internal section state, annotation CRUD via TanStack Query, event bus emission, and renders both SelectionMenu and SectionIndicator. Its interface (6 props, 3 useState fields, 6 useCallback handlers) is nearly as complex as its implementation — a shallow module.

ReaderEngine absorbs all foliate-js interaction logic behind a small interface: `open`, `navigate`, `setAnnotations`, `addAnnotation`, `deleteAnnotation`, `updateSettings`, `close`, plus event emission.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime form | Pure TypeScript class (no React) | Engine's core logic is DOM ops; testable with JSDOM + mock |
| Selection menu seam | Engine owns contextmenu + CFI extraction + coord conversion + overlap detection; emits `selection` event | Caller only renders UI (React SelectionMenu / Obsidian Menu) |
| Annotation CRUD | Engine maintains internal list; `addAnnotation`/`deleteAnnotation` emit `annotations-changed` | Deep interface — engine owns annotation lifecycle |
| Event model | Engine accepts `EngineEventBus` interface (same shape as `ReaderEventBus`) | Zero forwarding cost; engine doesn't know about ReaderEventBus |
| State exposure | Getter methods (`getAnnotations()`, `getSectionInfo()`) | Explicit; no internal mutable state references leaked |

## Event Types

```typescript
interface EngineEventMap {
  'outline-loaded':      { items: OutlineItem[] };
  'metadata-loaded':     { metadata: BookMetadata };
  'section-changed':     { section: ReaderSectionState };
  'selection':           {
    selection: PendingSelection;
    existingAnnotation?: Annotation;
    position: { x: number; y: number };
  };
  'annotations-changed': { annotations: Annotation[] };
  'location-changed':    { cfi: string; sectionIndex: number };
}
```

## Bus Interface

Engine depends on this minimal interface, not the full `ReaderEventBus`:

```typescript
interface EngineEventBus {
  emit<K extends keyof EngineEventMap>(event: K, payload: EngineEventMap[K]): void;
}
```

`ReaderEventBus` already satisfies this contract — no adapter needed.

## Engine Class

```typescript
class ReaderEngine {
  constructor(container: HTMLElement, bus: EngineEventBus);

  // ── Lifecycle ────────────────────────────────────────────
  open(file: string, opts?: OpenOptions): Promise<void>;
  close(): void;

  // ── Annotation CRUD (engine maintains internal list + re-renders) ──
  setAnnotations(list: Annotation[]): void;           // External bulk set
  addAnnotation(params: AddAnnotationParams): void;   // Engine creates + emits
  deleteAnnotation(id: string): void;                 // Engine removes + emits

  // ── Navigation ────────────────────────────────────────────
  navigate(target: NavigationTarget): void;
  goToSection(index: number): void;
  goNext(): void;
  goPrev(): void;

  // ── Settings ────────────────────────────────────────────
  updateSettings(settings: Partial<ReaderSettings>): void;

  // ── State getters ────────────────────────────────────────
  getAnnotations(): Annotation[];
  getSectionInfo(): ReaderSectionState;
  getIsLoaded(): boolean;
  getView(): HTMLElement | null;          // foliate-view element (for debugging)
}
```

## Supporting Types

```typescript
interface ReaderSettings {
  flowMode: ReaderFlowMode;
  columnMode: ColumnMode;
  fontSize: number;
}

interface OpenOptions {
  settings?: Partial<ReaderSettings>;
  highlightColors?: HighlightColor[];
}

interface AddAnnotationParams {
  type: 'pdf' | 'epub';
  cfiRange: string;
  text: string;
  prefix: string;
  suffix: string;
  note?: string;
  color?: string;
}
```

## File Layout

```
src/
  engine/
    ReaderEngine.ts          ← Main class (~200 lines, absorbs useBookLoader + 11 hooks)
    engineTypes.ts           ← EngineEventMap, EngineEventBus, ReaderSettings, OpenOptions
  viewers/
    FoliateViewer.tsx        ← Shrinks from ~300 to ~80 lines (engine adapter + React UI)
    foliate/                 ← Kept; engine calls these internally
    hooks/                   ← Most absorbed by engine; only useContextMenu remains as adapter
```

## Lifecycle State Machine

```
[uninitialized] ──open()──→ [loading] ──success──→ [ready]
                                │                      │
                              error                close()
                                │                      │
                                ▼                      ▼
                           [uninitialized]      [destroyed]
```

## Event Flow (engine → external)

```
ReaderEngine
  │
  ├── outline-loaded ──→ bus.emit('view:outline-loaded')
  ├── metadata-loaded ─→ bus.emit('view:metadata-loaded')
  ├── section-changed ─→ bus.emit('view:section-changed')
  ├── location-changed → bus.emit('view:location-changed')
  ├── selection ────────→ adapter renders SelectionMenu / Obsidian Menu
  └── annotations-changed → adapter updates QueryClient + persists
```

## 事件系统

### 事件流架构

```
View 层 ──bus.emit()──→ ReaderEventBus ──on()──→ Controller 层
    ↑                                               │
    └──────ReaderSessionStore ←─────────────────────┘
            (通过 Context 注入 React)
```

事件单向流动，遵循严格的分层原则：

- **View → Controller**（通过 `bus.emit()`）：View 层主动通知 Controller 层状态变化
- **Controller → View**：通过 `ReaderSessionStore` 广播状态变化，View 通过 `useSessionStore()` / `useSessionField()` 订阅

#### 当前事件类型

```typescript
interface ReaderEventMap {
  // View → Controller 事件（由 View emit，Controller 监听）
  'view:outline-loaded':      { items: OutlineItem[] };
  'view:metadata-loaded':     { metadata: BookMetadata };
  'view:section-changed':     { section: ReaderSectionState };
  'view:location-changed':    { cfi: string; sectionIndex: number };
  'view:annotations-changed': { annotations: Annotation[] };
  'view:session-close':       Record<string, never>;
}
```

### 实际使用示例

#### 示例 1：章节变化处理

章节变化是阅读器中最常见的事件。当用户翻页或跳转到新章节时，FoliateViewer 会触发 `view:section-changed` 和 `view:location-changed` 事件。

```typescript
// 在 FoliateViewer.tsx 中
const handleSectionChange = useCallback(
  (
    currentIndex: number,
    totalSections: number,
    currentLabel?: string,
    canGoPrev?: boolean,
    canGoNext?: boolean,
    cfi?: string,
  ) => {
    // 1. 更新本地章节状态（用于 SectionIndicator 渲染）
    const section = {
      currentIndex,
      totalSections,
      currentLabel,
      canGoPrev: canGoPrev ?? currentIndex > 0,
      canGoNext: canGoNext ?? currentIndex < totalSections - 1,
    };
    setSectionInfo(section);

    // 2. 通知 Controller 更新 SessionStore
    bus.emit('view:section-changed', { section });

    // 3. 如果有 CFI，同时通知位置变化（用于进度保存）
    if (cfi) {
      bus.emit('view:location-changed', { cfi, sectionIndex: currentIndex });
    }
  },
  [bus],
);
```

#### 示例 2：目录加载

当 foliate-js 解析完书籍结构后，触发 `view:outline-loaded` 事件通知 Controller。

```typescript
// 在 FoliateViewer.tsx 中
const handleOutlineLoaded = useCallback(
  (items: OutlineItem[]) => {
    bus.emit('view:outline-loaded', { items });
  },
  [bus],
);

// 通过 useBookLoader 传入回调
const { view, isLoaded } = useBookLoader(
  containerRef,
  file,
  { flowMode, columnMode, fontSize },
  {
    onOutlineLoaded: handleOutlineLoaded,
    onBookMetadataLoaded: handleBookMetadataLoaded,
    onSectionChanged: stableSectionChange,
  },
);
```

#### 示例 3：标注 CRUD 与乐观更新

标注操作采用乐观更新模式，先更新 UI，再通过 ReaderAPI 触发持久化。

```typescript
// 在 FoliateViewer.tsx 中
const defaultAddAnnotation = useCallback(
  (params: AddAnnotationParams) => {
    const annotation = createAnnotation({ ...params, uri: targetUri });

    // 1. 乐观写：立即更新 QueryClient 缓存，UI 瞬间响应
    const current =
      queryClient.getQueryData<Annotation[]>(annotationKeys.byFile(sourcePath)) ?? [];
    const next = [...current, annotation];
    queryClient.setQueryData(annotationKeys.byFile(sourcePath), next);

    // 2. 通过 ReaderAPI 触发持久化（Controller 负责写文件 + 确认缓存）
    void reader.addAnnotation(annotation);
  },
  [targetUri, sourcePath, queryClient, reader],
);
```

#### 示例 4：Controller 监听事件

Controller 通过 `wireViewEvents()` 监听 View 层事件，并路由到相应的服务。

```typescript
// 在 ReaderController.ts 中
private wireViewEvents(): void {
  // 监听目录加载
  this.bus.on('view:outline-loaded', ({ items }) => {
    this.sessionStore.setOutline(items);
  });

  // 监听元数据加载
  this.bus.on('view:metadata-loaded', ({ metadata }) => {
    this.sessionStore.setMetadata(metadata);
  });

  // 监听章节变化
  this.bus.on('view:section-changed', ({ section }) => {
    this.sessionStore.setSection(section);
  });

  // 监听位置变化
  this.bus.on('view:location-changed', ({ cfi }) => {
    this.lastKnownCfi = cfi;
  });

  // 监听会话关闭
  this.bus.on('view:session-close', () => {
    this.closeCurrentSession();
  });
}
```

> **订阅清理**：Controller 不需要逐个取消订阅。会话关闭时，`closeCurrentSession()` 调用 `bus.clear()` 一次性清除所有事件监听器。`ReaderEventBus.clear()` 内部执行 `this.listeners.clear()`，确保不会产生内存泄漏。

### 事件最佳实践

#### 1. 单向数据流

事件只从 View 到 Controller，状态通过 Store 回流。避免在事件处理器中直接修改 View 状态。

```typescript
// ✅ 正确：通过 Store 广播状态
bus.on('view:section-changed', ({ section }) => {
  this.sessionStore.setSection(section);  // Store 更新后，View 自动订阅
});

// ❌ 错误：在事件处理器中直接操作 View
bus.on('view:section-changed', ({ section }) => {
  this.view.setSectionInfo(section);  // 违反单向数据流原则
});
```

#### 2. 类型安全

使用 TypeScript 定义事件类型，确保编译时检查。

```typescript
// ✅ 正确：类型安全的事件定义
interface ReaderEventMap {
  'view:section-changed': { section: ReaderSectionState };
  'view:location-changed': { cfi: string; sectionIndex: number };
}

// 使用时自动推断类型
bus.emit('view:section-changed', { section: { ... } });  // TypeScript 检查

// ❌ 错误：使用字符串字面量，无类型检查
bus.emit('view:section-changed', { wrong: 'field' });  // 编译时报错：类型不匹配
```

#### 3. 避免循环依赖

不要在事件处理器中触发相同事件，避免无限循环。

```typescript
// ❌ 错误：会导致无限循环
bus.on('view:section-changed', ({ section }) => {
  // ... 处理逻辑
  bus.emit('view:section-changed', { section });  // 递归触发
});

// ✅ 正确：使用条件判断避免循环
bus.on('view:section-changed', ({ section }) => {
  if (this.lastSection?.currentIndex !== section.currentIndex) {
    this.lastSection = section;
    // ... 处理逻辑
  }
});
```

#### 4. 错误处理

在事件处理器中捕获错误，避免崩溃。

```typescript
// ✅ 正确：捕获错误并记录日志
bus.on('view:section-changed', ({ section }) => {
  try {
    this.sessionStore.setSection(section);
  } catch (e) {
    log.error('Failed to update session store:', e);
  }
});

// ReaderEventBus 内部已实现错误捕获
emit<K extends keyof ReaderEventMap>(event: K, payload: ReaderEventMap[K]): void {
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
```

#### 5. 及时清理订阅

组件卸载时必须取消订阅，避免内存泄漏。

```typescript
// ✅ 正确：使用 useEffect 清理
useEffect(() => {
  const unsub = bus.on('view:section-changed', handler);
  return unsub;  // React 自动调用清理函数
}, [bus]);

// ✅ 正确：批量清理
useEffect(() => {
  const unsubscribers = [
    bus.on('view:section-changed', handleSection),
    bus.on('view:location-changed', handleLocation),
  ];
  return () => unsubscribers.forEach(unsub => unsub());
}, [bus]);
```

#### 6. 选择性订阅

通过 `useSessionField` 按字段订阅 SessionStore，避免无关状态变化引起重渲染。

```typescript
// ✅ 正确：只订阅需要的字段
const navigationTarget = useSessionField('navigationTarget') ?? null;

// ❌ 错误：订阅全量状态，任何字段变化都会触发重渲染
const session = useSessionStore();
const navigationTarget = session.navigationTarget;
```

#### 7. 回调稳定性

频繁变化的回调使用 `useCallback` + ref 模式保持引用稳定。

```typescript
// ✅ 正确：使用 ref 模式保持引用稳定
const handleSectionChangeRef = useRef(handleSectionChange);
handleSectionChangeRef.current = handleSectionChange;

const stableSectionChange = useCallback(
  (currentIndex, totalSections, ...args) => {
    handleSectionChangeRef.current(currentIndex, totalSections, ...args);
  },
  [],  // 空依赖 → 引用永远不变
);
```

## Error Handling

### Error Types

1. **文件加载错误**：文件不存在、格式不支持、损坏
2. **渲染错误**：CSS 解析失败、布局异常、初始化失败
3. **导航错误**：CFI 无效、章节不存在、跳转失败
4. **标注错误**：选择失败、CFI 提取失败、保存失败

### Error Handling Strategies

#### File Loading Errors

文件加载错误在 `useBookLoader.ts` 中处理。加载流程包含多层防护：

```typescript
// File existence check
const tfile = app.vault.getAbstractFileByPath(file);
if (!(tfile instanceof TFile)) {
  loadingRef.current = false;
  return;  // Silent failure, no error display
}

try {
  const data = await app.vault.readBinary(tfile as any);
  // ... loading logic
} catch (err) {
  log.error('Failed to load file:', err);
  // Current implementation: only log, no user-facing error
}
```

**处理策略**：
- 文件不存在：静默失败，不显示错误提示
- 读取失败：记录错误日志，保持加载状态为 false
- 格式不支持：依赖 foliate-js 内部错误处理

#### Rendering Errors

渲染错误在 `view.init()` 失败时触发，采用回退策略：

```typescript
try {
  await (view as any).init({ showTextStart: true });
} catch {
  // On init failure, try jumping to start
  try {
    await (view as any).goTo(0);
  } catch {
    /* ignore - silently ignore on double failure */
  }
}
```

**处理策略**：
- 初始化失败：自动回退到 `goTo(0)`
- 回退失败：静默忽略，避免级联错误

#### Navigation Errors

导航错误在 CFI 跳转时可能触发，当前实现采用静默忽略策略：

```typescript
// CFI extraction in foliateSelection.ts
try {
  const viewApi = view as any;
  const contents = viewApi.renderer?.getContents?.();
  if (!contents || contents.length === 0) return;

  const cfi = viewApi.getCFI(contents[0].index, range);
  // ... continue processing
} catch {
  // Selection may not be convertible to CFI; silently ignore
}
```

**处理策略**：
- CFI 提取失败：静默忽略，不显示菜单
- 章节不存在：依赖 foliate-js 内部边界检查

#### Annotation Errors

标注错误在 `AnnotationService.ts` 中处理，包含防重入保护：

```typescript
async persist(annotations: Annotation[], sourcePath: string | null): Promise<void> {
  if (!sourcePath) {
    // No sourcePath: only update cache, skip file write
    return;
  }

  this.persistInProgress = true;

  try {
    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) {
      // File not found, only update cache
      this.queryClient.setQueryData(annotationKeys.byFile(sourcePath), annotations);
      return;
    }

    await this.repository.save(file, annotations);
    // Update cache after successful persistence (ensure consistency)
    this.queryClient.setQueryData(annotationKeys.byFile(sourcePath), annotations);
    this.annotationIndex.rebuildIndex(sourcePath, annotations);
  } catch (e) {
    log.error('Failed to persist annotations:', e);
    // Current implementation: only log on failure, no cache rollback
  } finally {
    this.persistInProgress = false;
  }
}
```

**处理策略**：
- 无源文件路径：仅更新内存缓存
- 文件不存在：仅更新缓存，不写入文件
- 保存失败：记录错误日志，保持 `persistInProgress` 为 false
- 防重入：通过 `persistInProgress` 标志防止并发保存

### Error Recovery Strategies

#### Graceful Degradation

当前实现采用分层降级策略：

1. **初始化降级**：`view.init()` 失败 → 回退到 `goTo(0)`
2. **上下文降级**：DOM 遍历失败 → 返回空 prefix/suffix
3. **缓存降级**：文件操作失败 → 仅更新内存缓存

#### Silent Ignoring

以下场景采用静默忽略策略（不向用户显示错误）：

- 文件不存在
- CFI 提取失败
- 初始化/回退双重失败
- 上下文提取失败

**设计理念**：阅读器作为被动查看工具，非关键错误不应干扰用户阅读体验。

#### Logging

所有错误均通过 `createLogger` 记录到控制台，便于开发调试：

```typescript
const log = createLogger('BookLoader');
log.error('Failed to load file:', err);

const log = createLogger('AnnotationService');
log.error('Failed to persist annotations:', e);
```

### Improvement Suggestions

当前错误处理存在以下可改进点：

1. **用户提示缺失**：关键错误（如文件损坏）应向用户显示通知
2. **重试机制缺失**：网络相关错误（如 Datacore 同步）可添加自动重试
3. **回滚不完整**：标注保存失败时，缓存可能与文件不一致
4. **错误类型未细化**：统一使用 `catch` 捕获，未区分错误类型

建议在 ReaderEngine 重构时引入统一的错误处理机制，通过事件总线向 UI 层报告错误状态。

## 性能优化

### 资源管理

阅读器在组件卸载时必须正确释放资源，避免内存泄漏。当前实现在 `useBookLoader.ts` 的 cleanup effect 中处理：

```typescript
// Cleanup on unmount
useEffect(() => {
  return () => {
    // 1. 禁用 Android 补丁（恢复原始原型）
    disableAndroidPatches();

    // 2. 释放封面 Blob URL
    if (coverUrlRef.current) {
      URL.revokeObjectURL(coverUrlRef.current);
      coverUrlRef.current = null;
    }

    // 3. 关闭 foliate-view 并清理引用
    const view = viewRef.current;
    if (view) {
      try {
        (view as any).close?.();
      } catch {
        /* ignore */
      }
      viewRef.current = null;
      loadedFileRef.current = null;
    }
  };
}, []);
```

**关键点**：
- `URL.revokeObjectURL()` 释放 Blob URL，防止内存泄漏
- `view.close()` 关闭 foliate-js 内部资源（iframe、事件监听器等）
- 清空 ref 引用，帮助垃圾回收

### React 渲染优化

#### 组件记忆化

`FoliateViewer` 使用 `React.memo` 包裹，避免父组件重渲染时不必要的更新：

```typescript
const FoliateViewer: React.FC<FoliateViewerProps> = React.memo(
  ({ file, sourcePath, flowMode, columnMode, fontSize, highlightColors, ... }) => {
    // ...
  },
);

FoliateViewer.displayName = 'FoliateViewer';
```

#### 回调稳定性

频繁变化的回调使用 `useCallback` + ref 模式保持引用稳定：

```typescript
// 原始回调（依赖 bus，可能变化）
const handleSectionChange = useCallback(
  (currentIndex, totalSections, currentLabel, canGoPrev, canGoNext, cfi) => {
    // ...处理逻辑
  },
  [bus],
);

// 稳定回调（空依赖数组，引用不变）
const handleSectionChangeRef = useRef(handleSectionChange);
handleSectionChangeRef.current = handleSectionChange;

const stableSectionChange = useCallback(
  (currentIndex, totalSections, currentLabel, canGoPrev, canGoNext, cfi) => {
    handleSectionChangeRef.current(currentIndex, totalSections, currentLabel, canGoPrev, canGoNext, cfi);
  },
  [],  // 空依赖 → 引用永远不变
);
```

**用途**：`stableSectionChange` 传给 `useBookLoader`，避免书籍加载 effect 因回调变化而重新执行。

#### 选择性订阅

通过 `useSessionField` 按字段订阅 SessionStore，避免无关状态变化引起重渲染：

```typescript
// 只订阅 navigationTarget，其他字段变化不影响 FoliateViewer
const navigationTarget = useSessionField('navigationTarget') ?? null;
```

### 乐观更新

标注 CRUD 采用乐观更新模式，UI 瞬间响应，不等待文件写入完成：

```typescript
const defaultAddAnnotation = useCallback(
  (params: AddAnnotationParams) => {
    const annotation = createAnnotation({ ...params, uri: targetUri });

    // 1. 乐观写：立即更新 QueryClient 缓存
    const current =
      queryClient.getQueryData<Annotation[]>(annotationKeys.byFile(sourcePath)) ?? [];
    const next = [...current, annotation];
    queryClient.setQueryData(annotationKeys.byFile(sourcePath), next);

    // 2. 异步持久化：通过 ReaderAPI 触发文件写入
    void reader.addAnnotation(annotation);
  },
  [targetUri, sourcePath, queryClient, reader],
);
```

**优势**：
- 用户操作后 UI 立即反馈，体验流畅
- 持久化失败时缓存仍保持最新状态（由 Controller 负责一致性）

### foliate-js 内置优化

foliate-js 已内置以下优化，自定义开发时需注意避免冲突：

#### 虚拟滚动与懒加载

foliate-js 的 paginator（`node_modules/foliate-js/paginator.js`）采用基于 iframe 的章节隔离渲染模型：

- **章节按需加载**：每个章节在独立 iframe 中渲染。paginator 仅在用户导航到某章节时才触发该章节的 `section.load()` 方法，将 EPUB 的 XHTML 片段加载为 iframe 可渲染的内容
- **iframe 创建/销毁策略**：paginator 为当前可见章节创建 iframe；用户翻页离开后，旧章节的 iframe 保留在 DOM 中（不做主动销毁），但不会触发额外加载。书籍关闭时通过 `view.close()` 统一销毁所有 iframe 并回收资源
- **渲染窗口**：分页模式下 paginator 计算滚动边界（`#scrollBounds`），通过 `requestAnimationFrame` 驱动平滑翻页动画，仅渲染当前分页视口内的内容
- **非虚拟化**：已加载的章节 iframe 保留在 DOM 中，不会被回收重建。这意味着对于超大书籍（数百章节），DOM 节点数量会持续增长，但单章节的内存占用有限（iframe 内容可被浏览器 GC）

**实现机制**：`view.open()` 后 foliate-js 解析书籍结构，获取 `book.sections` 数组。paginator 根据用户导航方向按序加载相邻章节，而非预加载全部章节。

#### 预加载策略

当前实现**不主动预加载相邻章节**，采用纯按需加载策略：

- **foliate-js 层面**：paginator 在用户翻到下一章时才触发 `section.load()`，没有内置的相邻章节预加载机制。翻页时 `relocate` 事件通知上层应用当前章节索引变化
- **应用层面**：`useBookLoader` 在 `view.open()` 后仅对所有章节执行 `wrapSectionLoadForAndroid()`（Android 平台的 blob → srcdoc 转换），这是一次性的兼容性处理，不是预加载优化
- **ReaderEngine 重构建议**：如果需要优化大书籍的翻页体验，可在 Engine 层引入相邻章节预加载策略——监听 `relocate` 事件后，对 `currentIndex ± 1` 的章节调用 `section.load()` 进行预热。但需注意内存开销，建议限制预加载窗口为 ±1 个章节，且仅在桌面端启用

**注意**：
- 不要手动预加载所有章节（`Promise.all(book.sections.map(s => s.load()))`），会消耗大量内存
- Android 补丁中的 `wrapSectionLoadForAndroid` 会预读取 blob 内容，这是为了解决 WebView 兼容性问题，非性能优化

#### 防抖处理

当前插件层**没有引入额外的防抖/节流机制**，原因是 foliate-js 内部已处理关键路径的防抖：

- **滚动事件防抖（250ms）**：paginator 在滚动模式下对 scroll 事件做 250ms 防抖，避免频繁触发 `relocate` 事件和章节切换回调。这意味着 `useRelocateListener` 收到的事件频率已被 foliate-js 控制
- **指针选择防抖（700ms）**：paginator 对指针选择检查做 700ms 防抖，防止用户拖选文本时误触发翻页
- **标注覆盖层差量更新**：`useAnnotationOverlays` 通过 `appliedMapRef`（`Map<id, cfiRange>`）追踪已应用的标注，仅在标注列表实际变化时才触发 `applyAnnotationOverlays`，避免重复渲染。这是一种基于数据比较的天然节流
- **React 渲染优化**：`React.memo` + `useCallback` + `useSessionField` 选择性订阅共同构成 React 层面的渲染控制，减少不必要的重渲染

**ReaderEngine 重构建议**：以下场景可能需要引入防抖：
1. **字体大小调整**：如果 Engine 暴露实时字体大小调整（如滑块拖动），应对 `updateSettings({ fontSize })` 做 100-200ms 防抖，避免高频触发 `renderer.setStyles()`
2. **窗口 resize**：如果 Engine 需要响应容器尺寸变化重新布局，应对 resize 事件做 250ms 防抖
3. **标注批量操作**：批量删除/导入标注时，应对 `annotations-changed` 事件做合并，避免逐条触发持久化

### 性能监控

开发环境下可通过日志监控加载性能：

```typescript
const log = createLogger('BookLoader');

log.debug('book loaded:', tfile.name, 'type:', ext, 'size:', data.byteLength, 'bytes');
```

建议在 ReaderEngine 重构时添加以下性能指标：
- 书籍加载耗时（`view.open()` 到 `isLoaded`）
- 章节切换耗时（`section-changed` 事件间隔）
- 标注渲染耗时（`useAnnotationRendering` 执行时间）

## Android WebView 兼容性

### 问题背景

Android WebView 存在以下限制：

- 跨域资源访问受限
- iframe sandbox 策略严格，sandbox iframe 内 `blob:` URL 加载被阻止

foliate-js 的分页器会创建带有 sandbox 属性的 iframe（用于解决 WebKit bug），但在 Chromium-based Android WebView 上，这个 sandbox 会阻止 `blob:` URL 加载，导致 `contentDocument` 不可访问，阅读器显示空白。

### 解决方案

使用 `useAndroidPatches` 模块提供的三个运行时补丁，配合 `wrapSectionLoadForAndroid()` 形成完整的解决链路：

1. **iframe sandbox 移除**（`enableIframePatch`）：拦截 `HTMLIFrameElement.prototype.setAttribute`，阻止设置 sandbox 属性，使 iframe 可正常加载 blob URL
2. **blob URL 拦截**（`enableBlobPatch`）：拦截 `URL.createObjectURL()` 调用，将 blob 保存到 `_blobMap` 中（中间步骤，为后续 srcdoc 注入做准备）
3. **section 预读取**（`wrapSectionLoadForAndroid`）：包装每个 section 的 `load()` 方法，在加载时预读取 blob 内容为文本，保存到 `_textMap` 中
4. **srcdoc 注入**（`enableSrcPatch`）：拦截 iframe src setter，如果 URL 在 `_textMap` 中有预加载文本，则使用 `srcdoc` 替代 `src`，实现同源加载

完整流程：`view.open()` 内部 `URL.createObjectURL()` 被拦截 → blob 记录到 `_blobMap` → `wrapSectionLoadForAndroid()` 对每个 section 包装 `load()` → section 加载时从 blob 读取文本到 `_textMap` → iframe 设置 src 时拦截为 srcdoc 注入。

### 使用时机

补丁必须在 `view.open()` 之前同步激活，以拦截 foliate-js 内部的 blob URL 创建。`wrapSectionLoadForAndroid()` 在 `view.open()` 之后对每个 section 调用。

### 代码示例

以下为简化版本，完整实现见 `src/viewers/hooks/useBookLoader.ts`。

```typescript
import { enableAndroidPatches, disableAndroidPatches, wrapSectionLoadForAndroid } from './useAndroidPatches';

// 1. view.open() 之前激活补丁（拦截 blob URL 创建）
enableAndroidPatches();
await view.open(fileObj);

// 2. view.open() 之后，对每个 section 包装 load()（预读取 blob 内容）
const book = view.book;
if (book?.sections) {
  await Promise.all(book.sections.map(s => wrapSectionLoadForAndroid(s)));
}

// 3. 初始化 renderer（此时 iframe src 设置会被 srcdoc 注入拦截）
await view.init({ showTextStart: true });

// 4. 组件卸载时禁用补丁
useEffect(() => {
  return () => disableAndroidPatches();
}, []);
```

### 实现细节

实际实现位于 `src/viewers/hooks/useAndroidPatches.ts`，核心逻辑包括：

1. **iframe patch**（`enableIframePatch`）：拦截 `HTMLIFrameElement.prototype.setAttribute`，阻止设置 `sandbox="allow-same-origin allow-scripts"`
2. **blob patch**（`enableBlobPatch`）：拦截 `URL.createObjectURL()`，将 blob 保存到 `_blobMap` 中
3. **section load wrapper**（`wrapSectionLoadForAndroid`）：包装 section 的 `load()` 方法，预读取 blob 内容为文本，保存到 `_textMap` 中
4. **src patch**（`enableSrcPatch`）：拦截 iframe src setter，如果 URL 在 `_textMap` 中有预加载文本，则使用 `srcdoc` 替代

调用时序见 `src/viewers/hooks/useBookLoader.ts` 的 `loadFile()` 函数：`enableAndroidPatches()` → `view.open()` → `wrapSectionLoadForAndroid()` → `view.init()`。

### 注意事项

- 补丁仅在 `Platform.isMobile` 时生效
- 必须在 `view.open()` 之前调用 `enableAndroidPatches()`
- `wrapSectionLoadForAndroid()` 必须在 `view.open()` 之后、`view.init()` 之前对每个 section 调用
- 组件卸载时必须调用 `disableAndroidPatches()` 恢复原始原型

## CFI 寻址

CFI（Content Fragment Identifier）是 EPUB 规范中用于精确定位文档内容的寻址机制。foliate-js 使用 CFI 来标识标注位置、实现跨章节导航和阅读进度恢复。

### CFI 创建示例

以下代码展示了 `showSelectionMenu()` 函数中从用户选择到 CFI 创建的完整流程（`src/viewers/foliate/foliateSelection.ts`）：

```typescript
// 1. 从 iframe 窗口获取选择（win 为 iframe 的 contentWindow）
const iframeSelection = win.getSelection();
if (!iframeSelection || iframeSelection.isCollapsed || !iframeSelection.rangeCount) return;

// 2. 提取 Range 和文本
const range = iframeSelection.getRangeAt(0);
const text = iframeSelection.toString().trim();
if (!text) return;

// 3. 通过 foliate-js API 创建 CFI
const viewApi = view as any;
const contents = viewApi.renderer?.getContents?.();
if (!contents || contents.length === 0) return;

const cfi = viewApi.getCFI(contents[0].index, range);
const { prefix, suffix } = getSurroundingContext(range);

// 4. 构建 PendingSelection 对象，等待用户选择高亮颜色后保存
pendingRef.current = {
  type: fileType,
  cfiRange: cfi,
  text,
  prefix,
  suffix,
};
```

### CFI 在实际场景中的应用

#### 场景 1：标注保存

```typescript
// 用户选择文本后，保存标注位置
const saveAnnotation = (range: Range) => {
  const cfi = viewApi.getCFI(contents[0].index, range);
  // 保存到 Markdown 文件
  saveToMarkdown({
    cfiRange: cfi,
    text: range.toString(),
    // ... 其他字段
  });
};
```

#### 场景 2：位置恢复

```typescript
// 打开书籍后，恢复上次阅读位置
const restorePosition = async (lastCfi: string) => {
  try {
    await view.goTo(lastCfi);
  } catch (err) {
    // CFI 无效时，回退到开头
    await view.goTo(0);
  }
};
```

#### 场景 3：跨章节导航

```typescript
// 从目录跳转到指定章节
const navigateToChapter = async (chapterCfi: string) => {
  await view.goTo(chapterCfi);
  // 更新阅读进度
  updateReadingProgress(chapterCfi);
};
```

### CFI 最佳实践

1. **始终验证 CFI**：使用前检查格式是否有效
2. **提供回退方案**：CFI 无效时使用章节索引
3. **缓存常用 CFI**：避免重复计算
4. **序列化存储**：使用字符串格式存储 CFI

## 标注系统

### 标注数据结构

标注遵循 W3C Annotation Model / Hypothesis 兼容格式，定义在 `src/types/annotations.ts`：

```typescript
interface Annotation {
  id: string;
  /** PDF or EPUB file URI / fingerprint */
  uri: string;
  document: {
    title: string;
    documentFingerprint?: string;
    link?: { href: string }[];
  };
  /** Highlight location data (W3C selectors) */
  target: {
    source: string;
    selector: Selector[];
  }[];
  /** User note / comment */
  text: string;
  tags: string[];
  created: string;
  updated: string;
  /** Non-standard extension: CFI string for foliate-js rendering */
  cfiRange?: string;
  /** Non-standard extension: discriminator for PDF vs EPUB */
  type?: 'pdf' | 'epub';
  /** Non-standard extension: highlight color (CSS color value) */
  color?: string;
}

type Selector = TextPositionSelector | TextQuoteSelector | RangeSelector;

interface TextQuoteSelector {
  type: 'TextQuoteSelector';
  exact: string;
  prefix: string;
  suffix: string;
}

interface TextPositionSelector {
  type: 'TextPositionSelector';
  start: number;
  end: number;
}

interface RangeSelector {
  type: 'RangeSelector';
  endContainer: string;
  endOffset: number;
  startContainer: string;
  startOffset: number;
}
```

**字段说明**：
- `id`：随机生成的字母数字 ID（`Math.random().toString(36).substring(2)`）
- `uri`：书籍文件的 URI 或指纹
- `document`：文档元数据，兼容 Hypothesis 格式
- `target`：标注位置数据，使用 W3C Selectors（TextQuoteSelector 用于文本匹配，TextPositionSelector 用于位置偏移）
- `text`：用户添加的笔记内容
- `tags`：标签列表
- `created` / `updated`：ISO 8601 时间戳
- `cfiRange`：foliate-js 的 EPUB CFI 字符串（非标准扩展）
- `type`：区分 PDF 和 EPUB 格式（非标准扩展）
- `color`：高亮颜色 CSS 值（非标准扩展）

### 存储格式

标注存储在 Markdown 文件中，使用 obsidian-annotator 兼容的 blockquote 格式。实际实现位于 `src/utils/markdownStorage.ts`。

#### 单个标注块结构

```markdown
>%%
>```annotation-json
>{"id":"abc123","uri":"urn:book.epub","document":{"title":"Book Title","link":[{"href":"urn:book.epub"}]},"target":[{"source":"urn:book.epub","selector":[{"type":"TextQuoteSelector","exact":"被标注的文本","prefix":"前文内容","suffix":"后文内容"}]}],"text":"用户笔记","tags":["tag1"],"created":"2024-01-15T10:30:00Z","updated":"2024-01-15T10:30:00Z","cfiRange":"epubcfi(...)","type":"epub","color":"#ffeb3b"}
>```
>%%
>*%%PREFIX%%前文内容 %%HIGHLIGHT%% ==被标注的文本== %%POSTFIX%%后文内容*
>%%LINK%%[[#^abc123|show annotation]]
>%%COMMENT%%
>用户笔记
>%%TAGS%%
>#tag1
^abc123
```

#### 格式说明

1. **JSON 块**：包裹在 `%%` 注释标记和 `annotation-json` 代码围栏中，存储完整的 Annotation JSON
2. **可见高亮行**：显示前缀、高亮文本（`==text==`）、后缀，便于在 Markdown 阅读器中预览
3. **LINK**：指向标注 ID 的内部链接
4. **COMMENT**：用户笔记内容
5. **TAGS**：标签列表
6. **ID 标记**：`^annotationId` 作为块的结尾标识

#### JSON 优化

存储时会剥离与默认值相同的字段（`stripDefaultValues` 函数），忽略 `group`、`permissions`、`user`、`user_info`、`links`、`flagged`、`hidden`、`references` 等字段，保持 JSON 紧凑。

### 持久化流程

实际实现涉及三个层次：

#### 1. 格式转换层（`src/utils/markdownStorage.ts`）

```typescript
// 解析：从 Markdown 内容提取标注列表
export function parseAnnotationsFromMarkdown(content: string, uri?: string | null): Annotation[]

// 生成：将标注列表写入 Markdown 内容
export function generateMarkdownWithAnnotations(originalContent: string, annotations: Annotation[]): string
```

解析流程：
1. 使用正则表达式匹配 `^annotationId` 结尾的 blockquote 块
2. 从块中提取 `annotation-json` 代码围栏内的 JSON
3. 合并默认值，按 URI 过滤

生成流程：
1. 移除所有现有标注块
2. 将每个标注格式化为 blockquote 块
3. 追加到文件末尾

#### 2. 仓库层（`src/services/AnnotationRepository.ts`）

```typescript
interface AnnotationRepository {
  load(sourceFile: TFile, targetUri?: string | null): Promise<Annotation[]>;
  save(sourceFile: TFile, annotations: Annotation[]): Promise<void>;
}
```

`MarkdownAnnotationRepository` 实现：
- `load`：读取文件内容，调用 `parseAnnotationsFromMarkdown`
- `save`：使用 `vault.process` 原子性地更新文件内容

#### 3. 服务层（`src/services/AnnotationService.ts`）

```typescript
class AnnotationService {
  async load(sourceFile: TFile, targetUri: string | null): Promise<Annotation[]>;
  async persist(annotations: Annotation[], sourcePath: string | null): Promise<void>;
}
```

`persist` 方法职责：
1. 调用 `repository.save()` 将标注列表写入 Markdown 文件
2. 成功后更新 QueryClient 缓存（`queryClient.setQueryData`）
3. 重建 AnnotationIndex（`annotationIndex.rebuildIndex`）
4. 包含防重入保护（`persistInProgress` 标志）

**调用示例**（在 ReaderViewInner 中）：

```typescript
// 用户添加标注后
const newAnnotation = createAnnotation({
  type: 'epub',
  cfiRange: selection.cfiRange,
  text: selection.text,
  prefix: selection.prefix,
  suffix: selection.suffix,
  uri: bookUri,
  color: selectedColor,
});

// 更新本地状态
const updatedAnnotations = [...localAnnotations, newAnnotation];
setLocalAnnotations(updatedAnnotations);

// 通知 Controller 持久化
bus.emit('view:annotations-changed', { annotations: updatedAnnotations });
```

## Deletion Test

Deleting ReaderEngine scatters these concerns into FoliateViewer adapter:

- Book loading (useBookLoader)
- Annotation rendering + overlays (useAnnotationRendering + useAnnotationOverlays)
- Contextmenu listening + CFI extraction + coord conversion + overlap detection (useSelectionMenu internals)
- Navigation + keyboard (useNavigation\* + foliateKeyboard)
- Settings application (useReaderSettings)
- Android patches (useAndroidPatches)

Complexity reappears in N hooks. Engine passes the deletion test.

## FoliateViewer Adapter (after)

FoliateViewer becomes a thin React adapter:

```tsx
const FoliateViewer: React.FC<{ file: string; sourcePath: string }> = ({ file, sourcePath }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ReaderEngine | null>(null);
  const bus = useReader().bus;

  // Selection menu state (React)
  const [menuState, setMenuState] = useState<SelectionMenuState | null>(null);
  // Section indicator state (React)
  const [sectionInfo, setSectionInfo] = useState<ReaderSectionState>(...);

  useEffect(() => {
    const engine = new ReaderEngine(containerRef.current!, bus);
    engineRef.current = engine;

    // Forward engine events to local React state
    bus.on('view:section-changed', ({ section }) => setSectionInfo(section));
    // ... bridge other events

    engine.open(file, { settings: ... });
    return () => engine.close();
  }, [file]);

  // Selection handler: engine detected a selection → show menu
  useEffect(() => {
    const unsub = bus.on('view:selection', ({ selection, existingAnnotation, position }) => {
      setMenuState({ visible: true, position, selection, existingAnnotation, ... });
    });
    return unsub;
  }, []);

  return (
    <div ref={containerRef} className="foliate-viewer-container">
      {sectionInfo.totalSections > 0 && <SectionIndicator ... />}
      {menuState?.visible && <SelectionMenu ... />}
    </div>
  );
};
```

~80 lines. Engine handles everything else.
