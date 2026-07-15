import type { Annotation } from '../types/annotations';
import type { IAnnotationRenderer, IFoliateViewAdapter } from './engineTypes';
import { DEFAULT_HIGHLIGHT_COLOR } from '../constants';

/**
 * 标注渲染器。
 *
 * 负责：
 * - 持有 `appliedOverlayMap`（id → cfiRange 映射）
 * - 安装 foliate-js 的 create-overlay 和 draw-annotation 事件处理
 * - 增量同步标注 overlay（内部使用串行 Promise 队列）
 */
export class AnnotationRenderer implements IAnnotationRenderer {
  /** 已应用的 overlay 映射：annotation.id → cfiRange */
  private appliedOverlayMap: Map<string, string> = new Map();
  /** 串行队列确保 overlay 操作顺序执行 */
  private queue: Promise<void> = Promise.resolve();
  /** 视图适配器引用 */
  private viewAdapter: IFoliateViewAdapter | null = null;
  /** 获取当前标注列表的回调 */
  private getAnnotations: (() => Annotation[]) | null = null;
  /** 事件处理清理函数 */
  private cleanupFns: Array<() => void> = [];

  // ── 公开方法 ────────────────────────────────────────

  install(viewAdapter: IFoliateViewAdapter, getAnnotations: () => Annotation[]): void {
    this.uninstall();

    this.viewAdapter = viewAdapter;
    this.getAnnotations = getAnnotations;

    // 安装 create-overlay 事件处理（view.init() 之前）
    const cleanupCreate = this._installCreateOverlayListener();
    if (cleanupCreate) this.cleanupFns.push(cleanupCreate);

    // 安装 draw-annotation 事件处理
    const cleanupDraw = this._installDrawAnnotationListener();
    if (cleanupDraw) this.cleanupFns.push(cleanupDraw);
  }

  async syncOverlays(annotations: Annotation[]): Promise<void> {
    return this._enqueue(async () => {
      if (!this.viewAdapter) return;

      // 收集当前标注 ID
      const currentIds = new Set(annotations.map((a) => a.id));

      // 移除不再存在的 overlay
      for (const [id, cfiRange] of this.appliedOverlayMap) {
        if (currentIds.has(id)) continue;
        try {
          await this.viewAdapter.deleteAnnotation({ value: cfiRange });
        } catch {
          /* ignore */
        }
        this.appliedOverlayMap.delete(id);
      }

      // 添加新增的 overlay
      for (const a of annotations) {
        if (!a.cfiRange || this.appliedOverlayMap.has(a.id)) continue;
        this.appliedOverlayMap.set(a.id, a.cfiRange);
        try {
          await this.viewAdapter.addAnnotation({
            value: a.cfiRange,
            text:
              (a.target?.[0]?.selector?.find((s) => s.type === 'TextQuoteSelector') as any)
                ?.exact || '',
            color: a.color || DEFAULT_HIGHLIGHT_COLOR,
          });
        } catch {
          // 添加失败时从 map 移除，等待下次重试
          this.appliedOverlayMap.delete(a.id);
        }
      }
    });
  }

  uninstall(): void {
    for (const fn of this.cleanupFns) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    this.cleanupFns = [];
    this.appliedOverlayMap.clear();
    this.viewAdapter = null;
    this.getAnnotations = null;
  }

  /** 获取 appliedOverlayMap 用于测试 */
  getOverlayMap(): ReadonlyMap<string, string> {
    return this.appliedOverlayMap;
  }

  // ── 私有方法 ────────────────────────────────────────

  /** 串行队列执行 */
  private _enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue = this.queue.then(async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /** 安装 create-overlay 事件监听 */
  private _installCreateOverlayListener(): (() => void) | undefined {
    const view = this.viewAdapter?.view;
    if (!view) return;

    const handleCreateOverlay = async ({ detail }: any) => {
      const { index } = detail;
      const annotations = this.getAnnotations?.() ?? [];
      if (!annotations.length || !this.viewAdapter) return;

      for (const a of annotations) {
        if (!a.cfiRange) continue;
        try {
          const resolved = await this.viewAdapter.resolveNavigation(a.cfiRange);
          if (resolved && resolved.index === index) {
            await this.viewAdapter.addAnnotation({
              value: a.cfiRange,
              text:
                (a.target?.[0]?.selector?.find((s) => s.type === 'TextQuoteSelector') as any)
                  ?.exact || '',
              color: a.color || DEFAULT_HIGHLIGHT_COLOR,
            });
          }
        } catch {
          /* skip */
        }
      }
    };

    view.addEventListener('create-overlay', handleCreateOverlay);
    return () => view.removeEventListener('create-overlay', handleCreateOverlay);
  }

  /** 安装 draw-annotation 事件监听 */
  private _installDrawAnnotationListener(): (() => void) | undefined {
    const view = this.viewAdapter?.view;
    if (!view) return;

    const handleDrawAnnotation = async ({ detail }: any) => {
      const { draw, annotation } = detail;
      const color = annotation.color || DEFAULT_HIGHLIGHT_COLOR;
      const { Overlayer } = await import('foliate-js/overlayer.js');
      draw(Overlayer.highlight, { color });
    };

    // 清理之前的监听器
    const viewApi = view as any;
    const prevDraw = viewApi._drawListener;
    if (prevDraw) view.removeEventListener('draw-annotation', prevDraw);

    view.addEventListener('draw-annotation', handleDrawAnnotation);
    viewApi._drawListener = handleDrawAnnotation;

    return () => {
      view.removeEventListener('draw-annotation', handleDrawAnnotation);
      delete viewApi._drawListener;
    };
  }
}
