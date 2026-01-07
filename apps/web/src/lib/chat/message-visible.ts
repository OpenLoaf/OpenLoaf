"use client";

/**
 * 判断消息是否有“可见内容”（文本/工具卡片等）。
 * - 用于控制：MessageActions 是否显示、Thinking 是否显示等 UI 逻辑
 */
export function messageHasVisibleContent(message: { parts?: unknown[] } | undefined): boolean {
  const parts = Array.isArray(message?.parts) ? message!.parts! : [];

  const hasText = parts.some((part: any) => {
    return (
      part?.type === "text" &&
      typeof part?.text === "string" &&
      part.text.trim().length > 0
    );
  });
  if (hasText) return true;

  const hasFile = parts.some((part: any) => {
    return part?.type === "file" && typeof part?.url === "string";
  });
  if (hasFile) return true;

  return parts.some((part: any) => {
    return (
      typeof part?.type === "string" &&
      (part.type === "dynamic-tool" || part.type.startsWith("tool-"))
    );
  });
}
