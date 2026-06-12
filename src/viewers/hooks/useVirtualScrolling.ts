import { useEffect, useState } from 'react';
import { VirtualScrollManager } from '../virtualization/VirtualScrollManager';
import { VirtualScrollConfig, DEFAULT_VIRTUAL_SCROLL_CONFIG } from '../virtualization/types';

/**
 * 虚拟滚动 hook
 * 在滚动模式下启用区块级虚拟滚动
 *
 * 当书籍已加载且虚拟滚动配置启用时，创建 VirtualScrollManager 实例，
 * 对 iframe 内的文档进行区块切分和视口观察。
 * 窗口 resize 时自动重建管理器以适配新的布局尺寸。
 *
 * @param view - foliate-view 元素（含 renderer）
 * @param isLoaded - 书籍是否已加载完成
 * @param config - 虚拟滚动配置（部分覆盖默认值）
 * @returns VirtualScrollManager 实例，未启用时返回 null
 */
export function useVirtualScrolling(
  view: any,
  isLoaded: boolean,
  config: Partial<VirtualScrollConfig> = {}
): VirtualScrollManager | null {
  const [manager, setManager] = useState<VirtualScrollManager | null>(null);
  const fullConfig = { ...DEFAULT_VIRTUAL_SCROLL_CONFIG, ...config };

  useEffect(() => {
    if (!isLoaded || !view?.renderer || !fullConfig.enabled) {
      return;
    }

    let instance: VirtualScrollManager | null = null;
    let cleanupResize: (() => void) | null = null;

    try {
      const contents = view.renderer.getContents();
      if (!contents || contents.length === 0) return;

      const doc = contents[0]?.doc as Document | undefined;
      if (!doc || !doc.documentElement) return;

      instance = new VirtualScrollManager(doc, fullConfig);
      instance.initialize();
      setManager(instance);

      // 窗口 resize 时重建管理器（区块尺寸可能需要重新计算）
      const iframe = doc.defaultView;
      if (iframe) {
        const handleResize = () => {
          if (instance) {
            instance.destroy();
            instance.initialize();
          }
        };

        iframe.addEventListener('resize', handleResize);
        cleanupResize = () => {
          iframe.removeEventListener('resize', handleResize);
        };
      }
    } catch (error) {
      console.warn('[Annotator Lite] Virtual scrolling initialization failed:', error);
      // 虚拟滚动初始化失败，降级到 content-visibility
      return;
    }

    return () => {
      cleanupResize?.();
      if (instance) {
        instance.destroy();
        setManager(null);
      }
    };
  }, [view, isLoaded, fullConfig.enabled]);

  return manager;
}
