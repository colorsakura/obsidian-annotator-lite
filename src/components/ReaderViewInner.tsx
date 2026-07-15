import React from 'react';
import FoliateViewer from '../viewers/FoliateViewer';
import { isReaderTargetType } from '../services/TargetResolver';
import type { HighlightColor, ReaderFlowMode, ColumnMode } from '../constants';
import { useT } from '../i18n';

export interface ReaderViewInnerProps {
  targetFile: string | null;
  sourcePath: string | null;
  readerFlowMode: ReaderFlowMode;
  columnMode: ColumnMode;
  fontSize: number;
  highlightColors?: HighlightColor[];
}

/**
 * ReaderView 的 React 内层组件。
 *
 * 职责：
 * - 验证 targetFile 是否存在且支持
 * - 渲染错误/占位状态
 * - 将 props 透传给 FoliateViewer
 *
 * 所有阅读器逻辑（导航、标注、事件）由 FoliateViewer 内部管理。
 */
const ReaderViewInner: React.FC<ReaderViewInnerProps> = ({
  targetFile,
  sourcePath,
  readerFlowMode,
  columnMode,
  fontSize,
  highlightColors,
}) => {
  const t = useT();

  if (!targetFile) {
    return <div className="reader-placeholder">{t('reader.noFile')}</div>;
  }

  const extension = targetFile.split('.').pop()?.toLowerCase();
  if (!extension || !isReaderTargetType(extension)) {
    return (
      <div className="reader-placeholder">
        {t('reader.unsupportedType')}: {extension}
      </div>
    );
  }

  if (!sourcePath) {
    return <div className="reader-placeholder">{t('reader.missingSource')}</div>;
  }

  return (
    <FoliateViewer
      key={targetFile}
      file={targetFile}
      sourcePath={sourcePath}
      flowMode={readerFlowMode}
      columnMode={columnMode}
      fontSize={fontSize}
      highlightColors={highlightColors}
    />
  );
};

export default ReaderViewInner;
