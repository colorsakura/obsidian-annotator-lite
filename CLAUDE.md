<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Obsidian 插件，用于在 Obsidian 内直接阅读和标注 EPUB、MOBI、KF8 (AZW3)、FB2、FBZ、CBZ 和 PDF 文件。通过 Markdown 文件中的 `annotation-target` 前置元字段关联阅读目标，使用 foliate-js 作为阅读引擎。

## 项目规则

- 编写必要的代码注释

## 构建 & 开发命令

```bash
bun install              # 安装依赖
bun run dev              # 开发模式（watch），会输出 main.js + styles.css
bun run build            # 生产构建（类型检查 + 压缩）
bun run lint             # ESLint 检查
bun run format           # Prettier 格式化
bun run format:check     # Prettier 格式检查
bun run check            # ESLint + TypeScript 类型检查（不产生构建产物）
bun run test             # 运行测试（vitest run）
bun run test:watch       # 测试监听模式（vitest）
```

生产构建输出三个文件到插件根目录：`main.js`、`styles.css`（来自 `src/global.css`）、`manifest.json`。GitHub Release 工作流在推送 tag 时触发，自动构建并发布。

## 技术栈

- **构建工具**：esbuild（通过 `build.ts`），含两个自定义插件（见下方）
- **运行时/包管理**：bun
- **阅读引擎**：foliate-js（GitHub 依赖 `johnfactotum/foliate-js`）
- **UI**：React 19（`react-dom/client` 的 `createRoot` API）
- **数据获取**：TanStack Query（标注数据缓存）
- **代码规范**：ESLint + Prettier + eslint-plugin-obsidianmd
- **类型检查**：TypeScript 6.0（仅检查，不产出声明文件）
- **测试**：Vitest（引擎层单元测试）
- **图标**：lucide-react（React 图标库）

## 架构概览

### 核心流程

```
Plugin (main.ts)
  └─ ReaderController (ReaderAPI) ── 协调阅读器生命周期和标注 CRUD
       ├─ TargetResolver ── 从 annotation-target 前置元解析阅读目标文件路径
       ├─ ViewCoordinator ── 管理 Reader/Outline/Annotations 三个 ItemView 的开闭
       ├─ AnnotationService ── 标注业务逻辑（创建/更新/删除/查询）+ 持久化
       ├─ AnnotationRepository ── 读写 Markdown 中的标注数据（obsidian-annotator 兼容格式）
       ├─ ReaderEventBus ── 事件总线，解耦 Controller 与 View 通信
       ├─ ReaderSessionStore ── 阅读会话状态存储（观察者模式，通过 Context 注入 React）
       ├─ DatacoreAdapter ── 统一前置元读取：Datacore API 优先 → metadataCache 回退
       └─ AnnotationIndexService ── 标注的内存索引（快速查询）
```

### 阅读引擎层（`src/engine/`）

核心阅读逻辑从 React hooks 提取为独立的引擎层，与 UI 框架解耦：

```
ReaderEngine ── 核心引擎（生命周期：idle → loading → ready → closed）
  ├─ AnnotationManager ── 标注 CRUD（创建/删除/查询），变更时 emit 'annotations-changed'
  ├─ SelectionDetector ── 通过 contextmenu 事件检测 iframe 内文本选择，emit 'selection'
  ├─ bookLoader ── 从 vault 加载书籍文件，创建 <foliate-view>，应用设置和主题
  ├─ readerSettings ── 应用阅读设置（flowMode、columnMode、fontSize）到 foliate-view
  ├─ theme ── 主题检测（Obsidian body class）和 CSS 注入
  ├─ androidPatches ── Android WebView 兼容补丁（iframe sandbox、blob URL → srcdoc）
  └─ engineTypes.ts ── 引擎类型定义（EngineEventMap、EngineState、ReaderSettings 等）
```

