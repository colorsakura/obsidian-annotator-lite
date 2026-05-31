import {
  goToFirstSection,
  goToLastSection,
  goToNextPage,
  goToPrevPage,
} from './foliateNavigation';

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
