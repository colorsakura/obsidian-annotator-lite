# Engine Public API Contract

**Feature**: 002-engine-refactor
**Date**: 2025-07-15

## 概述

本文档定义 `ReaderEngine` 对外暴露的公共 API 契约。重构必须保持此契约向后兼容（FR-009/010）。

---

## ReaderEngine 公共方法

### 生命周期

```typescript
class ReaderEngine {
  constructor(container: HTMLElement, bus: EngineEventBus);
  open(filePath: string, fileType: 'pdf' | 'epub', opts?: OpenOptions): Promise<void>;
  close(): void;
}
```

**契约**：

- `constructor` — 接收 DOM 容器和事件总线，初始化子模块
- `open()` — 从 idle/closed → loading → ready；失败回退到 idle；loading/ready 状态下重复调用抛出 Error
- `close()` — 释放所有资源进入 closed；幂等（多次调用无害）

### 状态查询

```typescript
getState(): EngineState;
getIsLoaded(): boolean;
getAnnotations(): Annotation[];
getView(): HTMLElement | null;
getSectionInfo(): ReaderSectionState;
```

**契约**：

- 所有 getter 不改变状态
- `getAnnotations()` 返回新数组副本（不可变）
- `getView()` 在非 ready 状态下返回 null

### 标注操作

```typescript
setAnnotations(list: Annotation[]): void;
addAnnotation(params: AddAnnotationParams): Annotation;
deleteAnnotation(id: string): void;
```

**契约**：

- `setAnnotations()` — 替换全部标注，触发 `annotations-changed` 事件，触发 overlay 同步（返回 void，同步为 fire-and-forget）
- `addAnnotation()` — 创建新标注，返回创建的 Annotation 对象，事件触发 + overlay 同步
- `deleteAnnotation()` — 按 id 删除，不存在时静默忽略，事件触发 + overlay 同步
- 所有操作通过内部串行队列保证顺序执行

### 导航

```typescript
navigate(target: NavigationTarget): Promise<void>;
goToSection(index: number): Promise<void>;
goNext(): Promise<void>;
goPrev(): Promise<void>;
```

**契约**：

- 全部要求 `state === 'ready'`，否则抛出 Error
- 异步操作，完成后 resolve

### 设置

```typescript
updateSettings(partial: Partial<ReaderSettings>): void;
```

**契约**：

- idle 和 ready 状态下均可调用
- ready 状态下异步应用到 foliate-view（不阻塞调用方）
- partial 合并到当前设置

---

## EngineEventBus 事件契约

所有事件名和 payload 类型**保持不变**（FR-010）：

| 事件名                | Payload                                                                             | 触发时机                                |
| --------------------- | ----------------------------------------------------------------------------------- | --------------------------------------- |
| `outline-loaded`      | `{ items: OutlineItem[] }`                                                          | 书籍加载后提取目录                      |
| `metadata-loaded`     | `{ metadata: BookMetadata }`                                                        | 书籍加载后提取元数据                    |
| `section-changed`     | `{ section: ReaderSectionState }`                                                   | 章节切换或首次加载                      |
| `annotations-changed` | `{ annotations: Annotation[] }`                                                     | **所有**标注变更（包括 setAnnotations） |
| `location-changed`    | `{ cfi: string; sectionIndex: number }`                                             | 位置变化                                |
| `selection`           | `{ selection: PendingSelection; existingAnnotation?: Annotation; position: {x,y} }` | 用户选择文本                            |

---

## 类型定义（不变部分）

```typescript
// engineTypes.ts — 所有导出类型保持不变
type EngineState = 'idle' | 'loading' | 'ready' | 'closed';

interface EngineEventBus {
  emit<K extends keyof EngineEventMap>(event: K, payload: EngineEventMap[K]): void;
}

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

---

## 内部模块接口（新增）

以下接口为重构引入，不破坏外部 API 契约：

```typescript
// FoliateViewAdapter 接口
interface IFoliateViewAdapter {
  readonly view: HTMLElement;
  open(book: unknown): Promise<void>;
  init(opts?: Record<string, unknown>): Promise<void>;
  close(): void;
  goTo(target: string | number): void;
  next(): void;
  prev(): void;
  addAnnotation(opts: { value: string; text: string; color: string }): Promise<void>;
  deleteAnnotation(opts: { value: string }): Promise<void>;
  resolveNavigation(cfi: string): Promise<{ index: number } | null>;
  getCFI(index: number, range: Range): string;
  readonly renderer: IRendererAdapter;
}

// AnnotationRenderer 接口
interface IAnnotationRenderer {
  install(viewAdapter: IFoliateViewAdapter, getAnnotations: () => Annotation[]): void;
  syncOverlays(annotations: Annotation[]): Promise<void>;
  uninstall(): void;
}
```

这些接口仅在 engine 层内部使用，不导出到 `src/engine/` 外部。
