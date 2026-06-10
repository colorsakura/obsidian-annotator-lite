import { useEffect, useRef } from 'react';
import { Platform } from 'obsidian';
import type { Annotation } from '../../types/annotations';
import type { HighlightColor } from '../../constants';
import { installAnnotationRendering, applyAnnotationOverlays } from '../foliate/foliateAnnotations';
import { showSelectionMenu, type PendingSelection } from '../foliate/foliateSelection';
import {
  useSelectionMenu,
  type SelectionMenuState,
  type SelectionMenuActions,
} from './useSelectionMenu';
import type { App } from 'obsidian';

/**
 * 安装标注渲染处理器（draw-annotation / create-overlay 事件）。
 * 在 view 加载完成后调用，组件卸载时自动清理。
 */
export function useAnnotationRendering(
  view: HTMLElement | null,
  loaded: boolean,
  annotations: Annotation[],
  isAnnotatable: boolean,
): void {
  const annotationsRef = useRef<Annotation[]>(annotations);
  annotationsRef.current = annotations;

  useEffect(() => {
    if (!view || !loaded || !isAnnotatable) return;
    return installAnnotationRendering(view, () => annotationsRef.current);
  }, [view, loaded, isAnnotatable]);
}

/**
 * 当标注列表变化时，应用新的标注覆盖层。
 */
export function useAnnotationOverlays(
  view: HTMLElement | null,
  loaded: boolean,
  annotations: Annotation[],
): void {
  const appliedIdsRef = useRef<Set<string>>(new Set());

  // Reset applied IDs when view changes
  useEffect(() => {
    if (!view) return;
    appliedIdsRef.current = new Set();
  }, [view]);

  useEffect(() => {
    if (!view || !loaded) return;
    void applyAnnotationOverlays(view, annotations, appliedIdsRef.current);
  }, [view, loaded, annotations]);
}

type ContextMenuResult = {
  menuState: SelectionMenuState | null;
  menuActions: SelectionMenuActions;
  menuRef: React.RefObject<HTMLDivElement | null>;
};

/**
 * 安装右键菜单处理器。
 * PC 端使用自定义 React 菜单（useSelectionMenu），移动端回退到 Obsidian Menu。
 *
 * @important 必须在组件顶层无条件调用（hooks 规则），不能放在 if/条件分支中。
 */
export function useContextMenu(
  view: HTMLElement | null,
  loaded: boolean,
  isAnnotatable: boolean,
  fileType: 'pdf' | 'epub' | undefined,
  onAddAnnotation: ((params: {
    type: 'pdf' | 'epub';
    cfiRange: string;
    text: string;
    prefix: string;
    suffix: string;
    note?: string;
    color?: string;
  }) => void) | undefined,
  app: App,
  containerRef: React.RefObject<HTMLDivElement | null>,
  annotations: Annotation[],
  onDeleteAnnotation: (id: string) => void,
  colors?: HighlightColor[],
): ContextMenuResult | null {
  const isDesktop = Platform.isDesktop;

  // Desktop: use custom React menu
  const desktopMenu = useSelectionMenu({
    view: isDesktop ? view : null,
    loaded,
    isAnnotatable,
    fileType,
    annotations,
    onAddAnnotation: onAddAnnotation as any,
    onDeleteAnnotation,
    app,
    colors,
  });

  // Mobile: keep Obsidian Menu fallback
  const loadHandlerRef = useRef<((e: any) => void) | null>(null);
  const pendingSelectionRef = useRef<PendingSelection | null>(null);

  useEffect(() => {
    if (isDesktop) return;
    if (!view || !loaded || !isAnnotatable || !fileType || !onAddAnnotation) return;

    const handleLoad = async ({ detail }: any) => {
      const { doc } = detail;
      if (!doc || !(view as any).renderer) return;

      const win = doc.defaultView as Window;
      const hostDoc = win.parent?.document ?? containerRef.current?.ownerDocument;
      if (!hostDoc) return;

      doc.addEventListener('contextmenu', (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        showSelectionMenu(
          view, win, hostDoc, ev, fileType,
          pendingSelectionRef, onAddAnnotation, app,
        );
      });
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
    };
  }, [isDesktop, view, loaded, isAnnotatable, fileType, onAddAnnotation, app, containerRef]);

  if (isDesktop) {
    return desktopMenu;
  }
  return null;
}
