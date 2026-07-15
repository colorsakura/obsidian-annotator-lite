import type { IFoliateViewAdapter, IRendererAdapter } from './engineTypes';

/**
 * foliate-js 视图的类型安全适配层。
 *
 * 封装 foliate-js 自定义元素（<foliate-view>）的原生 DOM 操作，
 * 将 `(view as any)` 类型断言集中于此文件，对外暴露类型化方法。
 * 如果 foliate-js 未来提供官方类型，只需修改此适配层。
 */
export class FoliateViewAdapter implements IFoliateViewAdapter {
  public readonly view: HTMLElement;

  constructor(view: HTMLElement) {
    this.view = view;
  }

  /** 底层 foliate-js API（未经类型化包装） */
  private get _api(): any {
    return this.view as any;
  }

  // ── 生命周期 ────────────────────────────────────────

  async open(book: unknown): Promise<void> {
    await this._api.open(book);
  }

  async init(opts?: Record<string, unknown>): Promise<void> {
    await this._api.init(opts);
  }

  close(): void {
    try {
      this._api.close?.();
    } catch {
      /* ignore */
    }
  }

  // ── 导航 ────────────────────────────────────────────

  goTo(target: string | number): void {
    this._api.goTo(target);
  }

  next(): void {
    this._api.next?.();
  }

  prev(): void {
    this._api.prev?.();
  }

  // ── 标注 overlay ────────────────────────────────────

  async addAnnotation(opts: { value: string; text: string; color: string }): Promise<void> {
    await this._api.addAnnotation(opts);
  }

  async deleteAnnotation(opts: { value: string }): Promise<void> {
    await this._api.deleteAnnotation(opts);
  }

  // ── CFI ─────────────────────────────────────────────

  async resolveNavigation(cfi: string): Promise<{ index: number } | null> {
    return (await this._api.resolveNavigation(cfi)) ?? null;
  }

  getCFI(index: number, range: Range): string {
    return this._api.getCFI(index, range);
  }

  // ── 渲染器访问 ──────────────────────────────────────

  get renderer(): IRendererAdapter {
    return this._api.renderer as IRendererAdapter;
  }
}
