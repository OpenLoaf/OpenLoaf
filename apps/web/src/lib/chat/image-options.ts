import type { ImageGenerateOptions } from "@tenas-ai/api/types/image";

/** Normalize image count into a safe integer range. */
export function normalizeImageCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.floor(value);
  if (rounded < 1 || rounded > 4) return undefined;
  return rounded;
}

/** Normalize size string into a safe format. */
export function normalizeImageSize(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+x\d+$/u.test(trimmed)) return undefined;
  return trimmed;
}

/** Normalize aspect ratio string into a safe format. */
export function normalizeAspectRatio(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+:\d+$/u.test(trimmed)) return undefined;
  return trimmed;
}

/** Normalize image generation options before sending. */
export function normalizeImageOptions(
  value?: ImageGenerateOptions
): ImageGenerateOptions | undefined {
  if (!value) return undefined;

  // 仅透传允许字段，避免把无关数据写入消息 metadata。
  const count = normalizeImageCount(value.n);
  const size = normalizeImageSize(value.size);
  const aspectRatio = size ? undefined : normalizeAspectRatio(value.aspectRatio);
  const quality =
    typeof value.providerOptions?.openai?.quality === "string"
      ? value.providerOptions.openai.quality.trim()
      : "";
  const style =
    typeof value.providerOptions?.openai?.style === "string"
      ? value.providerOptions.openai.style.trim()
      : "";
  const qwenRaw = value.providerOptions?.qwen;
  const qwenCandidate =
    typeof qwenRaw === "object" && qwenRaw
      ? {
          ...(typeof (qwenRaw as any).negative_prompt === "string" &&
          (qwenRaw as any).negative_prompt.trim()
            ? { negative_prompt: (qwenRaw as any).negative_prompt.trim() }
            : {}),
          ...(typeof (qwenRaw as any).prompt_extend === "boolean"
            ? { prompt_extend: (qwenRaw as any).prompt_extend }
            : {}),
          ...(typeof (qwenRaw as any).watermark === "boolean"
            ? { watermark: (qwenRaw as any).watermark }
            : {}),
          ...(typeof (qwenRaw as any).enable_interleave === "boolean"
            ? { enable_interleave: (qwenRaw as any).enable_interleave }
            : {}),
          ...(typeof (qwenRaw as any).stream === "boolean"
            ? { stream: (qwenRaw as any).stream }
            : {}),
          ...(typeof (qwenRaw as any).max_images === "number" &&
          Number.isFinite((qwenRaw as any).max_images)
            ? { max_images: (qwenRaw as any).max_images }
            : {}),
        }
      : undefined;
  const qwen =
    qwenCandidate && Object.keys(qwenCandidate).length > 0 ? qwenCandidate : undefined;
  const providerOptions =
    quality || style || qwen
      ? {
          ...(quality || style
            ? {
                openai: {
                  ...(quality ? { quality } : {}),
                  ...(style ? { style } : {}),
                },
              }
            : {}),
          ...(qwen ? { qwen } : {}),
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

/** Merge image options with a partial patch and normalize the result. */
export function mergeImageOptions(
  prev: ImageGenerateOptions | undefined,
  patch: Partial<ImageGenerateOptions>
): ImageGenerateOptions | undefined {
  return normalizeImageOptions({ ...(prev ?? {}), ...patch });
}