引擎使用 `EngineEventBus` 发射事件，`FoliateViewer` 通过总线适配器将引擎事件映射到 `ReaderEventBus` 的 `view:*` 前缀事件。

### 三种 ItemView（继承 BaseReactView）

| View              | 类型常量        | 侧边栏位置                   | 技术                                                |
| ----------------- | --------------- | ---------------------------- | --------------------------------------------------- |
| `ReaderView`      | `reader-view`   | 主区域（替换 Markdown leaf） | React (ReaderViewInner → FoliateViewer)             |
| `OutlineView`     | `outline-view`  | 左侧栏                       | React (OutlineViewInner → OutlineComponent)         |
| `AnnotationsView` | `annotate-view` | 右侧栏                       | React (AnnotationsViewInner → AnnotationsComponent) |

三个 View 继承 `BaseReactView<Api>` 基类，共享：

- React root 创建/卸载
- `AppContext.Provider`、`ReaderStoreContext.Provider`、`ReaderAPIContext.Provider` 自动注入
- `updateOrFallback()` 模式：优先通过 apiRef 更新 React state，未挂载时回退到 render()

### 数据流

1. **打开阅读器**：用户点击 Markdown 文件中右键菜单的 "Annotate" → `ReaderController.openFromMarkdownLeaf()` → `TargetResolver` 解析 `annotation-target` → `ViewCoordinator.openReader()` 替换当前 Markdown leaf 为 `ReaderView` → `ReaderView.setTargetFile()` 触发 React root.render() → `ReaderViewInner` 订阅 SessionStore → `FoliateViewer` 创建 `ReaderEngine` → `engine.open()` → `bookLoader.loadBook()` 加载书籍文件并创建 foliate-view

2. **标注持久化**：`SelectionDetector` 监听 foliate-view iframe 的 contextmenu 事件 → 提取文本选择和 CFI → 通过 `EngineEventBus` emit `selection` 事件 → `FoliateViewer` 的总线适配器映射为 `view:selection` → 显示 `SelectionMenu`（桌面端 React 组件）→ 用户选择颜色/添加笔记 → `engine.addAnnotation()` 更新引擎内部状态 → `onAnnotationAdd` 回调 → `ReaderViewInner` → 通过 `bus.emit('view:annotations-changed')` 通知 Controller → `AnnotationService.handleUserAnnotationsChanged()` → `AnnotationRepository.save()` 写入 Markdown 文件（`vault.process`） → `ReaderSessionStore` 更新状态 → 通过 `ReaderStoreContext` 同步到所有 React 组件

3. **事件通信**：双层事件总线架构，事件单向流动：
   - **引擎层**（`EngineEventBus`）：`ReaderEngine` 内部事件（`outline-loaded`、`metadata-loaded`、`section-changed`、`annotations-changed`、`location-changed`、`selection`）
   - **View → Controller**（`ReaderEventBus`，通过 bus.emit）：`view:outline-loaded`、`view:metadata-loaded`、`view:section-changed`、`view:annotations-changed`、`view:selection`、`view:session-close`
   - **Controller → View**：通过 `ReaderSessionStore` 广播状态变化，View 通过 `useSessionStore()` / `useSessionField()` 订阅
   - `FoliateViewer` 内部的总线适配器将引擎事件映射为 `view:*` 前缀事件（`annotations-changed` 除外，由引擎内部管理）

4. **标注格式**：使用 obsidian-annotator 兼容的 blockquote 格式，嵌入 `%%annotation-json%%` 代码块，以 `^annotationId` 结尾

5. **选择菜单系统**：`SelectionDetector`（引擎层）通过 contextmenu 事件检测 iframe 内文本选择，提取 CFI 和上下文后 emit `selection` 事件。`FoliateViewer` 根据 `Platform.isDesktop` 决定渲染方式：桌面端使用自定义 React `SelectionMenu` 组件，移动端回退到 Obsidian 原生 `Menu`。`foliateSelection.ts` 提供 `getSurroundingContext()` 等辅助函数

