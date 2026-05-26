import { TFile, Vault } from 'obsidian';
import type { Annotation } from '../types/annotations';
import {
  generateMarkdownWithAnnotations,
  parseAnnotationsFromMarkdown,
} from '../utils/markdownStorage';

export interface AnnotationRepository {
  load(sourceFile: TFile, targetUri?: string | null): Promise<Annotation[]>;
  save(sourceFile: TFile, annotations: Annotation[]): Promise<void>;
}

export class MarkdownAnnotationRepository implements AnnotationRepository {
  constructor(private vault: Vault) {}

  async load(sourceFile: TFile, targetUri?: string | null): Promise<Annotation[]> {
    const content = await this.vault.read(sourceFile);
    return parseAnnotationsFromMarkdown(content, targetUri);
  }

  async save(sourceFile: TFile, annotations: Annotation[]): Promise<void> {
    await this.vault.process(sourceFile, (content) =>
      generateMarkdownWithAnnotations(content, annotations),
    );
  }
}
