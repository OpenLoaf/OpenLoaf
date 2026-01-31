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
  const volcengineRaw = value.providerOptions?.volcengine;
  const volcengineCandidate =
    typeof volcengineRaw === "object" && volcengineRaw
      ? {
          ...(typeof (volcengineRaw as any).scale === "number" &&
          Number.isFinite((volcengineRaw as any).scale)
            ? { scale: (volcengineRaw as any).scale }
            : {}),
          ...(typeof (volcengineRaw as any).forceSingle === "boolean"
            ? { forceSingle: (volcengineRaw as any).forceSingle }
            : {}),
          ...(typeof (volcengineRaw as any).minRatio === "number" &&
          Number.isFinite((volcengineRaw as any).minRatio)
            ? { minRatio: (volcengineRaw as any).minRatio }
            : {}),
          ...(typeof (volcengineRaw as any).maxRatio === "number" &&
          Number.isFinite((volcengineRaw as any).maxRatio)
            ? { maxRatio: (volcengineRaw as any).maxRatio }
            : {}),
          ...(typeof (volcengineRaw as any).size === "number" &&
          Number.isFinite((volcengineRaw as any).size)
            ? { size: (volcengineRaw as any).size }
            : {}),
        }
      : undefined;
  const volcengine =
    volcengineCandidate && Object.keys(volcengineCandidate).length > 0
      ? volcengineCandidate
      : undefined;
  const providerOptions =
    quality || style || volcengine
      ? {
          ...(quality || style
            ? {
                openai: {
                  ...(quality ? { quality } : {}),
                  ...(style ? { style } : {}),
                },
              }
            : {}),
          ...(volcengine ? { volcengine } : {}),
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
