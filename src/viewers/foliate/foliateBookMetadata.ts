import type { BookMetadata, OutlineItem } from '../../types/annotations';

export interface LoadedBookInfo {
  outline: OutlineItem[];
  metadata: BookMetadata;
  totalSections: number;
}

/**
 * Convert foliate-js TOC items to our OutlineItem type.
 */
export function convertFoliateToc(items: any[] | undefined): OutlineItem[] {
  if (!items) return [];
  return items
    .filter((item: any) => item && item.label)
    .map((item: any) => ({
      title: item.label,
      href: item.href,
      children: convertFoliateToc(item.subitems),
    }));
}

/**
 * Extract a plain string from a foliate-js metadata value.
 * Values can be a plain string, a LanguageMap object, or null.
 */
export function extractMetadataString(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && !Array.isArray(v))
    return (Object.values(v as Record<string, unknown>)[0] as string) ?? null;
  return null;
}

/**
 * Load book metadata (cover, title, author) from a foliate-js book object.
 * Returns the cover object URL (created via URL.createObjectURL) so the caller
 * can revoke it later.
 */
export async function loadBookMetadata(
  book: any,
  existingCoverUrl: string | null,
): Promise<{ info: LoadedBookInfo; coverUrl: string | null }> {
  // Revoke previous cover URL if any
  if (existingCoverUrl) URL.revokeObjectURL(existingCoverUrl);

  const outlineItems = convertFoliateToc(book.toc);
  const totalSections = book.sections?.length ?? 0;

  let coverUrl: string | null = null;
  let title: string | null = null;
  let author: string | null = null;

  try {
    const coverBlob: Blob | null = (await book.getCover?.()) ?? null;
    coverUrl = coverBlob ? URL.createObjectURL(coverBlob) : null;

    const rawTitle = book.metadata?.title;
    title = extractMetadataString(rawTitle);

    const rawAuthor = book.metadata?.author;
    if (!rawAuthor) {
      author = null;
    } else if (typeof rawAuthor === 'string') {
      author = rawAuthor;
    } else if (Array.isArray(rawAuthor)) {
      author = extractMetadataString((rawAuthor[0] as any)?.name);
    } else {
      author = extractMetadataString((rawAuthor as any).name);
    }
  } catch {
    // Metadata extraction is best-effort
  }

  return {
    coverUrl,
    info: {
      outline: outlineItems,
      metadata: { coverUrl, title, author },
      totalSections,
    },
  };
}
