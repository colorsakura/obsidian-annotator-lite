# 代码质量清理实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 根据代码质量审查报告，执行 P0-P3 全部清理，消除死代码、修复类型定义、整理依赖

**Architecture:** 按优先级分组执行，每组独立可验证。P0 修复正确性问题，P1 改善类型安全和依赖，P2/P3 提升代码清洁度

**Tech Stack:** TypeScript, Obsidian API, foliate-js

---

## 文件结构

| 文件                                    | 操作 | 说明                                     |
| --------------------------------------- | ---- | ---------------------------------------- |
| `src/components/NoteModal.ts`           | 修改 | P0: 修复 Promise 重复 resolve            |
| `src/types/foliate-js.d.ts`             | 重写 | P1: 补全 foliate-view 类型定义           |
| `src/services/ReaderEventBus.ts`        | 修改 | P1: 删除废弃事件定义                     |
| `src/services/AnnotationService.ts`     | 修改 | P1: 删除废弃事件 emit                    |
| `src/services/ReaderController.ts`      | 修改 | P1: 删除废弃事件 emit + P2: 移除冗余条件 |
| `package.json`                          | 修改 | P1: 移动 eslint-plugin-react             |
| `src/datacore/annotationIndex.ts`       | 修改 | P2: 删除未使用方法                       |
| `src/datacore/index.ts`                 | 修改 | P2: 移除未使用 re-export                 |
| `src/views/OutlineView.ts`              | 修改 | P2: 移除空回调                           |
| `src/views/AnnotationsView.ts`          | 修改 | P2: 移除空回调                           |
| `src/views/ReaderView.ts`               | 修改 | P2: 移除重复常量定义                     |
| `src/views/readerHeader.ts`             | 修改 | P2: 使用统一常量                         |
| `src/constants.ts`                      | 修改 | P2: 添加字体大小常量                     |
| `src/viewers/hooks/index.ts`            | 修改 | P3: 精简 re-export                       |
| `src/viewers/hooks/useSelectionMenu.ts` | 修改 | P3: 移除未使用的 onClose                 |
| `src/components/OutlineComponent.tsx`   | 修改 | P3: 移除未使用 prop                      |

---

## Task 1: P0 - 修复 NoteModal Promise 重复 resolve

**Files:**

- Modify: `src/components/NoteModal.ts:20-22,74-76`

**问题:** `setCloseCallback` 和 `onClose()` 都会 resolve Promise，行为不一致（前者传空字符串，后者传用户输入）

- [ ] **Step 1: 删除 setCloseCallback 调用**

```typescript
// src/components/NoteModal.ts
// 删除第 20-22 行：
// this.setCloseCallback(() => {
//   this.resolvePromise({ note: '', cancelled: true });
// });
```

修改后的构造函数开头：

```typescript
constructor(app: App) {
    super(app);
    this.promise = new Promise((resolve) => {
      this.resolvePromise = resolve;
    });

    this.titleEl.setText('添加笔记');
    // setCloseCallback 已删除，统一由 onClose() 处理

    const textarea = this.contentEl.createEl('textarea', {
```

- [ ] **Step 2: 验证构建通过**

Run: `bun run check`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/components/NoteModal.ts
git commit -m "fix: remove duplicate Promise resolve in NoteModal

setCloseCallback and onClose() both resolved the Promise with
inconsistent behavior. Now only onClose() handles resolution,
preserving user-entered note content."
```

---

## Task 2: P1 - 扩展 foliate-js.d.ts 类型定义

**Files:**

- Rewrite: `src/types/foliate-js.d.ts`

**问题:** 当前仅 3 行声明，导致 30+ 处 `any` 类型

- [ ] **Step 1: 写入完整的类型定义**

```typescript
// src/types/foliate-js.d.ts

declare module 'foliate-js/view.js' {
  export default class FoliateView extends HTMLElement {
    open(source: File | object): Promise<void>;
    close(): Promise<void>;
    init(options?: { showTextStart?: boolean; lastLocation?: string }): void;
    goTo(target: string | number): void;
    next(): void;
    prev(): void;
    getCFI(index: number, range: Range): string;
    resolveNavigation(cfiRange: string): { index: number };
    addAnnotation(annotation: { value: string; text: string; color: string }): void;
    deleteAnnotation(annotation: { value: string }): void;

    book: FoliateBook;
    renderer: FoliateRenderer;
    lastLocation: string | null;
    isFixedLayout: boolean;
  }

