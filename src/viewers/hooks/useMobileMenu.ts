import { useEffect, useRef } from 'react';
import type { App } from 'obsidian';
import type { HighlightColor } from '../../constants';
import { showSelectionMenu, type PendingSelection } from '../foliate/foliateSelection';

/**
 * 移动端右键菜单：监听 iframe contextmenu 事件，使用 Obsidian Menu 回退。
 *
 * @important 必须在组件顶层无条件调用（hooks 规则），不能放在 if/条件分支中。
 */
export function useMobileMenu(
  view: HTMLElement | null,
  loaded: boolean,
  isAnnotatable: boolean,
  fileType: 'pdf' | 'epub' | undefined,
  onAddAnnotation:
    | ((params: {
        type: 'pdf' | 'epub';
        cfiRange: string;
        text: string;
        prefix: string;
        suffix: string;
        note?: string;
        color?: string;
      }) => void)
    | undefined,
  app: App,
  containerRef: React.RefObject<HTMLDivElement | null>,
  _colors?: HighlightColor[],
): void {
  const loadHandlerRef = useRef<((e: any) => void) | null>(null);
  const pendingSelectionRef = useRef<PendingSelection | null>(null);
  const currentDocRef = useRef<Document | null>(null);
  const contextHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);

  useEffect(() => {
    if (!view || !loaded || !isAnnotatable || !fileType || !onAddAnnotation) return;

    const handleLoad = ({ detail }: any) => {
      const { doc } = detail;
      if (!doc || !(view as any).renderer) return;

      // 清理上一个 doc 的 contextmenu 监听器
      if (currentDocRef.current && contextHandlerRef.current) {
        currentDocRef.current.removeEventListener('contextmenu', contextHandlerRef.current);
      }

      const win = doc.defaultView as Window;
      const hostDoc = win.parent?.document ?? containerRef.current?.ownerDocument;
      if (!hostDoc) return;

      const contextHandler = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        showSelectionMenu(
          view,
          win,
          hostDoc,
          ev,
          fileType,
          pendingSelectionRef,
          onAddAnnotation,
          app,
        );
      };

      doc.addEventListener('contextmenu', contextHandler);
      currentDocRef.current = doc;
      contextHandlerRef.current = contextHandler;
    };

    if (loadHandlerRef.current) {
      view.removeEventListener('load', loadHandlerRef.current as any);
    }
    view.addEventListener('load', handleLoad as any);
    loadHandlerRef.current = handleLoad as any;

    return () => {
      if (loadHandlerRef.current) {
        view.removeEventListener('load', loadHandlerRef.current as any);
        loadHandlerRef.current = null;
      }
      if (currentDocRef.current && contextHandlerRef.current) {
        currentDocRef.current.removeEventListener('contextmenu', contextHandlerRef.current);
        currentDocRef.current = null;
        contextHandlerRef.current = null;
      }
    };
  }, [view, loaded, isAnnotatable, fileType, onAddAnnotation, app, containerRef]);
}