### 关键设计决策

- **ReaderAPI 接口**：`ReaderAPI` 定义了 View 层调用 Controller 能力的统一接口（`navigateToTarget`、`navigateToAnnotation`、`updateAnnotation`、`deleteAnnotation`、`revealReader`、`toggleOutline`、`toggleAnnotations`、`closeSession`）。`DefaultReaderController` 同时实现 `ReaderController` 和 `ReaderAPI`。View 通过 `useReader()` hook 获取实例

- **React 状态更新 vs 组件重挂载**：`ReaderView`、`OutlineView`、`AnnotationsView` 都继承 `BaseReactView<Api>` 基类，使用 `apiRef` 模式。ItemView 只在目标文件变化时调用 `root.render()`，标注更新、导航跳转等通过 `apiRef` 的 imperative API 更新内部 React state，避免销毁/重建 foliate-js DOM

- **事件总线解耦**：`ReaderEventBus` 提供类型安全的事件发布/订阅机制。View 通过 `useReader().bus` emit 事件，Controller 通过 `wireViewEvents()` 监听并路由到 SessionStore/AnnotationService

- **Context 模式状态共享**：`ReaderSessionStore` 通过 `ReaderStoreContext` 注入 React 组件树，`ReaderAPI` 通过 `ReaderAPIContext` 注入。模块级单例（`setSessionStore()`、`setReaderAPI()`）解决 Obsidian `registerView` 工厂函数无法传参的问题。`useSessionField()` hook 支持按字段选择性订阅，避免无关状态变化引起重渲染

- **foliate-js 构建集成**：`build.ts` 含有两个自定义 esbuild 插件：
  - `foliatePdfPlugin`：内联 PDF.js worker 和 CSS，将动态 URL 路径替换为 base64 内联的 worker blob
  - `ignoreCssPlugin`：忽略 `.css` 导入（CSS 通过 `buildStyles()` 独立输出）

- **移动端兼容**：`manifest.json` 中 `isDesktopOnly` 为 `false`，插件必须同时支持桌面端和移动端（Android/iOS）。Obsidian 移动端使用 WebView 渲染，所有 DOM 操作需兼容 WebView 环境

- **Android WebView 兼容**：`src/engine/androidPatches.ts` 导出 `enableAndroidPatches()` / `disableAndroidPatches()` 三个运行时补丁（iframe sandbox 移除、blob URL 拦截、srcdoc 注入），解决 Android WebView 上 foliate-js 的跨域和沙箱问题。补丁必须在 `view.open()` 之前同步激活以拦截 blob URL 创建，由 `bookLoader.loadBook()` 负责调用时机；内置 `Platform.isMobile` 检查，桌面端不生效。移动端没有 popout window，`FoliateViewer` 使用 `document.createElement` 而非 `ownerDocument.createElement`

- **Datacore 集成**：如果用户安装了 Datacore 插件，`DatacoreAdapter` 自动激活，利用其 Link 类型解析和倒排索引；否则回退到 `metadataCache.getFileCache()`

- **标注类型**：遵循 W3C Annotation Model / Hypothesis 兼容格式，使用 `TextQuoteSelector`、`TextPositionSelector`、`RangeSelector`，扩展了 `cfiRange`（EPUB CFI）和 `type`（pdf/epub）字段

- **PDF 双列/单列**：PDF 通过 foliate-js rendition.spread 控制，切换时需重新打开；EPUB 通过 `max-column-count` CSS 属性控制，无需重启

- **引擎层架构**：核心阅读逻辑（书籍加载、标注管理、选择检测、设置应用、主题注入）从 React hooks 提取为独立的 `ReaderEngine` 类，与 UI 框架解耦。引擎通过 `EngineEventBus` 发射事件，`FoliateViewer` 作为薄适配层将引擎事件映射到 `ReaderEventBus`。这种分层使得引擎逻辑可独立测试（Vitest），且未来可支持非 React 的 UI 实现

