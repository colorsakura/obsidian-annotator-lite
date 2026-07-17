import React, { useCallback, useState } from 'react';
import { BookMetadata, Bookmark, NavigationTarget, OutlineItem } from '../types/annotations';
import { useT } from '../i18n';
import { Trash2 } from 'lucide-react';

type TabId = 'outline' | 'bookmarks';

interface OutlineComponentProps {
  items: OutlineItem[];
  bookMetadata: BookMetadata | null;
  bookmarks: Bookmark[];
  onNavigate: (target: NavigationTarget) => void;
  onDeleteBookmark?: (id: string) => void;
}

// ─── 大纲树节点 ────────────────────────────────────────────────────

const OutlineNodeItem: React.FC<{
  item: OutlineItem;
  depth: number;
  onNavigate: (target: NavigationTarget) => void;
}> = ({ item, depth, onNavigate }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = item.children.length > 0;

  const handleClick = () => {
    if (hasChildren) {
      setExpanded(!expanded);
    }
    if (item.pageNumber !== undefined) {
      onNavigate({ pageNumber: item.pageNumber });
    } else if (item.href !== undefined) {
      onNavigate({ href: item.href });
    }
  };

  return (
    <div className="annotator-outline-node">
      <div
        className="annotator-outline-row"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={handleClick}
      >
        <span className="annotator-outline-chevron">
          {hasChildren ? (expanded ? '▾' : '▸') : ' '}
        </span>
        <span className="annotator-outline-title">{item.title}</span>
      </div>
      {expanded &&
        hasChildren &&
        item.children.map((child, i) => (
          <OutlineNodeItem
            key={`d${depth + 1}-${i}`}
            item={child}
            depth={depth + 1}
            onNavigate={onNavigate}
          />
        ))}
    </div>
  );
};

// ─── 书签列表项 ────────────────────────────────────────────────────

const BookmarkItem: React.FC<{
  bookmark: Bookmark;
  index: number;
  onNavigate: (target: NavigationTarget) => void;
  onDelete?: (id: string) => void;
}> = ({ bookmark, index, onNavigate, onDelete }) => {
  const t = useT();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = () => {
    onNavigate({ href: bookmark.cfiRange });
  };

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (showConfirm) {
        onDelete?.(bookmark.id);
        setShowConfirm(false);
      } else {
        setShowConfirm(true);
      }
    },
    [bookmark.id, onDelete, showConfirm],
  );

  const title = bookmark.title || t('bookmarks.defaultTitle').replace('{0}', String(index + 1));

  return (
    <div className="annotator-bookmark-item" onClick={handleClick}>
      <div className="annotator-bookmark-header">
        <span className="annotator-bookmark-title">{title}</span>
        <span className="annotator-bookmark-page">{bookmark.pageLabel}</span>
      </div>
      <div className="annotator-bookmark-actions">
        <button
          className={`annotator-bookmark-btn-delete ${showConfirm ? 'annotator-bookmark-btn-delete-confirm' : ''}`}
          title={showConfirm ? t('annotations.confirmDelete') : t('bookmarks.delete')}
          aria-label={showConfirm ? t('annotations.confirmDelete') : t('bookmarks.delete')}
          onClick={handleDelete}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

// ─── 主组件 ────────────────────────────────────────────────────────

export const OutlineComponent: React.FC<OutlineComponentProps> = ({
  items,
  bookMetadata,
  bookmarks,
  onNavigate,
  onDeleteBookmark,
}) => {
  const t = useT();
  const [activeTab, setActiveTab] = useState<TabId>('outline');

  return (
    <div className="annotator-outline-container">
      {/* 封面区域 */}
      {bookMetadata && (bookMetadata.coverUrl || bookMetadata.title) && (
        <div className="annotator-outline-cover-section">
          {bookMetadata.coverUrl ? (
            <img
              className="annotator-outline-cover"
              src={bookMetadata.coverUrl}
              alt={bookMetadata.title ?? 'Book cover'}
            />
          ) : (
            <div className="annotator-outline-cover-placeholder">
              <svg
                viewBox="0 0 24 24"
                width="48"
                height="48"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
          )}
          <div className="annotator-outline-metadata">
            {bookMetadata.title && (
              <div className="annotator-outline-book-title">{bookMetadata.title}</div>
            )}
            {bookMetadata.author && (
              <div className="annotator-outline-book-author">{bookMetadata.author}</div>
            )}
          </div>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="annotator-outline-tabs">
        <button
          className={`annotator-outline-tab ${activeTab === 'outline' ? 'annotator-outline-tab-active' : ''}`}
          onClick={() => setActiveTab('outline')}
        >
          {t('outline.tab.outline')}
        </button>
        <button
          className={`annotator-outline-tab ${activeTab === 'bookmarks' ? 'annotator-outline-tab-active' : ''}`}
          onClick={() => setActiveTab('bookmarks')}
        >
          {t('outline.tab.bookmarks')}
          {bookmarks.length > 0 && (
            <span className="annotator-bookmark-badge">{bookmarks.length}</span>
          )}
        </button>
      </div>

      {/* 大纲 Tab 内容 */}
      {activeTab === 'outline' && (
        <div className="annotator-outline-tab-content">
          {items.length === 0 ? (
            <div className="annotator-outline-empty">No table of contents available.</div>
          ) : (
            <div className="annotator-outline-tree">
              {items.map((item, i) => (
                <OutlineNodeItem key={`d0-${i}`} item={item} depth={0} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 书签 Tab 内容 */}
      {activeTab === 'bookmarks' && (
        <div className="annotator-outline-tab-content">
          {bookmarks.length === 0 ? (
            <div className="annotator-outline-empty">{t('bookmarks.empty')}</div>
          ) : (
            <div className="annotator-bookmarks-list">
              {bookmarks.map((b, i) => (
                <BookmarkItem
                  key={b.id}
                  bookmark={b}
                  index={i}
                  onNavigate={onNavigate}
                  onDelete={onDeleteBookmark}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
