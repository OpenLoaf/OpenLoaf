"use client";

/**
 * 从 UIMessage.parts 中提取纯文本（用于复制/编辑框）。
 * - 只拼接 text part，避免把 tool/result 等结构化内容复制进去
 */
export function getMessagePlainText(message: { parts?: unknown[] } | undefined): string {
  const parts = Array.isArray(message?.parts) ? (message!.parts as any[]) : [];
  return parts
    .filter((part) => part?.type === "text" && typeof part?.text === "string")
    .map((part) => String(part.text))
    .join("\n")
    .trim();
}

