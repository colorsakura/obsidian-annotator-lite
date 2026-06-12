import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { StickyNote, Trash2 } from 'lucide-react';
import type { Annotation } from '../types/annotations';
import type { HighlightColor } from '../constants';

interface SelectionMenuProps {
  visible: boolean;
  position: { x: number; y: number };
  colors: HighlightColor[];
  existingAnnotation?: Annotation;
  onHighlight: (color: string) => void;
  onAddNote: () => void;
  onDelete: (annotationId: string) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}

const SelectionMenu: React.FC<SelectionMenuProps> = ({
  visible,
  position,
  colors,
  existingAnnotation,
  onHighlight,
  onAddNote,
  onDelete,
  menuRef,
}) => {
  // Adjust position to stay within viewport
  useEffect(() => {
    if (!visible || !menuRef.current) return;
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    const padding = 8;

    let x = position.x;
    let y = position.y;

    if (x + rect.width > window.innerWidth - padding) {
      x = window.innerWidth - rect.width - padding;
    }
    if (y + rect.height > window.innerHeight - padding) {
      y = window.innerHeight - rect.height - padding;
    }
    if (x < padding) x = padding;
    if (y < padding) y = padding;

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [visible, position, menuRef]);

  if (!visible) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="selection-menu"
      style={{ position: 'fixed', left: position.x, top: position.y }}
    >
      <div className="selection-menu__colors">
        {colors.map((color) => (
          <button
            key={color.id}
            className="selection-menu__color-dot"
            style={{ backgroundColor: color.value }}
            title={color.name}
            onClick={() => onHighlight(color.value)}
          />
        ))}
      </div>
      <div className="selection-menu__actions">
        <button className="selection-menu__item" onClick={onAddNote} title="添加笔记">
          <StickyNote className="selection-menu__icon" size={16} />
        </button>
        {existingAnnotation && (
          <button
            className="selection-menu__item selection-menu__item--danger"
            onClick={() => onDelete(existingAnnotation.id)}
            title="删除标注"
          >
            <Trash2 className="selection-menu__icon" size={16} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default SelectionMenu;
