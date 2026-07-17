import type { ReaderEventBus } from './ReaderEventBus';
import type { Annotation, Bookmark, NavigationTarget } from '../types/annotations';

/**
 * ReaderAPI — View 层调用 Controller 能力的统一接口。
 * 通过 useReader() hook 在 React 组件中获取实例。
 */
export interface ReaderAPI {
  /** EventBus 实例，供 View emit view:* 事件通知 Controller */
  readonly bus: ReaderEventBus;

  navigateToTarget(target: NavigationTarget): void;
  navigateToAnnotation(annotationId: string): Promise<void>;
  /** 添加标注（幂等：如果已存在则跳过添加，直接持久化） */
  addAnnotation(annotation: Annotation): Promise<void>;
  updateAnnotation(id: string, updates: Partial<Annotation>): Promise<void>;
  deleteAnnotation(id: string): Promise<void>;
  revealReader(): void;
  toggleOutline(): Promise<void>;
  toggleAnnotations(): Promise<void>;
  closeSession(): void;
  /** 保存当前阅读进度到历史记录 */
  saveProgress(): Promise<void>;

  /** 书签操作 */
  addBookmark(cfiRange: string, title: string, pageLabel?: string): Promise<void>;
  /** 添加当前位置的书签（使用最后已知的 CFI 和章节信息） */
  addCurrentBookmark(): Promise<void>;
  deleteBookmark(id: string): Promise<void>;
  updateBookmark(id: string, updates: Partial<Bookmark>): Promise<void>;
  /** 获取当前书籍的所有书签 */
  getBookmarks(): Bookmark[];
}
