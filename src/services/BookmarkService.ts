import type { AnnotatorLiteSettings } from './Settings';
import type { Bookmark } from '../types/annotations';

/**
 * 书签持久化服务
 * 负责读写 data.json 中的书签数据，按 frontmatter id 索引
 */
export class BookmarkService {
  constructor(
    private loadData: () => Promise<AnnotatorLiteSettings>,
    private saveData: (data: AnnotatorLiteSettings) => Promise<void>,
  ) {}

  /**
   * 获取指定书籍的所有书签
   */
  async getBookmarks(bookId: string): Promise<Bookmark[]> {
    const settings = await this.loadData();
    return settings.bookmarks?.[bookId] ?? [];
  }

  /**
   * 添加书签到指定书籍
   */
  async addBookmark(bookId: string, bookmark: Bookmark): Promise<void> {
    const settings = await this.loadData();
    if (!settings.bookmarks) settings.bookmarks = {};
    if (!settings.bookmarks[bookId]) settings.bookmarks[bookId] = [];
    // 幂等：如果已存在相同 id 的书签则跳过
    const exists = settings.bookmarks[bookId].some((b) => b.id === bookmark.id);
    if (!exists) {
      settings.bookmarks[bookId] = [...settings.bookmarks[bookId], bookmark];
      await this.saveData(settings);
    }
  }

  /**
   * 删除指定书籍的书签
   */
  async deleteBookmark(bookId: string, bookmarkId: string): Promise<void> {
    const settings = await this.loadData();
    if (!settings.bookmarks?.[bookId]) return;
    settings.bookmarks[bookId] = settings.bookmarks[bookId].filter((b) => b.id !== bookmarkId);
    await this.saveData(settings);
  }

  /**
   * 更新指定书籍的书签
   */
  async updateBookmark(
    bookId: string,
    bookmarkId: string,
    updates: Partial<Bookmark>,
  ): Promise<void> {
    const settings = await this.loadData();
    if (!settings.bookmarks?.[bookId]) return;
    settings.bookmarks[bookId] = settings.bookmarks[bookId].map((b) =>
      b.id === bookmarkId ? { ...b, ...updates } : b,
    );
    await this.saveData(settings);
  }
}
