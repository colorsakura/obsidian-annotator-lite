import { type Annotation } from '../types/annotations';

/**
 * 标注索引条目（轻量摘要）
 *
 * 仅存在于内存中，不写入文件的前置元。
 */
export interface AnnotationIndexEntry {
  id: string;
  uri: string;
  cfiRange?: string;
  type?: 'pdf' | 'epub';
  text: string; // 高亮文本摘要（≤ 80 字符）
  hasNote: boolean;
  created: string;
  updated: string;
}

/**
 * 标注索引服务（纯内存）
 *
 * 职责：
 * 1. 维护内存中的 sourcePath → AnnotationIndexEntry[] 映射
 * 2. 提供按文件的快速查询
 */
export class AnnotationIndexService {
  /** 内存索引：sourcePath → 标注摘要列表 */
  private index = new Map<string, AnnotationIndexEntry[]>();

  // ── 公开查询 API ──

  /** 获取指定文件的标注摘要列表 */
  getEntries(sourcePath: string): AnnotationIndexEntry[] {
    return this.index.get(sourcePath) ?? [];
  }

  // ── 索引写入 API ──

  /**
   * 全量重建指定文件的索引
   *
   * 调用时机：persistAnnotations 后
   */
  rebuildIndex(sourcePath: string, annotations: Annotation[]): void {
    const entries = annotations.map((a) => this.toEntry(a));
    this.index.set(sourcePath, entries);
  }

  // ── 私有方法 ──

  private toEntry(a: Annotation): AnnotationIndexEntry {
    const exact = a.target?.[0]?.selector?.find((s) => s.type === 'TextQuoteSelector')?.exact ?? '';

    return {
      id: a.id,
      uri: a.uri,
      cfiRange: a.cfiRange,
      type: a.type,
      text: exact.substring(0, 80),
      hasNote: a.text.trim().length > 0,
      created: a.created,
      updated: a.updated,
    };
  }
}