  interface FoliateBook {
    sections: FoliateSection[];
    rendition: FoliateRendition;
    metadata?: Record<string, string | undefined>;
    toc?: FoliateTocItem[];
    getCover?: () => Promise<Blob | null>;
  }

  interface FoliateSection {
    label: string;
    href: string;
    load: () => Promise<string | object | null>;
  }

  interface FoliateRendition {
    spread?: 'none' | 'always' | 'auto';
    layout?: string;
  }

  interface FoliateTocItem {
    label: string;
    href: string;
    subitems?: FoliateTocItem[];
  }

  interface FoliateRenderer extends HTMLElement {
    getContents(): FoliateContent[];
    atStart: boolean;
    atEnd: boolean;
    tagName: string;
    setStyles(css: string): void;
  }

  interface FoliateContent {
    index: number;
    doc: Document;
  }

  interface FoliateRelocateEvent extends CustomEvent {
    detail: {
      index: number;
      total: number;
      label: string;
      canGoPrev: boolean;
      canGoNext: boolean;
    };
  }

  interface FoliateLoadEvent extends CustomEvent {
    detail: {
      doc: Document;
    };
  }

  interface FoliateDrawAnnotationEvent extends CustomEvent {
    detail: {
      value: string;
      color: string;
    };
  }

  interface FoliateCreateOverlayEvent extends CustomEvent {
    detail: {
      value: string;
      text: string;
      color: string;
    };
  }
}

declare module 'foliate-js/overlayer.js' {
  export const Overlayer: {
    highlight(range: Range, options: { color: string }): SVGGraphicsElement[];
    underline(range: Range, options: { color: string; width: number }): SVGGraphicsElement[];
    squiggly(range: Range, options: { color: string; width: number }): SVGGraphicsElement[];
  };
}

declare module 'foliate-js/pdf.js' {
  export function makePDF(file: File): Promise<{
    rendition: { layout: string; spread?: string };
    sections: FoliateSection[];
    metadata?: Record<string, string | undefined>;
    toc?: FoliateTocItem[];
    splitTOCHref: (href: string) => Promise<[number, null]>;
    getTOCFragment: (doc: Document) => HTMLElement;
    resolveHref: (href: string) => Promise<{ index: number }>;
    isExternal: (uri: string) => boolean;
  }>;
}

// HTMLElementTagNameMap 扩展，使 createElement('foliate-view') 返回正确类型
declare global {
  interface HTMLElementTagNameMap {
    'foliate-view': import('foliate-js/view.js').FoliateView;
  }
}
```

- [ ] **Step 2: 验证构建通过**

Run: `bun run check`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/types/foliate-js.d.ts
git commit -m "feat: add complete foliate-js type definitions

Defines FoliateView, FoliateBook, FoliateRenderer, and custom event
interfaces. Eliminates ~30 'any' type usages across the codebase."
```

---

## Task 3: P1 - 删除废弃事件定义和 emit 调用

**Files:**

- Modify: `src/services/ReaderEventBus.ts:7-9,17-19`
- Modify: `src/services/AnnotationService.ts:88-91`
- Modify: `src/services/ReaderController.ts:114,166`

**问题:** 4 个 Controller→View 事件已被 ReaderSessionStore 取代，emit 是无效操作

- [ ] **Step 1: 从 ReaderEventBus 删除废弃事件定义**

删除 `annotations:changed`, `navigation:target`, `session:closed`, `view:switch` 四个事件：

```typescript
// src/services/ReaderEventBus.ts
export interface ReaderEventMap {
  // 删除以下 4 行：
  // 'annotations:changed': { annotations: Annotation[]; source: 'user' | 'external' };
  // 'navigation:target': { target: NavigationTarget };
  // 'session:closed': Record<string, never>;
  // 'view:switch': { to: 'outline' | 'annotations' | 'reader' };

  /** 目录加载完成 */
  'outline:loaded': { items: OutlineItem[] };
  /** 书籍元数据加载完成 */
  'metadata:loaded': { metadata: BookMetadata };
  /** 章节位置变化 */
  'section:changed': { section: ReaderSectionState };

  // ── View → Controller 事件 ──────────
  'view:outline-loaded': { items: OutlineItem[] };
  'view:metadata-loaded': { metadata: BookMetadata };
  'view:section-changed': { section: ReaderSectionState };
  'view:annotations-changed': { annotations: Annotation[] };
  'view:session-close': Record<string, never>;
}
```

