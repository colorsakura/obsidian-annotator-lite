import type { AnnotatorLiteSettings, ReadingRecord } from './Settings';

/**
 * 阅读历史服务
 * 负责读写 data.json 中的阅读历史记录
 */
export class ReadingHistoryService {
  constructor(
    private loadData: () => Promise<AnnotatorLiteSettings>,
    private saveData: (data: AnnotatorLiteSettings) => Promise<void>,
  ) {}

  /**
   * 获取指定 id 的阅读记录
   */
  async getRecord(id: string): Promise<ReadingRecord | null> {
    const settings = await this.loadData();
    return settings.readingHistory?.[id] ?? null;
  }

  /**
   * 保存阅读记录
   */
  async saveRecord(id: string, record: ReadingRecord): Promise<void> {
    const settings = await this.loadData();
    if (!settings.readingHistory) settings.readingHistory = {};
    settings.readingHistory[id] = record;
    await this.saveData(settings);
  }
}
