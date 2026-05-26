import { Menu } from 'obsidian';
import { NoteModal } from '../../components/NoteModal';

export interface PendingSelection {
  type: 'pdf' | 'epub';
  cfiRange: string;
  text: string;
  prefix: string;
  suffix: string;
}

/**
 * Extract surrounding context text from a DOM Range (prefix and suffix).
 */
export function getSurroundingContext(
  range: Range,
  maxChars: number = 100,
): { prefix: string; suffix: string } {
  let prefix = '';
  let suffix = '';

  try {
    const startNode = range.startContainer;
    if (startNode.nodeType === Node.TEXT_NODE) {
      prefix = startNode.textContent?.substring(0, range.startOffset) || '';
    }

    const endNode = range.endContainer;
    if (endNode.nodeType === Node.TEXT_NODE) {
      suffix = endNode.textContent?.substring(range.endOffset) || '';
    }

    prefix = prefix.replace(/\s+/g, ' ').trim();
    suffix = suffix.replace(/\s+/g, ' ').trim();

    if (prefix.length > maxChars) {
      prefix = '...' + prefix.substring(prefix.length - maxChars);
    }
    if (suffix.length > maxChars) {
      suffix = suffix.substring(0, maxChars) + '...';
    }
  } catch {
    // Fall back to empty context if DOM traversal fails
  }

  return { prefix, suffix };
}

/**
 * Build an Obsidian context menu for a text selection inside a foliate-view iframe.
 *
 * @param view - The <foliate-view> HTMLElement
 * @param win - The iframe's contentWindow
 * @param hostDoc - The host document (for menu.showAtPosition)
 * @param ev - The original contextmenu MouseEvent
 * @param fileType - The file type ('pdf' or 'epub')
 * @param pendingRef - Mutable ref to store selection data for menu action callbacks
 * @param onAddAnnotation - Callback when user chooses to highlight or add note
 */
export function showSelectionMenu(
  view: HTMLElement,
  win: Window,
  hostDoc: Document,
  ev: MouseEvent,
  fileType: 'pdf' | 'epub',
  pendingRef: { current: PendingSelection | null },
  onAddAnnotation: (params: PendingSelection & { note?: string }) => void,
  app: any,
): void {
  const iframeSelection = win.getSelection();
  if (!iframeSelection || iframeSelection.isCollapsed || !iframeSelection.rangeCount) return;

  const range = iframeSelection.getRangeAt(0);
  const text = iframeSelection.toString().trim();
  if (!text) return;

  try {
    const viewApi = view as any;
    const contents = viewApi.renderer?.getContents?.();
    if (!contents || contents.length === 0) return;

    const cfi = viewApi.getCFI(contents[0].index, range);
    const { prefix, suffix } = getSurroundingContext(range);

    pendingRef.current = {
      type: fileType,
      cfiRange: cfi,
      text,
      prefix,
      suffix,
    };

    // Convert iframe-local coordinates to host-window coordinates
    const iframeEl = win.frameElement as HTMLElement | null;
    const iframeRect = iframeEl?.getBoundingClientRect();
    const hostX = (iframeRect?.left ?? 0) + ev.clientX;
    const hostY = (iframeRect?.top ?? 0) + ev.clientY;

    const menu = new Menu();

    menu.addItem((item) => {
      item.setTitle('高亮');
      item.setIcon('highlighter');
      item.onClick(() => {
        const sel = pendingRef.current;
        if (!sel) return;
        onAddAnnotation(sel);
        pendingRef.current = null;
      });
    });

    menu.addItem((item) => {
      item.setTitle('添加笔记');
      item.setIcon('sticky-note');
      item.onClick(async () => {
        const sel = pendingRef.current;
        if (!sel) return;

        const modal = new NoteModal(app);
        modal.open();
        const result = await modal.result;
        if (!result.cancelled && result.note.trim()) {
          onAddAnnotation({ ...sel, note: result.note.trim() });
        }
        pendingRef.current = null;
      });
    });

    menu.showAtPosition({ x: hostX, y: hostY }, hostDoc);
  } catch {
    // Selection may not be convertible to CFI; silently ignore
  }
}