- [ ] **Step 2: 从 AnnotationService 删除废弃 emit**

删除第 88-91 行的 `bus.emit('annotations:changed', ...)` 调用：

```typescript
// src/services/AnnotationService.ts
// 删除：
// this.bus.emit('annotations:changed', {
//   annotations: changedAnnotations,
//   source: 'user',
// });
```

- [ ] **Step 3: 从 ReaderController 删除废弃 emit**

搜索并删除所有 `bus.emit('navigation:target', ...)` 和 `bus.emit('session:closed', ...)` 调用。

- [ ] **Step 4: 验证构建通过**

Run: `bun run check`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/services/ReaderEventBus.ts src/services/AnnotationService.ts src/services/ReaderController.ts
git commit -m "chore: remove deprecated Controller→View events

These events (annotations:changed, navigation:target, session:closed,
view:switch) were replaced by ReaderSessionStore observer pattern.
The emit calls were no-ops with no listeners."
```

---

## Task 4: P1 - 移动 eslint-plugin-react 到 devDependencies

**Files:**

- Modify: `package.json`

**问题:** eslint-plugin-react 仅用于 lint，不应在 dependencies 中

- [ ] **Step 1: 修改 package.json**

将 `eslint-plugin-react` 从 `dependencies` 移到 `devDependencies`：

```json
{
  "devDependencies": {
    "@blacksmithgu/datacore": "^0.1.24",
    "@eslint/js": "^9.39.4",
    "@types/node": "^25.9.2",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "builtin-modules": "5.2.0",
    "esbuild": "^0.28.0",
    "eslint": "^9.39.4",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-obsidianmd": "^0.3.0",
    "eslint-plugin-react": "^7.37.5",
    "obsidian": "latest",
    "prettier": "^3.8.4",
    "tslib": "2.8.1",
    "typescript": "6.0.3",
    "typescript-eslint": "^8.60.1"
  },
  "dependencies": {
    "foliate-js": "johnfactotum/foliate-js",
    "lucide-react": "^1.17.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  }
}
```

- [ ] **Step 2: 重新安装依赖**

Run: `bun install`
Expected: 无错误

- [ ] **Step 3: 验证构建通过**

Run: `bun run build`
Expected: 构建成功

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: move eslint-plugin-react to devDependencies

It's only used for linting and should not be bundled with the plugin."
```

---

## Task 5: P2 - 清理 AnnotationIndexService 未使用方法

**Files:**

- Modify: `src/datacore/annotationIndex.ts:41-133`
- Modify: `src/datacore/index.ts`

**问题:** 10 个公开方法从未被调用

- [ ] **Step 1: 删除未使用方法**

删除以下方法（保留 `getEntries()` 和 `rebuildIndex()`）：

- `get hasDatacore()` (行 41-43)
- `getCurrentEntries()` (行 51-53)
- `findAnnotationsForUri()` (行 56-63)
- `findEntryById()` (行 66-72)
- `upsertEntry()` (行 88-100)
- `removeEntry()` (行 103-107)
- `clear()` (行 110-115)
- `clearAll()` (行 118-121)
- `countForPath()` (行 126-128)
- `countWithNotesForPath()` (行 131-133)

- [ ] **Step 2: 从 datacore/index.ts 移除未使用的 re-export**

```typescript
// src/datacore/index.ts
export { DatacoreAdapter } from './adapter';
export { AnnotationIndexService } from './annotationIndex';
// 删除 type AnnotationIndexEntry 的 re-export
```

- [ ] **Step 3: 验证构建通过**

Run: `bun run check`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/datacore/annotationIndex.ts src/datacore/index.ts
git commit -m "chore: remove unused AnnotationIndexService methods

Only rebuildIndex() and getEntries() are used. Removed 10 unused
public methods to reduce maintenance burden."
```

---

## Task 6: P2 - 移除空回调占位符

**Files:**

- Modify: `src/views/OutlineView.ts:37-39`
- Modify: `src/views/AnnotationsView.ts:37-39`

**问题:** 注册了 header 按钮但回调为空，用户点击无效果

- [ ] **Step 1: 从 OutlineView 删除空回调**

```typescript
// src/views/OutlineView.ts
async onOpen() {
    // 删除以下 3 行：
    // this.addAction('file-text', 'Open reading view', () => {
    //   // Header button — will be wired via useReader() in Phase 2
    // });
    this.render();
  }
```

- [ ] **Step 2: 从 AnnotationsView 删除空回调**

```typescript
// src/views/AnnotationsView.ts
async onOpen() {
    // 删除以下 3 行：
    // this.addAction('file-text', 'Open reading view', () => {
    //   // Header button — will be wired via useReader() in Phase 2
    // });
    this.render();
  }
```

- [ ] **Step 3: 验证构建通过**

Run: `bun run check`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/views/OutlineView.ts src/views/AnnotationsView.ts
git commit -m "chore: remove empty header button callbacks

These buttons were registered but had no implementation.
Users clicking them would see no response."
```

---

## Task 7: P2 - 提取重复的字体大小常量

**Files:**

- Modify: `src/constants.ts`
- Modify: `src/views/ReaderView.ts:9-11`
- Modify: `src/views/readerHeader.ts:4-5`

**问题:** 字体大小边界值在两个文件中各定义了一份

- [ ] **Step 1: 在 constants.ts 添加统一常量**

```typescript
// src/constants.ts 末尾添加
export const READER_FONT_SIZE_MIN = 12;
export const READER_FONT_SIZE_MAX = 32;
export const READER_FONT_SIZE_STEP = 2;
export const READER_FONT_SIZE_DEFAULT = 18;
```

- [ ] **Step 2: 修改 ReaderView.ts 使用统一常量**

```typescript
// src/views/ReaderView.ts
import {
  READER_VIEW_TYPE,
  ICON_NAME,
  READER_FONT_SIZE_MIN,
  READER_FONT_SIZE_MAX,
  READER_FONT_SIZE_STEP,
} from '../constants';

// 删除本地定义：
// const READER_FONT_SIZE_MIN = 12;
// const READER_FONT_SIZE_MAX = 32;
// const READER_FONT_SIZE_STEP = 2;
```

- [ ] **Step 3: 修改 readerHeader.ts 使用统一常量**

```typescript
// src/views/readerHeader.ts
import { READER_FONT_SIZE_MIN, READER_FONT_SIZE_MAX } from '../constants';

// 删除本地定义：
// const READER_FONT_SIZE_MIN = 12;
// const READER_FONT_SIZE_MAX = 32;
```

- [ ] **Step 4: 验证构建通过**

Run: `bun run check`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/constants.ts src/views/ReaderView.ts src/views/readerHeader.ts
git commit -m "chore: extract font size constants to constants.ts

READER_FONT_SIZE_MIN/MAX/STEP were duplicated in ReaderView.ts and
readerHeader.ts. Now defined once in constants.ts."
```

---

## Task 8: P2 - 移除不必要的 export

**Files:**

- Modify: `src/services/TargetResolver.ts:5,15,20,75`
- Modify: `src/viewers/foliate/foliateBookMetadata.ts:12,27`
- Modify: `src/viewers/hooks/useAndroidPatches.ts:33,43`
- Modify: `src/services/ReaderSessionStore.ts:29`

**问题:** 16 个符号导出了但仅在定义文件内部使用

- [ ] **Step 1: 移除 TargetResolver.ts 的不必要 export**

```typescript
// src/services/TargetResolver.ts
// 将 export 改为无 export（模块内部可见）：
const SUPPORTED_READER_TYPES = new Set(['epub', 'pdf', 'mobi', 'kf8', 'fb2', 'fbz', 'cbz']);
const ANNOTATABLE_READER_TYPES = new Set(['epub', 'pdf']);
type ResolvedReaderTarget = { ... };
function getReaderTargetType(...) { ... }
```

- [ ] **Step 2: 移除 foliateBookMetadata.ts 的不必要 export**

```typescript
// src/viewers/foliate/foliateBookMetadata.ts
// 将 export 改为无 export：
function convertFoliateToc(...) { ... }
function extractMetadataString(...) { ... }
```

- [ ] **Step 3: 移除 useAndroidPatches.ts 的不必要 export**

```typescript
// src/viewers/hooks/useAndroidPatches.ts
// 将 export 改为无 export：
function enableBlobPatch() { ... }
function disableBlobPatch() { ... }
```

- [ ] **Step 4: 移除 ReaderSessionStore.ts 的不必要 export**

```typescript
// src/services/ReaderSessionStore.ts
// 将 export 改为无 export：
type ReaderSessionListener = (...) => void;
```

- [ ] **Step 5: 验证构建通过**

Run: `bun run check`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add src/services/TargetResolver.ts src/viewers/foliate/foliateBookMetadata.ts src/viewers/hooks/useAndroidPatches.ts src/services/ReaderSessionStore.ts
git commit -m "chore: remove unnecessary exports

16 symbols were exported but only used within their defining module.
Removed export keyword to reduce API surface."
```

---

## Task 9: P2 - 修复冗余条件判断

**Files:**

- Modify: `src/services/ReaderController.ts:206-208`

**问题:** `if (this.currentReaderSourcePath === sourceFile.path)` 条件永远为 true

- [ ] **Step 1: 移除冗余 if**

```typescript
// src/services/ReaderController.ts
// 修改前：
// if (this.currentReaderSourcePath === sourceFile.path) {
//   this.sessionStore.setAnnotations(annotations);
// }

// 修改后：
this.sessionStore.setAnnotations(annotations);
```

- [ ] **Step 2: 验证构建通过**

Run: `bun run check`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/services/ReaderController.ts
git commit -m "chore: remove redundant condition in ReaderController

The if check was always true at that point in the code flow."
```

---

## Task 10: P3 - 精简 hooks barrel 文件

**Files:**

- Modify: `src/viewers/hooks/index.ts`

**问题:** 多个 re-export 未被外部消费

- [ ] **Step 1: 精简 re-export**

检查 `FoliateViewer.tsx` 实际使用了哪些 hooks，只保留被消费的：

```typescript
// src/viewers/hooks/index.ts
export { useAndroidPatches, wrapSectionLoadForAndroid } from './useAndroidPatches';
export { useBookLoader } from './useBookLoader';
export { useAnnotationRendering, useAnnotationOverlays } from './useAnnotationRenderer';
export { useContextMenu } from './useContextMenu';
export {
  useNavigationTarget,
  useSectionTarget,
  usePageTurnTarget,
  useRelocateListener,
} from './useNavigation';
export { useFlowMode, useColumnMode, useFontSize } from './useReaderSettings';
```

删除未使用的 re-export：

- `BookLoaderCallbacks`
- `ContextMenuResult`
- `useMobileMenu`
- `useSelectionMenu`
- `applyReaderFlowMode`, `applyColumnMode`, `applyFontSize`

- [ ] **Step 2: 验证构建通过**

Run: `bun run check`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/viewers/hooks/index.ts
git commit -m "chore: clean up hooks barrel file

Remove re-exports that are not consumed by external modules."
```

---

## Task 11: P3 - 移除未使用的 onClose 和模块声明

**Files:**

- Modify: `src/viewers/hooks/useSelectionMenu.ts`
- Modify: `src/types/foliate-js.d.ts`

**问题:** `onClose` 从未被调用；`foliate-js/epub.js` 声明但未使用

- [ ] **Step 1: 从 useSelectionMenu 移除 onClose**

从 `SelectionMenuActions` 接口和返回值中删除 `onClose`。

- [ ] **Step 2: 从 foliate-js.d.ts 移除未使用声明**

删除 `declare module "foliate-js/epub.js";` 这一行（已在 Task 2 中处理）。

- [ ] **Step 3: 验证构建通过**

Run: `bun run check`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/viewers/hooks/useSelectionMenu.ts src/types/foliate-js.d.ts
git commit -m "chore: remove unused onClose and epub.js declaration

onClose was returned but never consumed by callers.
foliate-js/epub.js module was declared but never imported."
```

---

## Task 12: P3 - 移除未使用的 index prop

**Files:**

- Modify: `src/components/OutlineComponent.tsx:15`

**问题:** `index` prop 解构后从未使用

- [ ] **Step 1: 移除未使用的 prop**

```typescript
// src/components/OutlineComponent.tsx
// 修改前：
// }> = ({ item, depth, index: _index, onNavigate }) => {

// 修改后：
}> = ({ item, depth, onNavigate }) => {
```

同时从 `OutlineNodeItem` 的 props 接口中删除 `index`。

- [ ] **Step 2: 验证构建通过**

Run: `bun run check`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/components/OutlineComponent.tsx
git commit -m "chore: remove unused index prop from OutlineComponent

The index prop was destructured but never used within the component."
```

---

## 最终验证

- [ ] **Step 1: 完整构建验证**

Run: `bun run build`
Expected: 构建成功，无错误

- [ ] **Step 2: Lint 检查**

Run: `bun run lint`
Expected: 无新增警告

- [ ] **Step 3: 格式检查**

Run: `bun run format:check`
Expected: 无格式问题
