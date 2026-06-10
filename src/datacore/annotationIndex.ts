import { type Annotation } from '../types/annotations';
import { DatacoreAdapter } from './adapter';

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
 * 2. 提供按文件、按 URI、按 ID 的快速查询
 * 3. 通过 DatacoreAdapter 读取前置元字段，利用 Datacore 的 Link 类型解析
 *    （但不写入任何额外元数据）
 */
export class AnnotationIndexService {
  /** 内存索引：sourcePath → 标注摘要列表 */
  private index = new Map<string, AnnotationIndexEntry[]>();

  /** 当前活动文件路径 */
  private currentSourcePath: string | null = null;

  constructor(private adapter: DatacoreAdapter) {}

  // ── 公开查询 API ──

  /** Datacore 是否就绪 */
  get hasDatacore(): boolean {
    return this.adapter.isReady;
  }

  /** 获取指定文件的标注摘要列表 */
  getEntries(sourcePath: string): AnnotationIndexEntry[] {
    return this.index.get(sourcePath) ?? [];
  }

  /** 获取当前活动文件的标注摘要 */
  getCurrentEntries(): AnnotationIndexEntry[] {
    return this.currentSourcePath ? this.getEntries(this.currentSourcePath) : [];
  }

  /** 获取某一本书（URI）下所有标注摘要，按源文件分组 */
  findAnnotationsForUri(uri: string): Map<string, AnnotationIndexEntry[]> {
    const result = new Map<string, AnnotationIndexEntry[]>();
    for (const [path, entries] of this.index) {
      const matched = entries.filter((e) => e.uri === uri);
      if (matched.length > 0) result.set(path, matched);
    }
    return result;
  }

  /** 查询单条标注索引（ID 全局唯一） */
  findEntryById(id: string): AnnotationIndexEntry | undefined {
    for (const entries of this.index.values()) {
      const found = entries.find((e) => e.id === id);
      if (found) return found;
    }
    return undefined;
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
    this.currentSourcePath = sourcePath;
  }

  /** 增量更新单条 */
  upsertEntry(sourcePath: string, annotation: Annotation): void {
    const existing = this.index.get(sourcePath) ?? [];
    const idx = existing.findIndex((e) => e.id === annotation.id);
    const entry = this.toEntry(annotation);

    if (idx >= 0) {
      existing[idx] = entry;
    } else {
      existing.push(entry);
    }

    this.index.set(sourcePath, existing);
  }

  /** 删除单条 */
  removeEntry(sourcePath: string, annotationId: string): void {
    const existing = this.index.get(sourcePath) ?? [];
    const filtered = existing.filter((e) => e.id !== annotationId);
    this.index.set(sourcePath, filtered);
  }

  /** 清除单个文件的索引 */
  clear(sourcePath: string): void {
    this.index.delete(sourcePath);
    if (this.currentSourcePath === sourcePath) {
      this.currentSourcePath = null;
    }
  }

  /** 全量清除 */
  clearAll(): void {
    this.index.clear();
    this.currentSourcePath = null;
  }

  // ── 统计 API ──

  /** 指定文件的标记总数 */
  countForPath(sourcePath: string): number {
    return this.getEntries(sourcePath).length;
  }

  /** 指定文件的含笔记标记数 */
  countWithNotesForPath(sourcePath: string): number {
    return this.getEntries(sourcePath).filter((e) => e.hasNote).length;
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
