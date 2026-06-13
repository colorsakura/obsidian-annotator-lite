import React from 'react';
import FoliateViewer from '../viewers/FoliateViewer';
import { isReaderTargetType } from '../services/TargetResolver';
import type { HighlightColor, ReaderFlowMode, ColumnMode } from '../constants';

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
  if (!targetFile) {
    return (
      <div className="reader-placeholder">
        No file selected. Open a note with <code>annotation-target</code> in its frontmatter.
      </div>
    );
  }

  const extension = targetFile.split('.').pop()?.toLowerCase();
  if (!extension || !isReaderTargetType(extension)) {
    return <div className="reader-placeholder">Unsupported file type: {extension}</div>;
  }

  if (!sourcePath) {
    return <div className="reader-placeholder">Missing source path.</div>;
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
