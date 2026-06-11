import { App, TFile } from 'obsidian';
import type { Annotation } from '../types/annotations';
import type { AnnotationIndexService } from '../datacore';
import type { AnnotationRepository } from './AnnotationRepository';
import type { ReaderSessionStore } from './ReaderSessionStore';

/**
 * 标注持久化服务。
 *
 * 从 ReaderController 中抽取，负责：
 * - 从 Markdown 文件加载标注
 * - 保存标注到 Markdown 文件
 * - 更新/删除单条标注
 * - 防重入保护（persistInProgress）
 * - 同步更新 SessionStore 和 AnnotationIndex
 */
export class AnnotationService {
  private persistInProgress = false;

  constructor(
    private app: App,
    private repository: AnnotationRepository,
    private annotationIndex: AnnotationIndexService,
    private sessionStore: ReaderSessionStore,
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
    const state = this.sessionStore.getSnapshot();
    if (!state) return;

    const idx = state.annotations.findIndex((a) => a.id === id);
    if (idx === -1) return;

    const updated = {
      ...state.annotations[idx],
      ...updates,
      updated: new Date().toISOString(),
    };
    const newAnnotations = [...state.annotations];
    newAnnotations[idx] = updated;

    await this.persist(newAnnotations, sourcePath);
  }

  /**
   * 删除指定标注。
   */
  async delete(id: string, sourcePath: string): Promise<void> {
    const state = this.sessionStore.getSnapshot();
    if (!state) return;

    const newAnnotations = state.annotations.filter((a) => a.id !== id);
    await this.persist(newAnnotations, sourcePath);
  }

  /**
   * 处理来自 FoliateViewer 的标注变更（用户在阅读器中添加/删除标注）。
   * 包含变更检测和防重入保护。
   */
  handleUserAnnotationsChanged(changedAnnotations: Annotation[], sourcePath: string | null): void {
    if (this.persistInProgress) return;

    const state = this.sessionStore.getSnapshot();
    if (!state) return;

    const oldAnnotations = state.annotations;
    const hasChanged =
      changedAnnotations.length !== oldAnnotations.length ||
      changedAnnotations.some(
        (a, i) => a.id !== oldAnnotations[i]?.id || a.text !== oldAnnotations[i]?.text,
      );

    if (!hasChanged) return;

    this.sessionStore.setAnnotations(changedAnnotations);
    void this.persist(changedAnnotations, sourcePath);
  }

  /**
   * 持久化标注到 Markdown 文件。
   * 同步更新 SessionStore、AnnotationIndex，并通知 ReaderView。
   */
  private async persist(annotations: Annotation[], sourcePath: string | null): Promise<void> {
    if (!sourcePath) {
      this.sessionStore.setAnnotations(annotations);
      return;
    }

    this.persistInProgress = true;

    try {
      const file = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!(file instanceof TFile)) {
        this.sessionStore.setAnnotations(annotations);
        return;
      }

      await this.repository.save(file, annotations);
      this.sessionStore.setAnnotations(annotations);
      this.annotationIndex.rebuildIndex(sourcePath, annotations);
    } catch (e) {
      console.error('Failed to persist annotations:', e);
    } finally {
      this.persistInProgress = false;
    }
  }
}
