import { describe, it, expect, vi } from 'vitest';
import { loadBookMetadata } from '../foliateBookMetadata';
import type { LoadedBookInfo } from '../foliateBookMetadata';

describe('foliateBookMetadata', () => {
  function createMockBook(overrides: Record<string, any> = {}) {
    return {
      sections: [],
      toc: [],
      metadata: {},
      getCover: vi.fn().mockResolvedValue(null),
      ...overrides,
    };
  }

  it('returns empty data when book has no sections or toc', async () => {
    const book = createMockBook();
    const result = await loadBookMetadata(book, null);

    expect(result.info.outline).toEqual([]);
    expect(result.info.totalSections).toBe(0);
    expect(result.info.metadata.title).toBeNull();
    expect(result.info.metadata.author).toBeNull();
    expect(result.coverUrl).toBeNull();
  });

  it('converts TOC items to OutlineItem format', async () => {
    const book = createMockBook({
      toc: [
        { label: 'Chapter 1', href: '#ch1' },
        {
          label: 'Chapter 2',
          href: '#ch2',
          subitems: [{ label: 'Section 2.1', href: '#s2.1' }],
        },
      ],
      sections: [{}, {}],
    });

    const result = await loadBookMetadata(book, null);

    expect(result.info.outline).toHaveLength(2);
    expect(result.info.outline[0]).toEqual({
      title: 'Chapter 1',
      href: '#ch1',
      children: [],
    });
    expect(result.info.outline[1].children).toHaveLength(1);
    expect(result.info.outline[1].children[0].title).toBe('Section 2.1');
    expect(result.info.totalSections).toBe(2);
  });

  it('filters TOC items without label', async () => {
    const book = createMockBook({
      toc: [
        { label: 'Valid', href: '#v' },
        { href: '#n' }, // no label
        null,
        { label: '', href: '#e' }, // empty label
      ],
    });

    const result = await loadBookMetadata(book, null);

    // Only items with truthy labels should be included
    expect(result.info.outline).toHaveLength(1);
    expect(result.info.outline[0].title).toBe('Valid');
  });

  it('extracts string metadata title and author', async () => {
    const book = createMockBook({
      metadata: {
        title: 'Test Book',
        author: 'Test Author',
      },
    });

    const result = await loadBookMetadata(book, null);

    expect(result.info.metadata.title).toBe('Test Book');
    expect(result.info.metadata.author).toBe('Test Author');
  });

  it('extracts array author metadata', async () => {
    const book = createMockBook({
      metadata: {
        author: [{ name: 'Author One' }, { name: 'Author Two' }],
      },
    });

    const result = await loadBookMetadata(book, null);

    // Should take the first author
    expect(result.info.metadata.author).toBe('Author One');
  });

  it('extracts object author metadata', async () => {
    const book = createMockBook({
      metadata: {
        author: { name: 'Single Author' },
      },
    });

    const result = await loadBookMetadata(book, null);

    expect(result.info.metadata.author).toBe('Single Author');
  });

  it('handles cover image', async () => {
    const coverBlob = new Blob(['test'], { type: 'image/png' });
    const book = createMockBook({
      getCover: vi.fn().mockResolvedValue(coverBlob),
    });

    const result = await loadBookMetadata(book, null);

    expect(result.coverUrl).toBeTruthy();
    expect(result.coverUrl).toContain('blob:');

    // Cleanup
    if (result.coverUrl) URL.revokeObjectURL(result.coverUrl);
  });

  it('revokes existing cover URL when provided', async () => {
    const oldUrl = URL.createObjectURL(new Blob([]));
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    const book = createMockBook();
    await loadBookMetadata(book, oldUrl);

    expect(revokeSpy).toHaveBeenCalledWith(oldUrl);

    revokeSpy.mockRestore();
    URL.revokeObjectURL(oldUrl);
  });
});
