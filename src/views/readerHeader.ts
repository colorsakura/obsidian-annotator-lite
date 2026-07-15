import type { ReaderFlowMode, ColumnMode } from '../constants';
import { READER_FONT_SIZE_MIN, READER_FONT_SIZE_MAX } from '../constants';
import type { ReaderView } from './ReaderView';
import { t } from '../i18n';

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
  const outlineAction = view.addAction(
    'list-tree',
    t('reader.toolbar.outline'),
    callbacks.toggleOutline,
  );
  view.addAction('highlighter', t('reader.toolbar.annotations'), callbacks.toggleAnnotations);
  const readerFlowModeAction = view.addAction(
    'scroll-text',
    t('reader.toolbar.toggleScroll'),
    callbacks.toggleReaderFlowMode,
  );
  const columnModeAction = view.addAction(
    'columns',
    t('reader.toolbar.toggleSingle'),
    callbacks.toggleColumnMode,
  );
  const decreaseFontSizeAction = view.addAction(
    'zoom-out',
    t('reader.toolbar.zoomOut'),
    callbacks.decreaseFontSize,
  );
  const increaseFontSizeAction = view.addAction(
    'zoom-in',
    t('reader.toolbar.zoomIn'),
    callbacks.increaseFontSize,
  );
  const comebackAction = view.addAction('left-arrow', t('reader.toolbar.back'), callbacks.goBack);

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
        isScrolled ? t('reader.toolbar.togglePaginated') : t('reader.toolbar.toggleScroll'),
      );
      readerFlowModeAction.classList.toggle('is-active', isScrolled);

      // 更新列模式按钮
      const isSingle = columnMode === 'single';
      columnModeAction.setAttribute(
        'aria-label',
        isSingle ? t('reader.toolbar.toggleDouble') : t('reader.toolbar.toggleSingle'),
      );
      columnModeAction.classList.toggle('is-active', isSingle);

      // 更新字体大小按钮
      updateFontSizeAction(
        decreaseFontSizeAction,
        t('reader.toolbar.zoomOut'),
        fontSize <= READER_FONT_SIZE_MIN,
        fontSize,
      );
      updateFontSizeAction(
        increaseFontSizeAction,
        t('reader.toolbar.zoomIn'),
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
  const statusPart = t('reader.toolbar.fontSize.current').replace('{0}', String(fontSize));
  action.setAttribute('aria-label', `${label}${statusPart}`);
  action.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  action.classList.toggle('is-disabled', disabled);
}
