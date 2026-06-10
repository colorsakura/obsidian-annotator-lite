import { Platform } from 'obsidian';
import type { App } from 'obsidian';
import type { Annotation } from '../../types/annotations';
import type { HighlightColor } from '../../constants';
import {
  useSelectionMenu,
  type SelectionMenuState,
  type SelectionMenuActions,
} from './useSelectionMenu';
import { useMobileMenu } from './useMobileMenu';

export interface ContextMenuResult {
  menuState: SelectionMenuState | null;
  menuActions: SelectionMenuActions;
  menuRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * 右键菜单分发器。
 * PC 端使用自定义 React 菜单（useSelectionMenu），移动端回退到 Obsidian Menu（useMobileMenu）。
 *
 * @important 必须在组件顶层无条件调用（hooks 规则），不能放在 if/条件分支中。
 */
export function useContextMenu(
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
  annotations: Annotation[],
  onDeleteAnnotation: (id: string) => void,
  colors?: HighlightColor[],
): ContextMenuResult | null {
  const isDesktop = Platform.isDesktop;

  const desktopMenu = useSelectionMenu({
    view: isDesktop ? view : null,
    loaded,
    isAnnotatable,
    fileType,
    annotations,
    onAddAnnotation,
    onDeleteAnnotation,
    app,
    colors,
  });

  useMobileMenu(
    !isDesktop ? view : null,
    loaded,
    isAnnotatable,
    fileType,
    onAddAnnotation,
    app,
    containerRef,
    colors,
  );

  return isDesktop ? desktopMenu : null;
}
