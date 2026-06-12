/**
 * 视口观察器配置
 */
export interface ViewportObserverConfig {
  /** 预加载区域 */
  rootMargin: string;
  /** 区块进入视口回调 */
  onBlockEnter: (blockId: number) => void;
  /** 区块离开视口回调 */
  onBlockLeave: (blockId: number) => void;
}

/**
 * 视口观察器
 * 使用 IntersectionObserver 监控区块可见性
 */
export class ViewportObserver {
  private observer: IntersectionObserver;
  private elementToBlockId = new Map<Element, number>();

  constructor(doc: Document, config: ViewportObserverConfig) {
    // 确保 rootMargin 格式正确（必须是像素或百分比）
    const rootMargin = config.rootMargin || '0px';

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const blockId = this.elementToBlockId.get(entry.target);
          if (blockId === undefined) continue;

          if (entry.isIntersecting) {
            config.onBlockEnter(blockId);
          } else {
            config.onBlockLeave(blockId);
          }
        }
      },
      {
        // 使用 null 作为 root 表示使用 viewport
        // 在 iframe 中，这会使用 iframe 的 viewport
        root: null,
        rootMargin,
        threshold: 0,
      }
    );
  }

  /**
   * 观察元素
   */
  observe(element: Element, blockId: number): void {
    this.elementToBlockId.set(element, blockId);
    this.observer.observe(element);
  }

  /**
   * 停止观察元素
   */
  unobserve(element: Element): void {
    this.elementToBlockId.delete(element);
    this.observer.unobserve(element);
  }

  /**
   * 断开所有观察
   */
  disconnect(): void {
    this.observer.disconnect();
    this.elementToBlockId.clear();
  }
}