### React Hooks 架构

核心阅读逻辑已迁移至 `src/engine/` 层（`ReaderEngine`、`AnnotationManager`、`SelectionDetector` 等），`FoliateViewer` 作为薄 React 适配层负责引擎生命周期管理和 UI 覆盖层渲染。

剩余 hooks（位于 `src/hooks/`）：

| Hook             | 职责                                                          |
| ---------------- | ------------------------------------------------------------- |
| `useObsidianApp` | 获取 Obsidian App 实例                                        |
| `useAnnotations` | 使用 TanStack Query 加载标注数据（通过 AnnotationRepository） |

Context hooks（位于 `src/contexts/`）：

| Hook              | 职责                                                        |
| ----------------- | ----------------------------------------------------------- |
| `useSessionStore` | 订阅 ReaderSessionStore 全量状态（`ReaderStoreContext.ts`） |
| `useSessionField` | 按字段选择性订阅 SessionStore，避免无关状态变化引起重渲染   |
| `useReader`       | 获取 ReaderAPI 实例（`ReaderAPIContext.ts`）                |

### foliate-js 辅助模块（`src/viewers/foliate/`，由引擎层调用）

| 模块                     | 职责                                         |
| ------------------------ | -------------------------------------------- |
| `foliateAnnotations.ts`  | foliate-js 标注渲染逻辑                      |
| `foliateBookMetadata.ts` | 书籍元数据提取（封面、标题、作者）           |
| `foliateKeyboard.ts`     | 键盘导航安装（翻页快捷键）                   |
| `foliateNavigation.ts`   | foliate-js 导航逻辑（CFI 跳转、章节切换）    |
| `foliateSelection.ts`    | 选择处理（CFI 提取、上下文提取、移动端菜单） |

### 其他关键模块

| 模块              | 位置                        | 职责                                                         |
| ----------------- | --------------------------- | ------------------------------------------------------------ |
| `readerHeader.ts` | `src/views/readerHeader.ts` | ReaderView header 按钮逻辑（滚动/分页、单列/双列、字体大小） |
| `foliate-js.d.ts` | `src/types/foliate-js.d.ts` | foliate-js 类型定义（FoliateView、Book、Renderer 等）        |

### 插件设置系统

设置通过 `AnnotatorLiteSettings` 接口定义（`src/services/Settings.ts`）：

```typescript
interface AnnotatorLiteSettings {
  highlightColors: HighlightColor[]; // 自定义高亮颜色列表
  defaultFontSize: number; // 默认字体大小百分比（80-160）
  defaultColumnMode: ColumnMode; // 默认分栏模式（'single' | 'double'）
  defaultFlowMode: ReaderFlowMode; // 默认翻页模式（'paginated' | 'scrolled'）
}
```

设置在 `main.ts` 中通过 `loadData()`/`saveData()` 持久化，并通过 `SettingTab` 提供 UI 配置界面。`ReaderController` 在打开阅读器时将设置传递给 `ReaderView`，`ReaderView` 在 `setTargetFile()` 时重置为插件默认值。

### 关键符号速查

