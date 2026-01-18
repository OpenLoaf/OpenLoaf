"use client";

/**
 * 判断消息是否有“可见内容”（文本/工具卡片等）。
 * - 用于控制：MessageActions 是否显示、Thinking 是否显示等 UI 逻辑
 */
export function messageHasVisibleContent(
  message: { parts?: unknown[]; metadata?: unknown } | undefined,
): boolean {
  const parts = Array.isArray(message?.parts) ? message!.parts! : [];

  const hasText = parts.some((part: any) => {
    return (
      part?.type === "text" &&
      typeof part?.text === "string" &&
      part.text.trim().length > 0
    );
  });
  if (hasText) return true;

  const hasRevisedPrompt = parts.some((part: any) => {
    return (
      part?.type === "data-revised-prompt" &&
      typeof part?.data?.text === "string" &&
      part.data.text.trim().length > 0
    );
  });
  if (hasRevisedPrompt) return true;

  const hasFile = parts.some((part: any) => {
    return part?.type === "file" && typeof part?.url === "string";
  });
  if (hasFile) return true;

  if (hasPlanMetadata(message)) return true;

  return parts.some((part: any) => {
    return (
      typeof part?.type === "string" &&
      (part.type === "dynamic-tool" || part.type.startsWith("tool-"))
    );
  });
}

/** Check whether message metadata carries a non-empty plan update. */
function hasPlanMetadata(message: { metadata?: unknown } | undefined): boolean {
  const metadata = message?.metadata;
  if (!metadata || typeof metadata !== "object") return false;
  const planUpdate = (metadata as Record<string, unknown>)?.plan;
  if (!planUpdate || typeof planUpdate !== "object") return false;
  const planItems = (planUpdate as Record<string, unknown>)?.plan;
  if (!Array.isArray(planItems)) return false;

  return planItems.some((item) => {
    if (!item || typeof item !== "object") return false;
    const step = typeof (item as any).step === "string" ? (item as any).step.trim() : "";
    return Boolean(step);
  });
}
