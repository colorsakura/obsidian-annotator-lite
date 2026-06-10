import { App, TFile } from 'obsidian';
import { type DatacoreApi, Link } from '@blacksmithgu/datacore';

/**
 * Datacore 适配器
 *
 * 职责：
 * 1. 安全获取 Datacore API 实例
 * 2. 统一前置元字段读取（Datacore 优先 → metadataCache 回退）
 * 3. 利用 Datacore 的 Link 类型解析 Obsidian 链接
 * 4. 利用 Datacore 倒排索引加速批量查询
 *
 * 注意：此适配器只读取数据，不向文件写入任何内容。
 */
export class DatacoreAdapter {
  private api: DatacoreApi | undefined;
  private ready = false;

  constructor(private app: App) {}

  /** 在 onLayoutReady 后调用，安全获取 Datacore 引用 */
  tryInitialize(): boolean {
    this.api = (this.app as any).plugins?.plugins?.datacore?.api as DatacoreApi | undefined;

    this.ready = !!this.api;

    if (this.ready) {
      console.log('[Annotator Lite] Datacore 索引层已激活');
    } else {
      console.log('[Annotator Lite] Datacore 未启用，使用原生 metadataCache 回退');
    }

    return this.ready;
  }

  /** Datacore 是否可用 */
  get isReady(): boolean {
    return this.ready && !!this.api;
  }

  /** 获取原始的 DatacoreApi 实例（供高级场景使用） */
  getRawApi(): DatacoreApi | undefined {
    return this.api;
  }

  /**
   * 读取前置元字段值
   *
   * 路径：
   * 1. Datacore page() → $frontmatter[key] — 结构化解析后的值
   * 2. 判断是否 Link 类型 → 返回 link.path
   * 3. 回退到 metadataCache.getFileCache()?.frontmatter
   */
  getFrontmatter(file: TFile, key: string): any | null {
    if (!file) return null;

    // ── Datacore 路径 ──
    if (this.isReady && this.api) {
      const page = this.api.page(file.path);
      const entry = page?.$frontmatter?.[key.toLowerCase()];
      if (entry !== undefined) {
        return this.resolveFmValue(entry, file.path);
      }
    }

    // ── 回退路径 ──
    const cache = this.app.metadataCache.getFileCache(file);
    return cache?.frontmatter?.[key] ?? null;
  }
  // ── 私有方法 ──

  /**
   * 将 Datacore FrontmatterEntry 解析为可用值
   *
   * FrontmatterEntry 结构：
   *   { key: string, value: Literal, raw: string }
   *
   * value 可能是：
   *   - Link 对象（Obsidian 链接被 Datacore 解析为 Link 类型）
   *   - 普通 string / number / boolean
   *   - 数组（YAML 列表）
   */
  private resolveFmValue(entry: { key: string; value: any; raw: string }, sourcePath: string): any {
    const { value, raw } = entry;

    // Link 类型：Datacore 已解析好，直接取 path，再通过 Obsidian 解析为绝对路径
    if (value instanceof Link) {
      const resolved = this.app.metadataCache.getFirstLinkpathDest(value.path, sourcePath);
      return resolved?.path ?? value.path;
    }

    // 外部 Markdown 链接：`[text](url)` 格式保留在 raw 中
    if (typeof raw === 'string') {
      const externalMatch = /^\[.*\]\((.*)\)$/gm.exec(raw)?.[1];
      if (externalMatch) return externalMatch;
    }

    // 数组类型
    if (Array.isArray(value)) return value;

    // 普通类型：直接返回值，raw 作为回退
    return value ?? raw;
  }
}
