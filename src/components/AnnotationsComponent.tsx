import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Annotation, NavigationTarget } from '../types/annotations';
import { Pencil, Trash2, Check } from 'lucide-react';
import { useT } from '../i18n';

interface AnnotationsComponentProps {
  annotations: Annotation[];
  onNavigate: (target: NavigationTarget) => void;
  onUpdateAnnotation?: (id: string, updates: Partial<Annotation>) => void;
  onDeleteAnnotation?: (id: string) => void;
}

function getHighlightText(a: Annotation): string {
  const selector = a.target?.[0]?.selector?.find((s) => s.type === 'TextQuoteSelector');
  if (selector && 'exact' in selector) {
    return selector.exact;
  }
  return '';
}

const AnnotationItem: React.FC<{
  annotation: Annotation;
  onNavigate: (target: NavigationTarget) => void;
  onUpdateAnnotation?: (id: string, updates: Partial<Annotation>) => void;
  onDeleteAnnotation?: (id: string) => void;
}> = ({ annotation, onNavigate, onUpdateAnnotation, onDeleteAnnotation }) => {
  const t = useT();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(annotation.text);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }
  }, [isEditing]);

  const handleSaveNote = useCallback(() => {
    if (editText !== annotation.text && onUpdateAnnotation) {
      onUpdateAnnotation(annotation.id, { text: editText });
    }
    setIsEditing(false);
  }, [annotation.id, annotation.text, editText, onUpdateAnnotation]);

  const handleCancelEdit = useCallback(() => {
    setEditText(annotation.text);
    setIsEditing(false);
  }, [annotation.text]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancelEdit();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleSaveNote();
      }
    },
    [handleCancelEdit, handleSaveNote],
  );

  const handleDelete = useCallback(() => {
    if (showConfirmDelete) {
      onDeleteAnnotation?.(annotation.id);
      setShowConfirmDelete(false);
    } else {
      setShowConfirmDelete(true);
    }
  }, [annotation.id, onDeleteAnnotation, showConfirmDelete]);

  // Reset confirm dialog when annotation changes
  useEffect(() => {
    setShowConfirmDelete(false);
  }, [annotation.id]);

  const highlightText = getHighlightText(annotation);

  return (
    <div
      className="annotator-annotation-item"
      onClick={(e) => {
        // Don't navigate when clicking on buttons or textarea
        if ((e.target as HTMLElement).closest('button, textarea, .annotator-annotation-actions')) {
          return;
        }
        if (annotation.cfiRange) {
          onNavigate({ href: annotation.cfiRange });
        }
      }}
    >
      <div className="annotator-annotation-header">
        <div className="annotator-annotation-highlight">{highlightText}</div>
        <div className="annotator-annotation-actions">
          {!isEditing && (
            <button
              className="annotator-annotation-btn annotator-annotation-btn-edit"
              title={t('annotations.editNote')}
              aria-label={t('annotations.editNote')}
              onClick={(e) => {
                e.stopPropagation();
                setEditText(annotation.text);
                setIsEditing(true);
              }}
            >
              <Pencil size={14} />
            </button>
          )}
          <button
            className={`annotator-annotation-btn annotator-annotation-btn-delete ${showConfirmDelete ? 'annotator-annotation-btn-delete-confirm' : ''}`}
            title={
              showConfirmDelete ? t('annotations.confirmDelete') : t('annotations.deleteAnnotation')
            }
            aria-label={
              showConfirmDelete ? t('annotations.confirmDelete') : t('annotations.deleteAnnotation')
            }
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
          >
            {showConfirmDelete ? <Check size={14} /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="annotator-annotation-edit" onClick={(e) => e.stopPropagation()}>
          <textarea
            ref={textareaRef}
            className="annotator-annotation-textarea"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('annotations.placeholder')}
            rows={3}
          />
          <div className="annotator-annotation-edit-actions">
            <button
              className="annotator-annotation-btn annotator-annotation-btn-save"
              onClick={handleSaveNote}
            >
              {t('common.save')}
            </button>
            <button
              className="annotator-annotation-btn annotator-annotation-btn-cancel"
              onClick={handleCancelEdit}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        annotation.text && <div className="annotator-annotation-note">{annotation.text}</div>
      )}

      {showConfirmDelete && (
        <div className="annotator-annotation-delete-hint">{t('annotations.confirmDeleteHint')}</div>
      )}
    </div>
  );
};

const AnnotationsComponent: React.FC<AnnotationsComponentProps> = ({
  annotations,
  onNavigate,
  onUpdateAnnotation,
  onDeleteAnnotation,
}) => {
  const t = useT();
  const annotatedItems = annotations.filter((a) => {
    const text = getHighlightText(a);
    return text || a.text;
  });

  return (
    <div className="annotator-annotations-container">
      {annotatedItems.length === 0 ? (
        <div className="annotator-annotations-empty">{t('annotations.empty')}</div>
      ) : (
        <div className="annotator-annotations-list">
          {annotatedItems.map((a) => (
            <AnnotationItem
              key={a.id}
              annotation={a}
              onNavigate={onNavigate}
              onUpdateAnnotation={onUpdateAnnotation}
              onDeleteAnnotation={onDeleteAnnotation}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AnnotationsComponent;
