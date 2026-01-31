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
function normalizeVolcengineOptions(_value: unknown): undefined {
  return undefined;
}

/** Normalize Qwen image provider options. */
function normalizeQwenOptions(value: unknown): {
  negative_prompt?: string;
  prompt_extend?: boolean;
  watermark?: boolean;
  enable_interleave?: boolean;
  stream?: boolean;
  max_images?: number;
} | undefined {
  if (!isRecord(value)) return undefined;
  const negativePrompt =
    typeof value.negative_prompt === "string" ? value.negative_prompt.trim() : "";
  const promptExtend =
    typeof value.prompt_extend === "boolean"
      ? value.prompt_extend
      : typeof value.promptExtend === "boolean"
        ? value.promptExtend
        : undefined;
  const watermark =
    typeof value.watermark === "boolean" ? value.watermark : undefined;
  const enableInterleave =
    typeof value.enable_interleave === "boolean"
      ? value.enable_interleave
      : typeof value.enableInterleave === "boolean"
        ? value.enableInterleave
        : undefined;
  const stream =
    typeof value.stream === "boolean" ? value.stream : undefined;
  const maxImages =
    typeof value.max_images === "number"
      ? value.max_images
      : typeof value.maxImages === "number"
        ? value.maxImages
        : undefined;
  if (
    !negativePrompt &&
    promptExtend === undefined &&
    watermark === undefined &&
    enableInterleave === undefined &&
    stream === undefined &&
    maxImages === undefined
  ) {
    return undefined;
  }
  return {
    ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
    ...(promptExtend !== undefined ? { prompt_extend: promptExtend } : {}),
    ...(watermark !== undefined ? { watermark } : {}),
    ...(enableInterleave !== undefined ? { enable_interleave: enableInterleave } : {}),
    ...(stream !== undefined ? { stream } : {}),
    ...(maxImages !== undefined && Number.isFinite(maxImages)
      ? { max_images: maxImages }
      : {}),
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
  const providerOptionsRaw = isRecord(rawOptions.providerOptions)
    ? rawOptions.providerOptions
    : undefined;
  const openaiOptions = normalizeOpenAiOptions(providerOptionsRaw?.openai);
  const volcengineOptions = normalizeVolcengineOptions(providerOptionsRaw?.volcengine);
  const qwenOptions = normalizeQwenOptions(providerOptionsRaw?.qwen);
  const providerOptions =
    openaiOptions || volcengineOptions || qwenOptions
      ? {
          ...(openaiOptions ? { openai: openaiOptions } : {}),
          ...(volcengineOptions ? { volcengine: volcengineOptions } : {}),
          ...(qwenOptions ? { qwen: qwenOptions } : {}),
        }
      : undefined;

  if (count === undefined && !size && !aspectRatio && !providerOptions) {
    return undefined;
  }

  return {
    ...(count !== undefined ? { n: count } : {}),
    ...(size ? { size } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(providerOptions ? { providerOptions } : {}),
  };
}
