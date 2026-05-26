import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Annotation, NavigationTarget } from '../types/annotations';

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
              title="Edit note"
              aria-label="Edit note"
              onClick={(e) => {
                e.stopPropagation();
                setEditText(annotation.text);
                setIsEditing(true);
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
          )}
          <button
            className={`annotator-annotation-btn annotator-annotation-btn-delete ${showConfirmDelete ? 'annotator-annotation-btn-delete-confirm' : ''}`}
            title={showConfirmDelete ? 'Click again to confirm' : 'Delete annotation'}
            aria-label={showConfirmDelete ? 'Confirm delete annotation' : 'Delete annotation'}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
          >
            {showConfirmDelete ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            )}
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
            placeholder="Add a note..."
            rows={3}
          />
          <div className="annotator-annotation-edit-actions">
            <button
              className="annotator-annotation-btn annotator-annotation-btn-save"
              onClick={handleSaveNote}
            >
              Save
            </button>
            <button
              className="annotator-annotation-btn annotator-annotation-btn-cancel"
              onClick={handleCancelEdit}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        annotation.text && <div className="annotator-annotation-note">{annotation.text}</div>
      )}

      {showConfirmDelete && (
        <div className="annotator-annotation-delete-hint">
          Click the checkmark again to confirm deletion
        </div>
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
  const annotatedItems = annotations.filter((a) => {
    const text = getHighlightText(a);
    return text || a.text;
  });

  return (
    <div className="annotator-annotations-container">
      {annotatedItems.length === 0 ? (
        <div className="annotator-annotations-empty">No highlights or notes yet.</div>
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
