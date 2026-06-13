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
