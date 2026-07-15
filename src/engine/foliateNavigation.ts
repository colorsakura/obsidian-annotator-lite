import type { NavigationTarget } from '../types/annotations';

/**
 * Navigate the foliate-view element to a given target (CFI href or page number).
 */
export function navigateFoliate(view: HTMLElement, target: NavigationTarget): void {
  const viewApi = view as any;
  if (target.href) {
    viewApi.goTo(target.href);
  } else if (target.pageNumber !== undefined) {
    // PDF page navigation: pages are 0-indexed sections
    viewApi.goTo(target.pageNumber - 1);
  }
}

/**
 * Navigate to a specific section index.
 */
export function goToSection(view: HTMLElement, index: number): void {
  (view as any).goTo?.(index);
}

/**
 * Navigate to the next page/spread. In scrolled mode, foliate-js scrolls by one viewport.
 */
export function goToNextPage(view: HTMLElement): void {
  (view as any).next?.();
}

/**
 * Navigate to the previous page/spread. In scrolled mode, foliate-js scrolls by one viewport.
 */
export function goToPrevPage(view: HTMLElement): void {
  (view as any).prev?.();
}

/**
 * Navigate to the first section.
 */
export function goToFirstSection(view: HTMLElement): void {
  (view as any).goTo?.(0);
}

/**
 * Navigate to the last section.
 */
export function goToLastSection(view: HTMLElement): void {
  const viewApi = view as any;
  const book = viewApi.book;
  const lastIndex = book?.sections?.length ? book.sections.length - 1 : 0;
  viewApi.goTo?.(lastIndex);
}

/**
 * Install relocate event listener to track section progress.
 * Returns a cleanup function.
 */
export function installRelocateListener(
  view: HTMLElement,
  onSectionChange: (
    currentIndex: number,
    totalSections: number,
    currentLabel?: string,
    canGoPrev?: boolean,
    canGoNext?: boolean,
    cfi?: string,
  ) => void,
): () => void {
  const handleRelocate = ({ detail }: any) => {
    // Prefer detail.section (from SectionProgress, EPUB), fallback to renderer
    // contents (PDF adapter without section progress tracking).
    let index = detail.section?.current;
    let totalSections = detail.section?.total;

    if (index === undefined || totalSections === undefined) {
      const contents = (view as any).renderer?.getContents?.();
      const currentContent = contents?.[0];
      index = currentContent?.index ?? 0;
      const bookSections = (view as any).book?.sections;
      totalSections = bookSections?.length ?? 0;
    }

    const tocItem = detail.tocItem;
    const fallbackLabel =
      index !== undefined && (view as any).book?.sections?.[index]?.label
        ? (view as any).book.sections[index].label
        : undefined;
    const currentLabel = tocItem?.label ?? fallbackLabel;

    const renderer = (view as any).renderer;
    const canGoPrev = typeof renderer?.atStart === 'boolean' ? !renderer.atStart : index > 0;
    const canGoNext =
      typeof renderer?.atEnd === 'boolean' ? !renderer.atEnd : index < totalSections - 1;

    // 获取 CFI
    const cfi = detail.cfi;

    onSectionChange(index, totalSections, currentLabel, canGoPrev, canGoNext, cfi);
  };

  // Clean up previous listener
  const prevListener = (view as any)._relocateListener;
  if (prevListener) view.removeEventListener('relocate', prevListener);

  view.addEventListener('relocate', handleRelocate as any);
  (view as any)._relocateListener = handleRelocate;

  return () => {
    view.removeEventListener('relocate', handleRelocate);
    delete (view as any)._relocateListener;
  };
}

// ── 键盘导航（从 foliateKeyboard.ts 合并） ────────────

/**
 * Install keyboard navigation (PageUp/Down, Home/End) on a container element.
 * Returns a cleanup function that removes the listener.
 */
export function installKeyboardNavigation(
  container: HTMLElement,
  getView: () => HTMLElement | null,
): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    const view = getView();
    if (!view) return;

    if (e.key === 'PageDown') {
      e.preventDefault();
      goToNextPage(view);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      goToPrevPage(view);
    } else if (e.key === 'Home') {
      e.preventDefault();
      goToFirstSection(view);
    } else if (e.key === 'End') {
      e.preventDefault();
      goToLastSection(view);
    }
  };

  container.addEventListener('keydown', handleKeyDown);
  return () => container.removeEventListener('keydown', handleKeyDown);
}
