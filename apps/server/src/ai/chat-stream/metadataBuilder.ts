import type { TokenUsage } from "@teatime-ai/api/types/message";

/** Build usage metadata from stream part. */
export function buildTokenUsageMetadata(
  part: unknown,
): { totalUsage: TokenUsage } | undefined {
  if (!part || typeof part !== "object") return;
  const totalUsage = (part as any).totalUsage;
  if (!totalUsage || typeof totalUsage !== "object") return;

  const toNumberOrUndefined = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

  const usage: TokenUsage = {
    inputTokens: toNumberOrUndefined((totalUsage as any).inputTokens),
    outputTokens: toNumberOrUndefined((totalUsage as any).outputTokens),
    totalTokens: toNumberOrUndefined((totalUsage as any).totalTokens),
    reasoningTokens: toNumberOrUndefined((totalUsage as any).reasoningTokens),
    cachedInputTokens: toNumberOrUndefined((totalUsage as any).cachedInputTokens),
  };

  if (Object.values(usage).every((value) => value === undefined)) return;
  return { totalUsage: usage };
}

/** Build timing metadata for assistant messages. */
export function buildTimingMetadata(input: {
  /** Started time. */
  startedAt: Date;
  /** Finished time. */
  finishedAt: Date;
}): Record<string, unknown> {
  const elapsedMs = Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime());
  return {
    teatime: {
      assistantStartedAt: input.startedAt.toISOString(),
      assistantFinishedAt: input.finishedAt.toISOString(),
      assistantElapsedMs: elapsedMs,
    },
  };
}

/** Merge abort info into metadata. */
export function mergeAbortMetadata(
  metadata: unknown,
  input: { isAborted: boolean; finishReason?: string },
): Record<string, unknown> | undefined {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

  const base = isRecord(metadata) ? { ...metadata } : {};
  if (!input.isAborted) return Object.keys(base).length ? base : undefined;

  // 被中止的流也需要落库，避免 UI 无法识别状态。
  const existingTeatime = isRecord(base.teatime) ? base.teatime : {};
  base.teatime = {
    ...existingTeatime,
    isAborted: true,
    abortedAt: new Date().toISOString(),
    ...(input.finishReason ? { finishReason: input.finishReason } : {}),
  };

  return base;
}
