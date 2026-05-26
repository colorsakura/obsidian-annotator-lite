import React, { useState } from 'react';
import { BookMetadata, NavigationTarget, OutlineItem } from '../types/annotations';

interface OutlineComponentProps {
  items: OutlineItem[];
  bookMetadata: BookMetadata | null;
  onNavigate: (target: NavigationTarget) => void;
}

const OutlineNodeItem: React.FC<{
  item: OutlineItem;
  depth: number;
  index: number; // position among siblings, used in key construction
  onNavigate: (target: NavigationTarget) => void;
}> = ({ item, depth, index, onNavigate }) => {
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
            index={i}
            onNavigate={onNavigate}
          />
        ))}
    </div>
  );
};

export const OutlineComponent: React.FC<OutlineComponentProps> = ({
  items,
  bookMetadata,
  onNavigate,
}) => {
  return (
    <div className="annotator-outline-container">
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
      {items.length === 0 ? (
        <div className="annotator-outline-empty">No table of contents available.</div>
      ) : (
        <div className="annotator-outline-tree">
          {items.map((item, i) => (
            <OutlineNodeItem
              key={`d0-${i}`}
              item={item}
              depth={0}
              index={i}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
};
