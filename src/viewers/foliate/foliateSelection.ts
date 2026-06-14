/**
 * Extract surrounding context text from a DOM Range (prefix and suffix).
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
    // Fall back to empty context if DOM traversal fails
  }

  return { prefix, suffix };
}
