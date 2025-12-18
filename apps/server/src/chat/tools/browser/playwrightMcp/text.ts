/**
 * 安全地估算 JSON 序列化后的字符长度（用于提前截断超大返回）。
 */
export function safeJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return -1;
  }
}

/**
 * 对长文本做截断，避免 tool 输出过长写入对话历史。
 */
export function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + `…[truncated ${value.length - maxChars} chars]`;
}

