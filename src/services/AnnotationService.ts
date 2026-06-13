import { App, TFile } from 'obsidian';
import type { Annotation } from '../types/annotations';
import type { AnnotationIndexService } from '../datacore';
import type { AnnotationRepository } from './AnnotationRepository';
import type { QueryClient } from '@tanstack/react-query';
import { annotationKeys } from '../hooks/useAnnotations';
import { createLogger } from '../utils/logger';

const log = createLogger('AnnotationService');

/**
 * 标注持久化服务。
 *
 * 职责：
 * - 从 Markdown 文件加载标注
 * - 保存标注到 Markdown 文件
 * - 更新/删除单条标注
 * - 防重入保护（persistInProgress）
 * - 同步更新 QueryClient 缓存和 AnnotationIndex
 *
 * 注：不再依赖 ReaderSessionStore，改用 QueryClient 缓存管理标注状态。
 */
export class AnnotationService {
  private persistInProgress = false;

  constructor(
    private app: App,
    private repository: AnnotationRepository,
    private annotationIndex: AnnotationIndexService,
    private queryClient: QueryClient,
  ) {}

  /**
   * 从 Markdown 文件加载标注数据。
   */
  async load(sourceFile: TFile, targetUri: string | null): Promise<Annotation[]> {
    return this.repository.load(sourceFile, targetUri);
  }

  /**
   * 更新指定标注。
   */
  async update(id: string, updates: Partial<Annotation>, sourcePath: string): Promise<void> {
    const currentAnnotations = this.queryClient.getQueryData<Annotation[]>(
      annotationKeys.byFile(sourcePath),
    );
    if (!currentAnnotations) return;

    const idx = currentAnnotations.findIndex((a) => a.id === id);
    if (idx === -1) return;

    const updated = {
      ...currentAnnotations[idx],
      ...updates,
      updated: new Date().toISOString(),
    };
    const newAnnotations = [...currentAnnotations];
    newAnnotations[idx] = updated;

    await this.persist(newAnnotations, sourcePath);
  }

  /**
   * 删除指定标注。
   */
  async delete(id: string, sourcePath: string): Promise<void> {
    const currentAnnotations = this.queryClient.getQueryData<Annotation[]>(
      annotationKeys.byFile(sourcePath),
    );
    if (!currentAnnotations) return;

    const newAnnotations = currentAnnotations.filter((a) => a.id !== id);
    await this.persist(newAnnotations, sourcePath);
  }

  /**
   * 批量更新标注（由 mutation hook 调用）。
   */
  async batchUpdate(annotations: Annotation[], sourcePath: string): Promise<void> {
    await this.persist(annotations, sourcePath);
  }

  /**
   * 持久化标注到 Markdown 文件。
   * 同步更新 QueryClient 缓存和 AnnotationIndex。
   */
  private async persist(annotations: Annotation[], sourcePath: string | null): Promise<void> {
    if (!sourcePath) {
      // 无 sourcePath 时仅更新缓存
      return;
    }

    this.persistInProgress = true;

    try {
      const file = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!(file instanceof TFile)) {
        // 文件不存在，仅更新缓存
        this.queryClient.setQueryData(annotationKeys.byFile(sourcePath), annotations);
        return;
      }

      log.debug('persisting', annotations.length, 'annotations to', sourcePath);
      await this.repository.save(file, annotations);
      log.debug('persist complete');
      // 持久化成功后更新缓存（确保一致性）
      this.queryClient.setQueryData(annotationKeys.byFile(sourcePath), annotations);
      this.annotationIndex.rebuildIndex(sourcePath, annotations);
    } catch (e) {
      log.error('Failed to persist annotations:', e);
    } finally {
      this.persistInProgress = false;
    }
  }
}
