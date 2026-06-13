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
```

生产构建输出三个文件到插件根目录：`main.js`、`styles.css`（来自 `src/global.css`）、`manifest.json`。GitHub Release 工作流在推送 tag 时触发，自动构建并发布。

## 技术栈

- **构建工具**：esbuild（通过 `build.ts`），含两个自定义插件（见下方）
- **运行时/包管理**：bun
- **阅读引擎**：foliate-js（GitHub 依赖 `johnfactotum/foliate-js`）
- **UI**：React 19（`react-dom/client` 的 `createRoot` API）
- **代码规范**：ESLint + Prettier + eslint-plugin-obsidianmd
- **类型检查**：TypeScript 6.0（仅检查，不产出声明文件）
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

1. **打开阅读器**：用户点击 Markdown 文件中右键菜单的 "Annotate" → `ReaderController.openFromMarkdownLeaf()` → `TargetResolver` 解析 `annotation-target` → `ViewCoordinator.openReader()` 替换当前 Markdown leaf 为 `ReaderView` → `ReaderView.setTargetFile()` 触发 React root.render() → `ReaderViewInner` 订阅 SessionStore → `FoliateViewer` 用 foliate-js 打开文件

2. **标注持久化**：`FoliateViewer` 内部的 `useContextMenu` hook 监听 iframe contextmenu → PC 端走 `useSelectionMenu`（自定义 React `SelectionMenu` 组件，通过 `createPortal` 渲染），移动端走 `useMobileMenu`（Obsidian Menu 回退） → 用户选择颜色/添加笔记 → `onAddAnnotation` 回调 → `ReaderViewInner` 更新 localAnnotations → 通过 `bus.emit('view:annotations-changed')` 通知 Controller → `AnnotationService.handleUserAnnotationsChanged()` → `AnnotationRepository.save()` 写入 Markdown 文件（`vault.process`） → `ReaderSessionStore` 更新状态 → 通过 `ReaderStoreContext` 同步到所有 React 组件

3. **事件通信**：`ReaderEventBus` 提供类型安全的事件发布/订阅机制。事件单向流动：
   - **View → Controller**（通过 bus.emit）：`view:outline-loaded`、`view:metadata-loaded`、`view:section-changed`、`view:annotations-changed`、`view:session-close`
   - **Controller → View**：通过 `ReaderSessionStore` 广播状态变化，View 通过 `useSessionStore()` / `useSessionField()` 订阅

4. **标注格式**：使用 obsidian-annotator 兼容的 blockquote 格式，嵌入 `%%annotation-json%%` 代码块，以 `^annotationId` 结尾

5. **选择菜单系统**：采用分层架构——`useContextMenu` 作为分发器，根据 `Platform.isDesktop` 选择 `useSelectionMenu`（自定义 React `SelectionMenu` 组件，通过 `createPortal` 渲染）或 `useMobileMenu`（Obsidian 原生 `Menu`）。`foliateSelection.ts` 提供移动端的 `showSelectionMenu()` 函数和 `NoteModal` 弹窗

### 关键设计决策

- **ReaderAPI 接口**：`ReaderAPI` 定义了 View 层调用 Controller 能力的统一接口（`navigateToTarget`、`navigateToAnnotation`、`updateAnnotation`、`deleteAnnotation`、`revealReader`、`toggleOutline`、`toggleAnnotations`、`closeSession`）。`DefaultReaderController` 同时实现 `ReaderController` 和 `ReaderAPI`。View 通过 `useReader()` hook 获取实例

- **React 状态更新 vs 组件重挂载**：`ReaderView`、`OutlineView`、`AnnotationsView` 都继承 `BaseReactView<Api>` 基类，使用 `apiRef` 模式。ItemView 只在目标文件变化时调用 `root.render()`，标注更新、导航跳转等通过 `apiRef` 的 imperative API 更新内部 React state，避免销毁/重建 foliate-js DOM

- **事件总线解耦**：`ReaderEventBus` 提供类型安全的事件发布/订阅机制。View 通过 `useReader().bus` emit 事件，Controller 通过 `wireViewEvents()` 监听并路由到 SessionStore/AnnotationService

- **Context 模式状态共享**：`ReaderSessionStore` 通过 `ReaderStoreContext` 注入 React 组件树，`ReaderAPI` 通过 `ReaderAPIContext` 注入。模块级单例（`setSessionStore()`、`setReaderAPI()`）解决 Obsidian `registerView` 工厂函数无法传参的问题。`useSessionField()` hook 支持按字段选择性订阅，避免无关状态变化引起重渲染

- **foliate-js 构建集成**：`build.ts` 含有两个自定义 esbuild 插件：
  - `foliatePdfPlugin`：内联 PDF.js worker 和 CSS，将动态 URL 路径替换为 base64 内联的 worker blob
  - `ignoreCssPlugin`：忽略 `.css` 导入（CSS 通过 `buildStyles()` 独立输出）

- **移动端兼容**：`manifest.json` 中 `isDesktopOnly` 为 `false`，插件必须同时支持桌面端和移动端（Android/iOS）。Obsidian 移动端使用 WebView 渲染，所有 DOM 操作需兼容 WebView 环境

- **Android WebView 兼容**：`useAndroidPatches.ts` 导出 `enableAndroidPatches()` / `disableAndroidPatches()` 三个运行时补丁（iframe sandbox 移除、blob URL 拦截、srcdoc 注入），解决 Android WebView 上 foliate-js 的跨域和沙箱问题。补丁必须在 `view.open()` 之前同步激活以拦截 blob URL 创建，由 `useBookLoader` 负责调用时机；内置 `Platform.isMobile` 检查，桌面端不生效。移动端没有 popout window，`FoliateViewer` 使用 `document.createElement` 而非 `ownerDocument.createElement`

- **Datacore 集成**：如果用户安装了 Datacore 插件，`DatacoreAdapter` 自动激活，利用其 Link 类型解析和倒排索引；否则回退到 `metadataCache.getFileCache()`

- **标注类型**：遵循 W3C Annotation Model / Hypothesis 兼容格式，使用 `TextQuoteSelector`、`TextPositionSelector`、`RangeSelector`，扩展了 `cfiRange`（EPUB CFI）和 `type`（pdf/epub）字段

- **PDF 双列/单列**：PDF 通过 foliate-js rendition.spread 控制，切换时需重新打开；EPUB 通过 `max-column-count` CSS 属性控制，无需重启

### React Hooks 架构

`FoliateViewer` 将复杂逻辑拆分为多个自定义 hooks（位于 `src/viewers/hooks/`）：

| Hook                                             | 职责                                                            |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `useBookLoader`                                  | 加载书籍文件，处理 foliate-js 打开流程                          |
| `useAnnotationRendering`                         | 标注渲染和高亮显示（渲染层）                                    |
| `useAnnotationOverlays`                          | 标注覆盖层管理（叠加层）                                        |
| `useContextMenu`                                 | 右键菜单分发器（PC → useSelectionMenu，移动端 → useMobileMenu） |
| `useSelectionMenu`                               | 选择菜单核心逻辑（contextmenu 监听、坐标转换、标注检测）        |
| `useMobileMenu`                                  | 移动端 Obsidian Menu 回退                                       |
| `useNavigationTarget`                            | 导航目标跳转（点击目录/标注跳转）                               |
| `useSectionTarget`                               | 章节目标跳转                                                    |
| `usePageTurnTarget`                              | 翻页控制                                                        |
| `useRelocateListener`                            | 章节位置变化监听                                                |
| `useFlowMode`                                    | 滚动/分页模式切换                                               |
| `useColumnMode`                                  | 单列/双列模式切换                                               |
| `useFontSize`                                    | 字体大小控制                                                    |
| `enableAndroidPatches` / `disableAndroidPatches` | Android WebView 兼容补丁（独立函数，非 hook）                   |

其他 hooks：

- `useObsidianApp` (`src/hooks/`) - 获取 Obsidian App 实例
- `useSessionStore` (`src/contexts/ReaderStoreContext.ts`) - 订阅 ReaderSessionStore 全量状态
- `useSessionField` (`src/contexts/ReaderStoreContext.ts`) - 按字段选择性订阅 SessionStore
- `useReader` (`src/contexts/ReaderAPIContext.ts`) - 获取 ReaderAPI 实例

### foliate-js 辅助模块（`src/viewers/foliate/`）

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

| 符号                           | 位置                                    | 职责                                                            |
| ------------------------------ | --------------------------------------- | --------------------------------------------------------------- |
| `AnnotatorLitePlugin`          | `src/main.ts`                           | 插件入口，注册视图、菜单、DOM 事件，管理设置                    |
| `DefaultReaderController`      | `src/services/ReaderController.ts`      | 核心控制器，实现 ReaderController + ReaderAPI                   |
| `ReaderAPI`                    | `src/services/ReaderAPI.ts`             | View → Controller 统一接口                                      |
| `ObsidianViewCoordinator`      | `src/services/ViewCoordinator.ts`       | 管理三个 ItemView 的 leaf 生命周期                              |
| `ObsidianTargetResolver`       | `src/services/TargetResolver.ts`        | 解析 annotation-target → 绝对文件路径                           |
| `AnnotationService`            | `src/services/AnnotationService.ts`     | 标注业务逻辑 + 持久化（含防重入保护）                           |
| `ReaderEventBus`               | `src/services/ReaderEventBus.ts`        | 事件总线，解耦 Controller 与 View 通信                          |
| `ReaderSessionStore`           | `src/services/ReaderSessionStore.ts`    | 会话状态 + 观察者广播，通过 Context 注入 React                  |
| `BaseReactView`                | `src/views/BaseReactView.ts`            | ItemView 基类，共享 React root 管理和 Provider 注入             |
| `MarkdownAnnotationRepository` | `src/services/AnnotationRepository.ts`  | 标注 ↔ Markdown 持久化                                          |
| `DatacoreAdapter`              | `src/datacore/adapter.ts`               | Datacore/metadataCache 双路径前置元读取                         |
| `AnnotationIndexService`       | `src/datacore/annotationIndex.ts`       | 标注内存索引                                                    |
| `ReaderView`                   | `src/views/ReaderView.ts`               | 主阅读视图（继承 BaseReactView），含 header 按钮                |
| `ReaderViewInner`              | `src/components/ReaderViewInner.tsx`    | Reader 的 React 内层，管理标注状态和事件通信                    |
| `FoliateViewer`                | `src/viewers/FoliateViewer.tsx`         | foliate-js React 封装（React.memo）                             |
| `SelectionMenu`                | `src/components/SelectionMenu.tsx`      | 自定义右键菜单（颜色选择、笔记、删除）                          |
| `SectionIndicator`             | `src/components/SectionIndicator.tsx`   | 章节导航指示器（上/下一章按钮）                                 |
| `NoteModal`                    | `src/components/NoteModal.ts`           | 添加笔记弹窗（移动端使用）                                      |
| `useContextMenu`               | `src/viewers/hooks/useContextMenu.ts`   | 右键菜单分发器（PC → useSelectionMenu，移动端 → useMobileMenu） |
| `useSelectionMenu`             | `src/viewers/hooks/useSelectionMenu.ts` | 选择菜单核心逻辑（contextmenu 监听、坐标转换、标注检测）        |
| `useMobileMenu`                | `src/viewers/hooks/useMobileMenu.ts`    | 移动端菜单（Obsidian Menu）                                     |
| `ReaderStoreContext`           | `src/contexts/ReaderStoreContext.ts`    | ReaderSessionStore 的 React Context                             |
| `ReaderAPIContext`             | `src/contexts/ReaderAPIContext.ts`      | ReaderAPI 的 React Context + useReader() hook                   |
| `AnnotatorLiteSettings`        | `src/services/Settings.ts`              | 插件设置接口（高亮颜色、字体大小、分栏、翻页模式）              |
| `HighlightColor`               | `src/constants.ts`                      | 高亮颜色类型定义                                                |
| `markdownStorage.ts`           | `src/utils/markdownStorage.ts`          | 标注 ↔ Markdown 格式转换                                        |
| `constants.ts`                 | `src/constants.ts`                      | 视图类型常量、前置元字段名、图标名、默认高亮颜色                |
