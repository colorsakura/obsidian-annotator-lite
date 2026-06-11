import type { ReaderFlowMode, ColumnMode } from '../constants';
import type { ReaderView } from './ReaderView';

const READER_FONT_SIZE_MIN = 80;
const READER_FONT_SIZE_MAX = 160;

export interface ReaderHeaderCallbacks {
  toggleReaderFlowMode: () => void;
  toggleColumnMode: () => void;
  decreaseFontSize: () => void;
  increaseFontSize: () => void;
  toggleOutline: () => void;
  toggleAnnotations: () => void;
  goBack: () => void;
}

export interface ReaderHeaderHandle {
  update(flowMode: ReaderFlowMode, columnMode: ColumnMode, fontSize: number): void;
}

export function setupReaderHeader(
  view: ReaderView,
  callbacks: ReaderHeaderCallbacks,
): ReaderHeaderHandle {
  const outlineAction = view.addAction('list-tree', 'Open outline', callbacks.toggleOutline);
  const annotationsAction = view.addAction(
    'highlighter',
    'Open annotations',
    callbacks.toggleAnnotations,
  );
  const readerFlowModeAction = view.addAction(
    'scroll-text',
    '切换滚动模式',
    callbacks.toggleReaderFlowMode,
  );
  const columnModeAction = view.addAction('columns', '切换为单列', callbacks.toggleColumnMode);
  const decreaseFontSizeAction = view.addAction('zoom-out', '减小字体', callbacks.decreaseFontSize);
  const increaseFontSizeAction = view.addAction('zoom-in', '增大字体', callbacks.increaseFontSize);
  const comebackAction = view.addAction('left-arrow', '返回笔记', callbacks.goBack);

  const setupHeader = () => {
    const header = outlineAction.closest('.view-header');
    if (!header) return;
    const navButtons = header.querySelector('.view-header-nav-buttons');
    navButtons?.remove();
    const leftGroup = header.querySelector('.view-header-left');
    if (leftGroup) {
      leftGroup.prepend(comebackAction);
      leftGroup.prepend(outlineAction);
    } else {
      header.prepend(outlineAction);
    }
  };

  activeWindow.requestAnimationFrame(setupHeader);

  return {
    update(flowMode: ReaderFlowMode, columnMode: ColumnMode, fontSize: number) {
      // 更新滚动模式按钮
      const isScrolled = flowMode === 'scrolled';
      readerFlowModeAction.setAttribute(
        'aria-label',
        isScrolled ? '切换到分页模式' : '切换到滚动模式',
      );
      readerFlowModeAction.classList.toggle('is-active', isScrolled);

      // 更新列模式按钮
      const isSingle = columnMode === 'single';
      columnModeAction.setAttribute('aria-label', isSingle ? '切换为双列' : '切换为单列');
      columnModeAction.classList.toggle('is-active', isSingle);

      // 更新字体大小按钮
      updateFontSizeAction(
        decreaseFontSizeAction,
        '减小字体',
        fontSize <= READER_FONT_SIZE_MIN,
        fontSize,
      );
      updateFontSizeAction(
        increaseFontSizeAction,
        '增大字体',
        fontSize >= READER_FONT_SIZE_MAX,
        fontSize,
      );
    },
  };
}

function updateFontSizeAction(
  action: HTMLElement,
  label: string,
  disabled: boolean,
  fontSize: number,
) {
  action.setAttribute('aria-label', `${label}（当前 ${fontSize}%）`);
  action.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  action.classList.toggle('is-disabled', disabled);
}
