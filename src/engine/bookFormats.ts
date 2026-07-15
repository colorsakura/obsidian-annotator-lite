import { FoliateViewAdapter } from './FoliateViewAdapter';
import type { ReaderFlowMode, ColumnMode } from '../constants';

/**
 * PDF/EPUB 格式特定的书籍打开和设置逻辑。
 * 从 BookLoader 提取以降低其复杂度。
 */

/** EPUB 专属：应用阅读设置和主题 */
export async function applyEpubSettings(
  viewAdapter: FoliateViewAdapter,
  options?: { flowMode?: ReaderFlowMode; columnMode?: ColumnMode; fontSize?: number },
): Promise<void> {
  if (!options) return;

  const { applyReaderFlowMode, applyColumnMode, applyFontSize } = await import('./readerSettings');
  if (options.flowMode) applyReaderFlowMode(viewAdapter.view, options.flowMode);
  if (options.columnMode) applyColumnMode(viewAdapter.view, options.columnMode);
  if (options.fontSize) applyFontSize(viewAdapter.view, options.fontSize);

  const { applyTheme, isDarkMode } = await import('./theme');
  applyTheme(viewAdapter.view, isDarkMode());
}

/** PDF 专属：通过 makePDF + rendition.spread 打开 */
export async function openPdfBook(
  viewAdapter: FoliateViewAdapter,
  fileObj: File,
  columnMode?: ColumnMode,
): Promise<void> {
  const { makePDF } = await import('foliate-js/pdf.js');
  const book = await makePDF(fileObj);
  book.rendition.spread = columnMode === 'single' ? 'none' : undefined;
  await viewAdapter.open(book);
}

/** EPUB 专属：直接 open + 应用设置 */
export async function openEpubBook(
  viewAdapter: FoliateViewAdapter,
  fileObj: File,
  options?: { flowMode?: ReaderFlowMode; columnMode?: ColumnMode; fontSize?: number },
): Promise<void> {
  await viewAdapter.open(fileObj);
  await applyEpubSettings(viewAdapter, options);
}
