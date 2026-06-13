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
