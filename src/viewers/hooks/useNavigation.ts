import { useEffect } from 'react';
import type { NavigationTarget } from '../../types/annotations';
import {
  navigateFoliate,
  goToSection,
  goToNextPage,
  goToPrevPage,
  installRelocateListener,
} from '../foliate/foliateNavigation';

/**
 * 处理导航目标变化（点击目录/标注跳转）。
 */
export function useNavigationTarget(
  view: HTMLElement | null,
  navigationTarget: NavigationTarget | null,
): void {
  useEffect(() => {
    if (!view || !navigationTarget) return;
    navigateFoliate(view, navigationTarget);
  }, [view, navigationTarget]);
}

/**
 * 处理章节跳转目标变化。
 */
export function useSectionTarget(view: HTMLElement | null, sectionTarget: number | null): void {
  useEffect(() => {
    if (!view || sectionTarget === null || sectionTarget === undefined) return;
    goToSection(view, sectionTarget);
  }, [view, sectionTarget]);
}

/**
 * 处理翻页目标变化（上一页/下一页按钮）。
 */
export function usePageTurnTarget(
  view: HTMLElement | null,
  pageTurnTarget: { direction: 'prev' | 'next'; nonce: number } | null,
): void {
  useEffect(() => {
    if (!view || !pageTurnTarget) return;
    if (pageTurnTarget.direction === 'prev') goToPrevPage(view);
    else goToNextPage(view);
  }, [view, pageTurnTarget]);
}

/**
 * 安装 relocate 监听器，追踪章节位置变化。
 */
export function useRelocateListener(
  view: HTMLElement | null,
  loaded: boolean,
  onSectionChange: (
    currentIndex: number,
    totalSections: number,
    currentLabel?: string,
    canGoPrev?: boolean,
    canGoNext?: boolean,
    cfi?: string,
  ) => void,
): void {
  useEffect(() => {
    if (!view || !loaded) return;
    return installRelocateListener(view, onSectionChange);
  }, [view, loaded, onSectionChange]);
}
