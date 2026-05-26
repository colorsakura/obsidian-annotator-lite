import { App, normalizePath, TFile } from 'obsidian';
import { ANNOTATION_TARGET_PROPERTY } from '../constants';
import type { ReaderTarget, ReaderTargetType } from './ReaderSessionStore';

export const SUPPORTED_READER_TYPES = [
  'pdf',
  'epub',
  'mobi',
  'azw3',
  'fb2',
  'fbz',
  'cbz',
] as const satisfies readonly ReaderTargetType[];

export const ANNOTATABLE_READER_TYPES = [
  'pdf',
  'epub',
] as const satisfies readonly ReaderTargetType[];

export type ResolvedReaderTarget = Omit<ReaderTarget, 'type'> & {
  type: ReaderTargetType | null;
};

export interface TargetResolver {
  resolve(sourceFile: TFile): ResolvedReaderTarget | null;
}

export class ObsidianTargetResolver implements TargetResolver {
  constructor(
    private app: App,
    private getPropertyValue: (propertyName: string, file: TFile) => unknown,
  ) {}

  resolve(sourceFile: TFile): ResolvedReaderTarget | null {
    const rawTarget = this.getPropertyValue(ANNOTATION_TARGET_PROPERTY, sourceFile);
    const target = this.getTargetString(rawTarget);
    if (!target) return null;

    const targetPath = this.resolveTargetPath(target, sourceFile.path);
    if (!targetPath) return null;

    return {
      sourcePath: sourceFile.path,
      targetPath,
      targetUri: `urn:${targetPath}`,
      type: getReaderTargetType(targetPath),
    };
  }

  private getTargetString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const target = value.trim();
    return target.length > 0 ? target : null;
  }

  private resolveTargetPath(target: string, sourcePath: string): string | null {
    if (target.includes('/')) {
      const targetPath = normalizePath(target);
      if (this.app.vault.getAbstractFileByPath(targetPath)) {
        return targetPath;
      }
    }

    const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf('/') + 1);
    const sameDirPath = normalizePath(sourceDir + target);
    if (this.app.vault.getAbstractFileByPath(sameDirPath)) {
      return sameDirPath;
    }

    const match = this.app.vault.getFiles().find((file) => file.name === target);
    return match?.path ?? null;
  }
}

export function getReaderTargetType(targetPath: string): ReaderTargetType | null {
  const extension = targetPath.split('.').pop()?.toLowerCase();
  if (!extension) return null;
  return isReaderTargetType(extension) ? extension : null;
}

export function isReaderTargetType(extension: string): extension is ReaderTargetType {
  return SUPPORTED_READER_TYPES.some((type) => type === extension);
}
