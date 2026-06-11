import { Vault, TFile } from 'obsidian';

/**
 * 确保文件 frontmatter 中有 id 字段
 * @param vault Obsidian Vault 实例
 * @param file 目标文件
 * @param existingId 已有的 id（可能为 null）
 * @returns 最终使用的 id
 */
export async function ensureFrontmatterId(
  vault: Vault,
  file: TFile,
  existingId: string | null,
): Promise<string> {
  if (existingId) return existingId;

  const newId = crypto.randomUUID();
  await vault.process(file, (content) => {
    if (content.startsWith('---')) {
      // 在 frontmatter 开头插入 id
      return content.replace(/^---\n/, `---\nid: ${newId}\n`);
    } else {
      // 没有 frontmatter，创建一个
      return `---\nid: ${newId}\n---\n\n${content}`;
    }
  });
  return newId;
}