| 符号                           | 位置                                   | 职责                                                               |
| ------------------------------ | -------------------------------------- | ------------------------------------------------------------------ |
| `AnnotatorLitePlugin`          | `src/main.ts`                          | 插件入口，注册视图、菜单、DOM 事件，管理设置                       |
| `DefaultReaderController`      | `src/services/ReaderController.ts`     | 核心控制器，实现 ReaderController + ReaderAPI                      |
| `ReaderAPI`                    | `src/services/ReaderAPI.ts`            | View → Controller 统一接口                                         |
| `ObsidianViewCoordinator`      | `src/services/ViewCoordinator.ts`      | 管理三个 ItemView 的 leaf 生命周期                                 |
| `ObsidianTargetResolver`       | `src/services/TargetResolver.ts`       | 解析 annotation-target → 绝对文件路径                              |
| `AnnotationService`            | `src/services/AnnotationService.ts`    | 标注业务逻辑 + 持久化（含防重入保护）                              |
| `ReaderEventBus`               | `src/services/ReaderEventBus.ts`       | 事件总线，解耦 Controller 与 View 通信                             |
| `ReaderSessionStore`           | `src/services/ReaderSessionStore.ts`   | 会话状态 + 观察者广播，通过 Context 注入 React                     |
| `BaseReactView`                | `src/views/BaseReactView.ts`           | ItemView 基类，共享 React root 管理和 Provider 注入                |
| `MarkdownAnnotationRepository` | `src/services/AnnotationRepository.ts` | 标注 ↔ Markdown 持久化                                             |
| `DatacoreAdapter`              | `src/datacore/adapter.ts`              | Datacore/metadataCache 双路径前置元读取                            |
| `AnnotationIndexService`       | `src/datacore/annotationIndex.ts`      | 标注内存索引                                                       |
| `ReaderEngine`                 | `src/engine/ReaderEngine.ts`           | 核心阅读引擎（生命周期管理、标注、导航、设置）                     |
| `AnnotationManager`            | `src/engine/annotationManager.ts`      | 引擎层标注 CRUD，变更时 emit 'annotations-changed'                 |
| `SelectionDetector`            | `src/engine/selectionDetector.ts`      | 引擎层选择检测（contextmenu → CFI → selection 事件）               |
| `loadBook`                     | `src/engine/bookLoader.ts`             | 从 vault 加载书籍，创建 foliate-view，应用设置/主题/补丁           |
| `EngineEventMap`               | `src/engine/engineTypes.ts`            | 引擎事件类型定义（outline/metadata/section/annotations/selection） |
| `ReaderView`                   | `src/views/ReaderView.ts`              | 主阅读视图（继承 BaseReactView），含 header 按钮                   |
| `ReaderViewInner`              | `src/components/ReaderViewInner.tsx`   | Reader 的 React 内层，管理标注状态和事件通信                       |
| `FoliateViewer`                | `src/viewers/FoliateViewer.tsx`        | ReaderEngine 的薄 React 适配层（React.memo）                       |
| `SelectionMenu`                | `src/components/SelectionMenu.tsx`     | 自定义右键菜单（颜色选择、笔记、删除）                             |
| `SectionIndicator`             | `src/components/SectionIndicator.tsx`  | 章节导航指示器（上/下一章按钮）                                    |
| `NoteModal`                    | `src/components/NoteModal.ts`          | 添加笔记弹窗（移动端使用）                                         |
| `enableAndroidPatches`         | `src/engine/androidPatches.ts`         | Android WebView 兼容补丁（iframe sandbox、blob URL → srcdoc）      |
| `applyTheme` / `isDarkMode`    | `src/engine/theme.ts`                  | 主题检测和 CSS 注入到 foliate-view renderer                        |
| `ReaderStoreContext`           | `src/contexts/ReaderStoreContext.ts`   | ReaderSessionStore 的 React Context                                |
| `ReaderAPIContext`             | `src/contexts/ReaderAPIContext.ts`     | ReaderAPI 的 React Context + useReader() hook                      |
| `useAnnotations`               | `src/hooks/useAnnotations.ts`          | TanStack Query 加载标注数据                                        |
| `AnnotatorLiteSettings`        | `src/services/Settings.ts`             | 插件设置接口（高亮颜色、字体大小、分栏、翻页模式）                 |
| `HighlightColor`               | `src/constants.ts`                     | 高亮颜色类型定义                                                   |
| `markdownStorage.ts`           | `src/utils/markdownStorage.ts`         | 标注 ↔ Markdown 格式转换                                           |
| `constants.ts`                 | `src/constants.ts`                     | 视图类型常量、前置元字段名、图标名、默认高亮颜色                   |

