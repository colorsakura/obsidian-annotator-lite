# Data Model: 重构 Engine 层

**Feature**: 002-engine-refactor
**Date**: 2025-07-15

## 实体关系概览

```text
ReaderEngine (门面)
  ├── BookLoader (加载管道)
  │     ├── 创建 FoliateViewAdapter
  │     └── 管理 AndroidPatcher
  ├── FoliateViewAdapter (视图适配)
  ├── AnnotationManager (数据源)
  │     └── 发射 annotations-changed 事件
  ├── AnnotationRenderer (渲染)
  │     ├── 持有 appliedOverlayMap
  │     └── 内部串行队列
  └── SelectionDetector (选择检测)
        └── 发射 selection 事件
```

## 核心实体

### 1. ReaderEngine (门面)

| 属性               | 类型                         | 说明                       |
| ------------------ | ---------------------------- | -------------------------- |
| state              | `EngineState`                | 当前生命周期状态           |
| bookLoader         | `BookLoader`                 | 书籍加载管道               |
| viewAdapter        | `FoliateViewAdapter \| null` | 视图适配器（ready 后非空） |
| annotationManager  | `AnnotationManager`          | 标注数据管理               |
| annotationRenderer | `AnnotationRenderer \| null` | 标注渲染器                 |
| selectionDetector  | `SelectionDetector`          | 选择检测器                 |
| settings           | `ReaderSettings`             | 当前阅读设置               |
| sectionInfo        | `ReaderSectionState`         | 当前章节信息               |
| cleanupFns         | `Array<() => void>`          | 资源清理回调列表           |
| filePath           | `string`                     | 当前加载的文件路径         |

**状态转换**：

```text
idle ──open()──▶ loading ──success──▶ ready ──close()──▶ closed
  ▲                                   │                    │
  └─────────────open()────────────────┘                    │
  ◀────────────────────────────────────────────────────────┘
```

- `open()` 从 `idle` 或 `closed` 进入 `loading`
- `loading` 状态下 `close()` 中断加载并释放资源
- `closed` 状态可重新 `open()`（引擎复用）

### 2. FoliateViewAdapter

| 属性/方法              | 类型                    | 说明                       |
| ---------------------- | ----------------------- | -------------------------- |
| view                   | `HTMLElement`           | 底层 foliate-view DOM 元素 |
| open(book)             | `Promise<void>`         | 打开书籍对象               |
| init(opts?)            | `Promise<void>`         | 初始化渲染器               |
| close()                | `void`                  | 关闭视图                   |
| goTo(target)           | `void`                  | 导航到位置                 |
| next()                 | `void`                  | 下一页                     |
| prev()                 | `void`                  | 上一页                     |
| addAnnotation(opts)    | `Promise<void>`         | 添加标注 overlay           |
| deleteAnnotation(opts) | `Promise<void>`         | 删除标注 overlay           |
| resolveNavigation(cfi) | `Promise<{index, ...}>` | 解析 CFI                   |
| getCFI(index, range)   | `string`                | 获取 CFI                   |
| renderer               | `RendererAdapter`       | 渲染器子适配               |

**创建**：`BookLoader` 内部通过 `createFoliateView()` 工厂函数创建并初始化。

### 3. BookLoader

| 属性/方法                                                    | 类型                        | 说明                                                                                     |
| ------------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------- |
| load(app, container, filePath, fileType, callbacks, options) | `Promise<BookLoaderResult>` | 主入口                                                                                   |
| 内部步骤                                                     | —                           | 文件检查 → 读取 → 创建 View → Android 补丁 → 打开 → 设置 → 元数据 → relocate 监听 → init |

**回调接口**（不变）：

```typescript
interface BookLoaderCallbacks {
  onOutlineLoaded(items: OutlineItem[]): void;
  onMetadataLoaded(metadata: BookMetadata): void;
  onSectionChanged(index, total, label?, canGoPrev?, canGoNext?, cfi?): void;
}
```

### 4. AnnotationManager

| 属性/方法                   | 类型           | 说明                                       |
| --------------------------- | -------------- | ------------------------------------------ |
| getAnnotations()            | `Annotation[]` | 返回副本                                   |
| setAnnotations(list)        | `void`         | 替换全部 + 触发 `annotations-changed` 事件 |
| addAnnotation(params, uri?) | `Annotation`   | 创建 + 返回 + 触发事件                     |
| deleteAnnotation(id)        | `void`         | 删除 + 触发事件                            |

**关键变更**：`setAnnotations()` 现在触发 `annotations-changed` 事件（修复不一致）。

### 5. AnnotationRenderer

| 属性/方法                            | 类型                  | 说明                                            |
| ------------------------------------ | --------------------- | ----------------------------------------------- |
| install(viewAdapter, getAnnotations) | `void`                | 安装 create-overlay 和 draw-annotation 事件处理 |
| syncOverlays(annotations)            | `Promise<void>`       | 增量同步 overlay（awaitable）                   |
| appliedOverlayMap                    | `Map<string, string>` | id → cfiRange 映射（移入此模块）                |
| queue                                | `Promise<void>`       | 内部串行队列                                    |

**数据流**：

```text
AnnotationManager.addAnnotation()
  → 触发 annotations-changed 事件
  → AnnotationRenderer.syncOverlays(annotations) [awaitable]
    → 串行队列
    → FoliateViewAdapter.addAnnotation() / deleteAnnotation()
```

### 6. SelectionDetector

| 属性/方法                                   | 类型         | 说明                               |
| ------------------------------------------- | ------------ | ---------------------------------- |
| install(view, fileType, getAnnotations)     | `void`       | 安装选择监听                       |
| uninstall()                                 | `void`       | 移除所有监听                       |
| findOverlappingAnnotation(cfi, annotations) | `Annotation` | 查找重叠标注（公开方法，保持不变） |

**不变**：此模块职责单一且稳定，重构中基本不修改。

### 7. EngineState

```typescript
type EngineState = 'idle' | 'loading' | 'ready' | 'closed';
```

**转换规则**：

| 当前状态 | 操作    | 新状态   | 前置条件     |
| -------- | ------- | -------- | ------------ |
| idle     | open()  | loading  | —            |
| closed   | open()  | loading  | —            |
| loading  | 成功    | ready    | —            |
| loading  | 失败    | idle     | 释放部分资源 |
| loading  | close() | closed   | 中断加载     |
| ready    | close() | closed   | 释放所有资源 |
| ready    | open()  | REJECTED | 禁止重复打开 |
| loading  | open()  | REJECTED | 禁止重复打开 |

## 事件流

```text
BookLoader → bus.emit('outline-loaded')
BookLoader → bus.emit('metadata-loaded')
BookLoader → bus.emit('section-changed')
AnnotationManager → bus.emit('annotations-changed')  [所有变更路径]
SelectionDetector → bus.emit('selection')
FoliateNavigation → bus.emit('location-changed')
```

## 不变更的数据结构

以下类型从 `engineTypes.ts` 保持不变：

- `EngineEventMap` — 事件名和 payload
- `EngineEventBus` — emit 接口
- `ReaderSettings` — flowMode, columnMode, fontSize
- `OpenOptions` — settings, highlightColors
- `AddAnnotationParams` — type, cfiRange, text, prefix, suffix, note, color
