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
- Blob URL 创建受限
- iframe sandbox 策略严格

foliate-js 的分页器会创建带有 sandbox 属性的 iframe（用于解决 WebKit bug），但在 Chromium-based Android WebView 上，这个 sandbox 会阻止 `blob:` URL 加载，导致阅读器显示空白。

### 解决方案

使用 `useAndroidPatches` 模块提供的三个运行时补丁：

1. **iframe sandbox 移除**：拦截 `HTMLIFrameElement.prototype.setAttribute`，阻止设置 sandbox 属性
2. **blob URL 拦截**：拦截 `URL.createObjectURL()` 调用，保存 blob 到 Map 中
3. **srcdoc 注入**：拦截 iframe src setter，如果 URL 有预加载的文本，则使用 srcdoc 替代

### 使用时机

补丁必须在 `view.open()` 之前同步激活，以拦截 foliate-js 内部的 blob URL 创建。

### 代码示例

```typescript
import { enableAndroidPatches, disableAndroidPatches } from './useAndroidPatches';

// 在打开书籍前激活补丁
enableAndroidPatches();
await view.open(book);

// 在组件卸载时禁用补丁
useEffect(() => {
  return () => disableAndroidPatches();
}, []);
```

### 实现细节

实际实现位于 `src/viewers/hooks/useAndroidPatches.ts`，核心逻辑包括：

1. **iframe patch**：拦截 `HTMLIFrameElement.prototype.setAttribute`，阻止设置 `sandbox="allow-same-origin allow-scripts"`
2. **blob patch**：拦截 `URL.createObjectURL()`，将 blob 保存到 `_blobMap` 中
3. **src patch**：拦截 iframe src setter，如果 URL 在 `_textMap` 中有预加载文本，则使用 `srcdoc` 替代
4. **section load wrapper**：`wrapSectionLoadForAndroid()` 函数预读取 section HTML，保存到 `_textMap`

### 注意事项

- 补丁仅在 `Platform.isMobile` 时生效
- 必须在 `view.open()` 之前调用 `enableAndroidPatches()`
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
