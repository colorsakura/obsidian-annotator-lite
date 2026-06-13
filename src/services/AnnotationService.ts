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
 * - 从 Markdown 文件加载标注（load）
 * - 将完整标注列表持久化到 Markdown 文件（persist）
 * - 防重入保护（persistInProgress）
 * - 同步更新 QueryClient 缓存和 AnnotationIndex
 *
 * 注意：CRUD 逻辑（组装标注列表）由调用方负责，
 * 本模块只负责将列表写入文件并确认缓存。
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
   * 持久化标注到 Markdown 文件。
   * 同步更新 QueryClient 缓存和 AnnotationIndex。
   *
   * @param annotations - 完整的标注列表（由调用方组装）
   * @param sourcePath - 源 Markdown 文件路径
   */
  async persist(annotations: Annotation[], sourcePath: string | null): Promise<void> {
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
