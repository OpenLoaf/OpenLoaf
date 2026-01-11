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
  const seed =
    typeof value.seed === "number" && Number.isFinite(value.seed) ? value.seed : undefined;
  const quality =
    typeof value.providerOptions?.openai?.quality === "string"
      ? value.providerOptions.openai.quality.trim()
      : "";
  const style =
    typeof value.providerOptions?.openai?.style === "string"
      ? value.providerOptions.openai.style.trim()
      : "";
  const providerOptions =
    quality || style
      ? {
          openai: {
            ...(quality ? { quality } : {}),
            ...(style ? { style } : {}),
          },
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

/** Merge image options with a partial patch and normalize the result. */
export function mergeImageOptions(
  prev: ImageGenerateOptions | undefined,
  patch: Partial<ImageGenerateOptions>
): ImageGenerateOptions | undefined {
  return normalizeImageOptions({ ...(prev ?? {}), ...patch });
}
