import React from 'react';
import { useT } from '../i18n';

interface SectionIndicatorProps {
  currentIndex: number;
  totalSections: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

const SectionIndicator: React.FC<SectionIndicatorProps> = ({
  currentIndex,
  totalSections,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
}) => {
  const t = useT();
  const displayIndex = totalSections > 0 ? currentIndex + 1 : 0;

  return (
    <div className="section-indicator">
      <button
        className="section-indicator-btn section-indicator-btn-up"
        onClick={onPrev}
        disabled={!canGoPrev}
        aria-label={t('reader.section.prev')}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
      <div className="section-indicator-label">
        {displayIndex} / {totalSections}
      </div>
      <button
        className="section-indicator-btn section-indicator-btn-down"
        onClick={onNext}
        disabled={!canGoNext}
        aria-label={t('reader.section.next')}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
  );
};

export default SectionIndicator;
