import type { ReaderEventBus } from './ReaderEventBus';
import type { Annotation, NavigationTarget } from '../types/annotations';

/**
 * ReaderAPI — View 层调用 Controller 能力的统一接口。
 * 通过 useReader() hook 在 React 组件中获取实例。
 */
export interface ReaderAPI {
  /** EventBus 实例，供 View emit view:* 事件通知 Controller */
  readonly bus: ReaderEventBus;

  navigateToTarget(target: NavigationTarget): void;
  navigateToAnnotation(annotationId: string): Promise<void>;
  updateAnnotation(id: string, updates: Partial<Annotation>): Promise<void>;
  deleteAnnotation(id: string): Promise<void>;
  revealReader(): void;
  toggleOutline(): Promise<void>;
  toggleAnnotations(): Promise<void>;
  closeSession(): void;
  /** 保存当前阅读进度到历史记录 */
  saveProgress(): Promise<void>;
}
