import React, { useCallback, useEffect, useRef, useState } from 'react';
import { applyTheme, isDarkMode } from '../engine/theme';
import { Platform } from 'obsidian';
import { useObsidianApp } from '../hooks/useObsidianApp';
import { useSessionField } from '../contexts/ReaderStoreContext';
import { useReader } from '../contexts/ReaderAPIContext';
import { ReaderEngine } from '../engine/ReaderEngine';
import type { EngineEventBus } from '../engine/engineTypes';
import type { Annotation, NavigationTarget, PendingSelection } from '../types/annotations';
import type { ReaderSectionState } from '../services/ReaderSessionStore';
import SelectionMenu from '../components/SelectionMenu';
import SectionIndicator from '../components/SectionIndicator';
import { NoteModal } from '../components/NoteModal';
import type { ReaderFlowMode, ColumnMode, HighlightColor } from '../constants';
import { DEFAULT_HIGHLIGHT_COLORS } from '../constants';

// ─── Types ───────────────────────────────────────────────────────────────

interface AnnotationAddParams {
  type: 'pdf' | 'epub';
  cfiRange: string;
  text: string;
  prefix: string;
  suffix: string;
  note?: string;
  color?: string;
}

interface FoliateViewerProps {
  /** 目标文件路径（EPUB/PDF） */
  file: string;
  /** 源 Markdown 路径（用于标注持久化，由父组件管理） */
  sourcePath: string;

  /** 阅读模式，默认 'paginated' */
  flowMode?: ReaderFlowMode;
  /** 分栏模式，默认 'double' */
  columnMode?: ColumnMode;
  /** 字体大小百分比，默认 100 */
  fontSize?: number;
  /** 高亮颜色列表，默认 DEFAULT_HIGHLIGHT_COLORS */
  highlightColors?: HighlightColor[];

  /** 自定义标注添加行为（覆盖默认的持久化） */
  onAnnotationAdd?: (params: AnnotationAddParams) => void;
  /** 自定义标注删除行为（覆盖默认的持久化） */
  onAnnotationDelete?: (id: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────

/**
 * FoliateViewer — ReaderEngine 的薄 React 适配层。
 *
 * 职责：
 * - 创建并管理 ReaderEngine 生命周期
 * - 将引擎事件桥接到 ReaderEventBus
 * - 处理导航目标（从 SessionStore 读取）
 * - 应用阅读设置变化
 * - 渲染 SectionIndicator 和 SelectionMenu 覆盖层
 */
const FoliateViewer: React.FC<FoliateViewerProps> = React.memo(
  ({
    file,
    sourcePath: _sourcePath,
    flowMode = 'paginated',
    columnMode = 'double',
    fontSize = 100,
    highlightColors = DEFAULT_HIGHLIGHT_COLORS,
    onAnnotationAdd,
    onAnnotationDelete,
  }) => {
    const app = useObsidianApp();
    const containerRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<ReaderEngine | null>(null);
    const reader = useReader();
    const bus = reader.bus;

    // ─── Menu state（由 view:selection 事件驱动）────────────────────────
    const [menuVisible, setMenuVisible] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
    const [existingAnnotation, setExistingAnnotation] = useState<Annotation | undefined>();
    const pendingSelectionRef = useRef<PendingSelection | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // ─── Section state（由 view:section-changed 事件驱动）───────────────
    const [sectionInfo, setSectionInfo] = useState<ReaderSectionState>({
      currentIndex: 0,
      totalSections: 0,
    });

    // ─── Navigation target ─────────────────────────────────────────────
    const navigationTarget = useSessionField('navigationTarget') ?? null;
    const pendingNavRef = useRef<NavigationTarget | null>(null);

    // ─── Engine lifecycle（file 变化时重建引擎）──────────────────────────
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      // 创建总线适配器：将引擎事件映射到 view:* 前缀事件
      const engineBus: EngineEventBus = {
        emit: (event, payload) => {
          // annotations-changed 由引擎内部管理，不需要转发到 ReaderEventBus
          if (event === 'annotations-changed') return;
          const mapped = `view:${event}` as any;
          bus.emit(mapped, payload as any);
        },
      };

      const engine = new ReaderEngine(container, engineBus);
      engineRef.current = engine;

      // 订阅选择事件（SelectionDetector 通过引擎总线触发）
      const unsubSelection = bus.on(
        'view:selection',
        ({ selection, existingAnnotation: existing, position }) => {
          pendingSelectionRef.current = selection;
          setExistingAnnotation(existing);
          setMenuPosition(position);
          setMenuVisible(true);
        },
      );

      // 订阅章节变化事件（用于 SectionIndicator）
      const unsubSection = bus.on('view:section-changed', ({ section }) => {
        setSectionInfo(section);
      });

      // 确定文件类型
      const ext = file.split('.').pop()?.toLowerCase();
      const fileType = ext === 'pdf' ? ('pdf' as const) : ('epub' as const);

      // 主题观察器（引擎就绪后安装）
      let themeObserver: MutationObserver | null = null;

      // 打开引擎
      engine
        .open(file, fileType, {
          settings: { flowMode, columnMode, fontSize },
        })
        .then(() => {
          // 引擎就绪后，应用当前主题
          const view = engine.getView();
          if (view) {
            applyTheme(view, isDarkMode());
            // 观察 body class 变化（Obsidian 主题切换时触发）
            themeObserver = new MutationObserver(() => {
              const v = engineRef.current?.getView();
              if (v) applyTheme(v, isDarkMode());
            });
            themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
          }

          // 应用挂起的导航目标
          const pending = pendingNavRef.current;
          if (pending) {
            engine.navigate(pending).catch(console.error);
            pendingNavRef.current = null;
          }
        })
        .catch(console.error);

      return () => {
        unsubSelection();
        unsubSection();
        themeObserver?.disconnect();
        engine.close();
        engineRef.current = null;
      };
    }, [file]); // 仅在文件变化时重建引擎

    // ─── 应用设置变化 ──────────────────────────────────────────────────
    useEffect(() => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.updateSettings({ flowMode, columnMode, fontSize });
    }, [flowMode, columnMode, fontSize]);

