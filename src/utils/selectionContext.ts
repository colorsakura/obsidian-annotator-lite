/**
 * 从 DOM Range 提取上下文文本（前缀和后缀）。
 * 纯 DOM 工具函数，不依赖任何外部库。
 */
export function getSurroundingContext(
  range: Range,
  maxChars: number = 100,
): { prefix: string; suffix: string } {
  let prefix = '';
  let suffix = '';

  try {
    const startNode = range.startContainer;
    if (startNode.nodeType === Node.TEXT_NODE) {
      prefix = startNode.textContent?.substring(0, range.startOffset) || '';
    }

    const endNode = range.endContainer;
    if (endNode.nodeType === Node.TEXT_NODE) {
      suffix = endNode.textContent?.substring(range.endOffset) || '';
    }

    prefix = prefix.replace(/\s+/g, ' ').trim();
    suffix = suffix.replace(/\s+/g, ' ').trim();

    if (prefix.length > maxChars) {
      prefix = '...' + prefix.substring(prefix.length - maxChars);
    }
    if (suffix.length > maxChars) {
      suffix = suffix.substring(0, maxChars) + '...';
    }
  } catch {
    // DOM 遍历失败时回退到空上下文
  }

  return { prefix, suffix };
}
