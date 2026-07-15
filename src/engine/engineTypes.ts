import type { Annotation, OutlineItem, BookMetadata, PendingSelection } from '../types/annotations';
import type { ReaderSectionState } from '../services/ReaderSessionStore';
import type { ReaderFlowMode, ColumnMode, HighlightColor } from '../constants';

// ── 事件契约 ──────────────────────────────────────────

/** 引擎对外发射的所有事件及其 payload 类型 */
export interface EngineEventMap {
  'outline-loaded': { items: OutlineItem[] };
  'metadata-loaded': { metadata: BookMetadata };
  'section-changed': { section: ReaderSectionState };
  'annotations-changed': { annotations: Annotation[] };
  'location-changed': { cfi: string; sectionIndex: number };
  selection: {
    selection: PendingSelection;
    existingAnnotation?: Annotation;
    position: { x: number; y: number };
  };
}

/** 引擎依赖的最小事件总线接口 */
export interface EngineEventBus {
  emit<K extends keyof EngineEventMap>(event: K, payload: EngineEventMap[K]): void;
}

// ── 设置与选项 ────────────────────────────────────────

/** 阅读器显示设置 */
export interface ReaderSettings {
  /** 阅读模式：paginated（分页）| scrolled（滚动） */
  flowMode: ReaderFlowMode;
  /** 分栏模式：single（单列）| double（双列） */
  columnMode: ColumnMode;
  /** 字体大小百分比（100 = 默认） */
  fontSize: number;
}

/** `engine.open()` 的可选参数 */
export interface OpenOptions {
  /** 初始阅读设置（与当前设置合并） */
  settings?: Partial<ReaderSettings>;
  /** 可用高亮颜色列表 */
  highlightColors?: HighlightColor[];
}

/** `engine.addAnnotation()` 的参数 */
export interface AddAnnotationParams {
  /** 文件类型 */
  type: 'pdf' | 'epub';
  /** EPUB CFI 或 PDF 位置标识 */
  cfiRange: string;
  /** 选中文本 */
  text: string;
  /** 选中前上下文 */
  prefix: string;
  /** 选中后上下文 */
  suffix: string;
  /** 可选笔记 */
  note?: string;
  /** 可选高亮颜色 */
  color?: string;
}

// ── 生命周期状态 ──────────────────────────────────────

/** 引擎生命周期状态 */
export type EngineState = 'idle' | 'loading' | 'ready' | 'closed';

// ── Engine 内部模块接口 ───────────────────────────────

/** foliate-js 渲染器子适配接口 */
export interface IRendererAdapter {
  /** 获取当前渲染内容列表（含 iframe document 引用） */
  getContents(): { index: number; doc: Document }[];
  /** 设置 CSS 样式（注入到渲染器） */
  setStyles?(styles: string | string[]): void;
  /** 是否在开头位置 */
  atStart?: boolean;
  /** 是否在末尾位置 */
  atEnd?: boolean;
}

/**
 * foliate-js 视图的类型安全适配层接口。
 * 封装底层 foliate-js 的 DOM 操作，对外暴露类型化方法。
 */
export interface IFoliateViewAdapter {
  /** 底层 foliate-view DOM 元素 */
  readonly view: HTMLElement;

  /** 打开书籍对象（File 或 foliate book 对象） */
  open(book: unknown): Promise<void>;
  /** 初始化渲染器（通常在 open() 之后调用） */
  init(opts?: Record<string, unknown>): Promise<void>;
  /** 关闭视图释放资源 */
  close(): void;
  /** 导航到指定位置（CFI href 或页码索引） */
  goTo(target: string | number): void;
  /** 翻到下一页/屏 */
  next(): void;
  /** 翻到上一页/屏 */
  prev(): void;
  /** 添加标注 overlay */
  addAnnotation(opts: { value: string; text: string; color: string }): Promise<void>;
  /** 删除标注 overlay */
  deleteAnnotation(opts: { value: string }): Promise<void>;
  /** 解析 CFI 获取章节索引 */
  resolveNavigation(cfi: string): Promise<{ index: number } | null>;
  /** 从索引和 Range 获取 CFI */
  getCFI(index: number, range: Range): string;
  /** 渲染器子适配 */
  readonly renderer: IRendererAdapter;
}

/**
 * 标注渲染器接口。
 * 负责在 foliate-view 上安装事件处理、同步 overlay。
 */
export interface IAnnotationRenderer {
  /**
   * 安装渲染事件监听（create-overlay 和 draw-annotation）。
   * @param viewAdapter 视图适配器
   * @param getAnnotations 获取当前标注列表的回调
   */
  install(viewAdapter: IFoliateViewAdapter, getAnnotations: () => Annotation[]): void;
  /**
   * 增量同步标注 overlay（awaitable）。
   * 对比当前 appliedOverlayMap 和传入的 annotations，增删 overlay。
   */
  syncOverlays(annotations: Annotation[]): Promise<void>;
  /** 卸载所有事件监听，清理 overlay 映射 */
  uninstall(): void;
}

/**
 * Android 兼容补丁接口。
 * 管理 Android WebView 上的 iframe sandbox / blob URL 补丁生命周期。
 */
export interface IAndroidPatcher {
  /** 启用所有补丁（幂等） */
  enable(): void;
  /** 禁用所有补丁，恢复原始原型 */
  disable(): void;
}