    // ─── 处理导航目标 ─────────────────────────────────────────────────
    useEffect(() => {
      if (!navigationTarget) return;
      const engine = engineRef.current;
      if (engine?.getIsLoaded()) {
        engine.navigate(navigationTarget).catch(console.error);
      } else {
        pendingNavRef.current = navigationTarget;
      }
    }, [navigationTarget]);

    // ─── ESC 关闭菜单 ─────────────────────────────────────────────────
    useEffect(() => {
      if (!menuVisible) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setMenuVisible(false);
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [menuVisible]);

    // ─── 点击外部关闭菜单 ─────────────────────────────────────────────
    useEffect(() => {
      if (!menuVisible) return;

      const handleClick = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setMenuVisible(false);
        }
      };

      // 主文档监听（菜单通过 portal 渲染到 body，点击非 iframe 区域时生效）
      document.addEventListener('pointerdown', handleClick);

      // iframe 文档监听（foliate-js 将内容渲染在 iframe 中，
      // iframe 内的 pointerdown 不会冒泡到主文档，需要单独注册）
      const cleanupIframeFns: Array<() => void> = [];
      const view = engineRef.current?.getView();
      if (view) {
        const viewApi = view as any;
        const contents = viewApi.renderer?.getContents?.();
        if (contents) {
          for (const content of contents) {
            const doc = content.doc as Document | undefined;
            if (doc) {
              doc.addEventListener('pointerdown', handleClick);
              cleanupIframeFns.push(() => doc.removeEventListener('pointerdown', handleClick));
            }
          }
        }
      }

      return () => {
        document.removeEventListener('pointerdown', handleClick);
        for (const fn of cleanupIframeFns) {
          fn();
        }
      };
    }, [menuVisible]);

    // ─── 菜单操作 ─────────────────────────────────────────────────────
    const handleHighlight = useCallback(
      (color: string) => {
        const sel = pendingSelectionRef.current;
        if (!sel) return;
        const engine = engineRef.current;
        if (!engine) return;

        const params: AnnotationAddParams = {
          type: sel.type,
          cfiRange: sel.cfiRange,
          text: sel.text,
          prefix: sel.prefix,
          suffix: sel.suffix,
          color,
        };

        const annotation = engine.addAnnotation(params);

        if (onAnnotationAdd) {
          onAnnotationAdd(params);
        } else {
          void reader.addAnnotation(annotation);
        }

        pendingSelectionRef.current = null;
        setMenuVisible(false);
      },
      [onAnnotationAdd, reader],
    );

    const handleAddNote = useCallback(async () => {
      const sel = pendingSelectionRef.current;
      if (!sel || !app) return;
      setMenuVisible(false);

      const modal = new NoteModal(app);
      modal.open();
      const result = await modal.result;
      if (!result.cancelled && result.note.trim()) {
        const engine = engineRef.current;
        if (!engine) return;

        const params: AnnotationAddParams = {
          type: sel.type,
          cfiRange: sel.cfiRange,
          text: sel.text,
          prefix: sel.prefix,
          suffix: sel.suffix,
          note: result.note.trim(),
        };

        const annotation = engine.addAnnotation(params);

        if (onAnnotationAdd) {
          onAnnotationAdd(params);
        } else {
          void reader.addAnnotation(annotation);
        }
      }
      pendingSelectionRef.current = null;
    }, [onAnnotationAdd, reader, app]);

    const handleDelete = useCallback(
      (id: string) => {
        const engine = engineRef.current;
        if (!engine) return;

        engine.deleteAnnotation(id);

        if (onAnnotationDelete) {
          onAnnotationDelete(id);
        } else {
          void reader.deleteAnnotation(id);
        }

        pendingSelectionRef.current = null;
        setMenuVisible(false);
      },
      [onAnnotationDelete, reader],
    );

    const handleCopy = useCallback(async () => {
      const sel = pendingSelectionRef.current;
      if (!sel) return;
      try {
        await navigator.clipboard.writeText(sel.text);
      } catch {
        // 回退方案：用于旧浏览器或非安全上下文
        const textarea = document.createElement('textarea');
        textarea.value = sel.text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      pendingSelectionRef.current = null;
      setMenuVisible(false);
    }, []);

    // ─── 章节导航 ─────────────────────────────────────────────────────
    const handlePrev = useCallback(() => {
      const engine = engineRef.current;
      if (!engine?.getIsLoaded()) return;
      if (flowMode === 'paginated') {
        engine.goPrev().catch(console.error);
      } else {
        const info = engine.getSectionInfo();
        engine.goToSection(Math.max(0, info.currentIndex - 1)).catch(console.error);
      }
    }, [flowMode]);

    const handleNext = useCallback(() => {
      const engine = engineRef.current;
      if (!engine?.getIsLoaded()) return;
      if (flowMode === 'paginated') {
        engine.goNext().catch(console.error);
      } else {
        const info = engine.getSectionInfo();
        engine
          .goToSection(Math.min(info.totalSections - 1, info.currentIndex + 1))
          .catch(console.error);
      }
    }, [flowMode]);

    // ─── Render ────────────────────────────────────────────────────────
    return (
      <div ref={containerRef} className="foliate-viewer-container" tabIndex={0}>
        {sectionInfo.totalSections > 0 && (
          <SectionIndicator
            currentIndex={sectionInfo.currentIndex}
            totalSections={sectionInfo.totalSections}
            canGoPrev={sectionInfo.canGoPrev ?? sectionInfo.currentIndex > 0}
            canGoNext={
              sectionInfo.canGoNext ?? sectionInfo.currentIndex < sectionInfo.totalSections - 1
            }
            onPrev={handlePrev}
            onNext={handleNext}
          />
        )}
        {Platform.isDesktop && menuVisible && (
          <SelectionMenu
            visible={menuVisible}
            position={menuPosition}
            colors={highlightColors}
            existingAnnotation={existingAnnotation}
            onHighlight={handleHighlight}
            onAddNote={handleAddNote}
            onDelete={handleDelete}
            onCopy={handleCopy}
            menuRef={menuRef}
          />
        )}
      </div>
    );
  },
);

FoliateViewer.displayName = 'FoliateViewer';

export default FoliateViewer;
