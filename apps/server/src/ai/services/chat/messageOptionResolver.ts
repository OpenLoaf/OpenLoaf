import type { UIMessage } from "ai";
import type { ImageGenerateOptions } from "@tenas-ai/api/types/image";
import { normalizeCodexOptions, type CodexRequestOptions } from "@/ai/models/cli/codex/codexOptions";
import { isRecord } from "@/ai/shared/util";

/** Normalize image count into a safe integer range. */
function normalizeImageCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.floor(value);
  if (rounded < 1 || rounded > 4) return undefined;
  return rounded;
}

/** Normalize size string into a safe format. */
function normalizeSize(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+x\d+$/u.test(trimmed)) return undefined;
  return trimmed;
}

/** Normalize aspect ratio string into a safe format. */
function normalizeAspectRatio(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+:\d+$/u.test(trimmed)) return undefined;
  return trimmed;
}

/** Normalize OpenAI image provider options. */
function normalizeOpenAiOptions(value: unknown): { quality?: string; style?: string } | undefined {
  if (!isRecord(value)) return undefined;
  const quality = typeof value.quality === "string" ? value.quality.trim() : "";
  const style = typeof value.style === "string" ? value.style.trim() : "";
  if (!quality && !style) return undefined;
  return {
    ...(quality ? { quality } : {}),
    ...(style ? { style } : {}),
  };
}

/** Normalize Volcengine image provider options. */
function normalizeVolcengineOptions(
  value: unknown,
): {
  scale?: number;
  forceSingle?: boolean;
  minRatio?: number;
  maxRatio?: number;
  size?: number;
} | undefined {
  if (!isRecord(value)) return undefined;
  const scale = typeof value.scale === "number" && Number.isFinite(value.scale) ? value.scale : undefined;
  const forceSingleRaw =
    typeof value.forceSingle === "boolean"
      ? value.forceSingle
      : typeof value.force_single === "boolean"
        ? value.force_single
        : undefined;
  const minRatioRaw =
    typeof value.minRatio === "number"
      ? value.minRatio
      : typeof value.min_ratio === "number"
        ? value.min_ratio
        : undefined;
  const maxRatioRaw =
    typeof value.maxRatio === "number"
      ? value.maxRatio
      : typeof value.max_ratio === "number"
        ? value.max_ratio
        : undefined;
  const size = typeof value.size === "number" && Number.isFinite(value.size) ? value.size : undefined;
  const forceSingle =
    forceSingleRaw !== undefined ? forceSingleRaw : undefined;
  const minRatio =
    minRatioRaw !== undefined && Number.isFinite(minRatioRaw) ? minRatioRaw : undefined;
  const maxRatio =
    maxRatioRaw !== undefined && Number.isFinite(maxRatioRaw) ? maxRatioRaw : undefined;
  if (
    scale === undefined &&
    forceSingle === undefined &&
    minRatio === undefined &&
    maxRatio === undefined &&
    size === undefined
  ) {
    return undefined;
  }
  return {
    ...(scale !== undefined ? { scale } : {}),
    ...(forceSingle !== undefined ? { forceSingle } : {}),
    ...(minRatio !== undefined ? { minRatio } : {}),
    ...(maxRatio !== undefined ? { maxRatio } : {}),
    ...(size !== undefined ? { size } : {}),
  };
}

/** Find the last user message that contains text content. */
function findLastUserTextMessage(messages: UIMessage[]): UIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as any;
    if (!message || message.role !== "user") continue;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const text = parts
      .filter((part: any) => part?.type === "text" && typeof part.text === "string")
      .map((part: any) => part.text)
      .join("")
      .trim();
    if (!text) continue;
    return message as UIMessage;
  }
  return undefined;
}

/** Resolve Codex options from message metadata. */
export function resolveCodexRequestOptions(messages: UIMessage[]): CodexRequestOptions | undefined {
  const message = findLastUserTextMessage(messages) as any;
  if (!message) return undefined;
  // 仅使用与 prompt 对应的 user 消息配置，避免旧消息覆盖。
  const metadata = message.metadata;
  if (!isRecord(metadata)) return undefined;
  const rawOptions = metadata.codexOptions;
  if (!rawOptions) return undefined;
  const normalized = normalizeCodexOptions(rawOptions);
  if (!normalized) return undefined;
  return normalized;
}

/** Resolve image generation options from message metadata. */
export function resolveImageGenerateOptions(
  messages: UIMessage[],
): ImageGenerateOptions | undefined {
  const message = findLastUserTextMessage(messages) as any;
  if (!message) return undefined;
  // 仅使用与 prompt 对应的 user 消息配置，避免旧消息覆盖。
  const metadata = message.metadata;
  if (!isRecord(metadata)) return undefined;
  const rawOptions = metadata.imageOptions;
  if (!isRecord(rawOptions)) return undefined;

  // 仅信任白名单字段，避免 metadata 注入未支持参数。
  const count = normalizeImageCount(rawOptions.n);
  const size = normalizeSize(rawOptions.size);
  const aspectRatio = size ? undefined : normalizeAspectRatio(rawOptions.aspectRatio);
  const seed =
    typeof rawOptions.seed === "number" && Number.isFinite(rawOptions.seed) ? rawOptions.seed : undefined;
  const providerOptionsRaw = isRecord(rawOptions.providerOptions)
    ? rawOptions.providerOptions
    : undefined;
  const openaiOptions = normalizeOpenAiOptions(providerOptionsRaw?.openai);
  const volcengineOptions = normalizeVolcengineOptions(providerOptionsRaw?.volcengine);
  const providerOptions =
    openaiOptions || volcengineOptions
      ? {
          ...(openaiOptions ? { openai: openaiOptions } : {}),
          ...(volcengineOptions ? { volcengine: volcengineOptions } : {}),
        }
      : undefined;

  if (count === undefined && !size && !aspectRatio && seed === undefined && !providerOptions) {
    return undefined;
  }

  return {
    ...(count !== undefined ? { n: count } : {}),
    ...(size ? { size } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(providerOptions ? { providerOptions } : {}),
  };
}
