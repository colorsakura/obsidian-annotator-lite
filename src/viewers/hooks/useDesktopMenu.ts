import type { App } from 'obsidian';
import type { Annotation } from '../../types/annotations';
import type { HighlightColor } from '../../constants';
import {
  useSelectionMenu,
  type SelectionMenuState,
  type SelectionMenuActions,
} from './useSelectionMenu';

export type ContextMenuResult = {
  menuState: SelectionMenuState | null;
  menuActions: SelectionMenuActions;
  menuRef: React.RefObject<HTMLDivElement | null>;
};

export function useDesktopMenu(
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
  annotations: Annotation[],
  onDeleteAnnotation: (id: string) => void,
  colors?: HighlightColor[],
): ContextMenuResult {
  return useSelectionMenu({
    view,
    loaded,
    isAnnotatable,
    fileType,
    annotations,
    onAddAnnotation: onAddAnnotation as any,
    onDeleteAnnotation,
    app,
    colors,
  });
}
