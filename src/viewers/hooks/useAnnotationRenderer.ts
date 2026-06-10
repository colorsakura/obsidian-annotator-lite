import { useEffect, useRef } from 'react';
import type { Annotation } from '../../types/annotations';
import { installAnnotationRendering, applyAnnotationOverlays } from '../foliate/foliateAnnotations';

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
 * 仅在标注列表实际发生变化时才触发更新，避免不必要的全量重绘。
 */
export function useAnnotationOverlays(
  view: HTMLElement | null,
  loaded: boolean,
  annotations: Annotation[],
): void {
  const prevAnnotationsRef = useRef<Annotation[]>([]);
  const appliedMapRef = useRef<Map<string, string>>(new Map());

  // Reset when view changes
  useEffect(() => {
    if (!view) return;
    appliedMapRef.current = new Map();
    prevAnnotationsRef.current = [];
  }, [view]);

  useEffect(() => {
    if (!view || !loaded) return;

    // Check if annotations actually changed
    const prevIds = new Set(prevAnnotationsRef.current.map((a) => a.id));
    const currIds = new Set(annotations.map((a) => a.id));
    const changed =
      annotations.length !== prevAnnotationsRef.current.length ||
      annotations.some((a) => !prevIds.has(a.id)) ||
      prevAnnotationsRef.current.some((a) => !currIds.has(a.id));

    if (changed) {
      void applyAnnotationOverlays(view, annotations, appliedMapRef.current);
    }

    prevAnnotationsRef.current = annotations;
  }, [view, loaded, annotations]);
}
