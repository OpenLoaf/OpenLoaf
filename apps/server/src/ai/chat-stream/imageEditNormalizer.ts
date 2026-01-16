import { Buffer } from "node:buffer";
import sharp from "sharp";
import { downloadImageData } from "@/ai/utils/image-download";
import { loadProjectImageBuffer } from "./attachmentResolver";
import {
  resolveActiveS3Storage,
  resolveBaseNameFromUrl,
  resolveImageExtension,
  resolveMediaTypeFromDataUrl,
  sanitizeFileName,
} from "./imageStorage";
import type {
  GenerateImagePrompt,
  GenerateImagePromptObject,
  PromptImageInput,
} from "./imagePrompt";

type ResolvedImageInput = {
  /** Image buffer for upload. */
  buffer: Buffer;
  /** Media type of the image. */
  mediaType: string;
  /** Base name derived from url or fallback. */
  baseName: string;
};

type MaskFormat = "alpha" | "grey";

/** Check whether the input string is a relative path. */
function isRelativePath(value: string): boolean {
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

/** Resolve image input into buffer + meta. */
async function resolveImageInputBuffer(input: {
  /** Raw input data. */
  data: PromptImageInput["data"];
  /** Optional media type hint. */
  mediaType?: string;
  /** Fallback base name for storage. */
  fallbackName: string;
  /** Abort signal for request cancellation. */
  abortSignal: AbortSignal;
}): Promise<ResolvedImageInput> {
  const mediaTypeHint = input.mediaType?.trim() || "";
  const fallbackName = sanitizeFileName(input.fallbackName);
  if (typeof input.data === "string") {
    const raw = input.data.trim();
    const dataUrlType = raw.startsWith("data:") ? resolveMediaTypeFromDataUrl(raw) : "";
    const resolvedType = dataUrlType || mediaTypeHint || "image/png";
    if (isRelativePath(raw)) {
      const payload = await loadProjectImageBuffer({ path: raw, mediaType: resolvedType });
      if (!payload) {
        throw new Error("图片读取失败");
      }
      return {
        buffer: payload.buffer,
        mediaType: payload.mediaType,
        baseName: resolveBaseNameFromUrl(raw, fallbackName),
      };
    }
    const bytes = await downloadImageData(raw, input.abortSignal);
    return {
      buffer: Buffer.from(bytes),
      mediaType: resolvedType,
      baseName: resolveBaseNameFromUrl(raw, fallbackName),
    };
  }
  if (Buffer.isBuffer(input.data)) {
    return {
      buffer: input.data,
      mediaType: mediaTypeHint || "image/png",
      baseName: fallbackName,
    };
  }
  if (input.data instanceof Uint8Array) {
    return {
      buffer: Buffer.from(input.data),
      mediaType: mediaTypeHint || "image/png",
      baseName: fallbackName,
    };
  }
  if (input.data instanceof ArrayBuffer) {
    return {
      buffer: Buffer.from(input.data),
      mediaType: mediaTypeHint || "image/png",
      baseName: fallbackName,
    };
  }
  throw new Error("图片输入格式不支持");
}

/** Resolve target image size. */
async function resolveImageSize(primary: Buffer, fallback?: Buffer) {
  const meta = await sharp(primary).metadata();
  if (meta.width && meta.height) {
    return { width: meta.width, height: meta.height };
  }
  if (fallback) {
    const fallbackMeta = await sharp(fallback).metadata();
    if (fallbackMeta.width && fallbackMeta.height) {
      return { width: fallbackMeta.width, height: fallbackMeta.height };
    }
  }
  throw new Error("无法解析图片尺寸");
}

/** Build binary mask map from a transparent stroke image. */
async function buildMaskMap(buffer: Buffer, width: number, height: number): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const useAlpha = Boolean(meta.hasAlpha);
  const { data, info } = await sharp(buffer)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  const mask = Buffer.alloc(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 4;
    const alpha = data[offset + 3] ?? 0;
    const luminance =
      (data[offset] ?? 0) + (data[offset + 1] ?? 0) + (data[offset + 2] ?? 0);
    // 透明背景 + 笔刷颜色，透明处为 0，笔刷处为 255。
    const isMarked = useAlpha ? alpha > 0 : luminance > 0;
    mask[i] = isMarked ? 255 : 0;
  }
  return mask;
}

/** Build grayscale mask png. */
async function buildGreyMask(mask: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(mask, {
    raw: { width, height, channels: 1 },
  })
    .png()
    .toBuffer();
}

/** Build alpha image from base + mask (transparent = editable). */
async function buildAlphaMaskFromBase(
  base: Buffer,
  mask: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const { data, info } = await sharp(base)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  const rgba = Buffer.alloc(pixelCount * 4);
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 4;
    // 逻辑：保留原图颜色，笔刷区域透明，其余区域不透明。
    rgba[offset] = data[offset] ?? 0;
    rgba[offset + 1] = data[offset + 1] ?? 0;
    rgba[offset + 2] = data[offset + 2] ?? 0;
    rgba[offset + 3] = (mask[i] ?? 0) > 0 ? 0 : 255;
  }
  return sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

/** Resolve mask format based on provider id or adapter id. */
function resolveMaskFormatByModel(providerId: string, adapterId?: string): MaskFormat {
  if (providerId === "volcengine" || adapterId === "volcengine") return "grey";
  return "alpha";
}

/** Normalize prompt into S3 urls for image editing. */
export async function normalizePromptForImageEdit(input: {
  /** Prompt object for image edit. */
  prompt: GenerateImagePromptObject;
  /** Image inputs from chat. */
  images: PromptImageInput[];
  /** Optional mask input from chat. */
  mask?: PromptImageInput;
  /** Session id for temp storage. */
  sessionId: string;
  /** Provider id for model-specific handling. */
  modelProviderId: string;
  /** Adapter id for model-specific handling. */
  modelAdapterId: string;
  /** Abort signal for request cancellation. */
  abortSignal: AbortSignal;
}): Promise<GenerateImagePrompt> {
  // 图像编辑统一转为 S3 URL，避免混用输入格式。
  const storage = resolveActiveS3Storage();
  if (!storage) {
    throw new Error("需要配置 S3 存储服务");
  }
  if (input.images.length === 0) {
    throw new Error("图片编辑缺少原图");
  }
  if (!input.mask) {
    throw new Error("图片编辑缺少遮罩");
  }

  const resolvedImages = await Promise.all(
    input.images.map((image, index) =>
      resolveImageInputBuffer({
        data: image.data,
        mediaType: image.mediaType,
        fallbackName: `image-${index + 1}`,
        abortSignal: input.abortSignal,
      }),
    ),
  );
  const baseImage = resolvedImages[0];
  if (!baseImage) {
    throw new Error("图片编辑缺少原图");
  }
  const resolvedMask = await resolveImageInputBuffer({
    data: input.mask.data,
    mediaType: input.mask.mediaType,
    fallbackName: `${baseImage.baseName || "image"}_mask`,
    abortSignal: input.abortSignal,
  });
  const { width, height } = await resolveImageSize(baseImage.buffer, resolvedMask.buffer);
  const maskFormat = resolveMaskFormatByModel(input.modelProviderId, input.modelAdapterId);
  const maskMap = await buildMaskMap(resolvedMask.buffer, width, height);
  // 按模型要求输出 alpha/grey 遮罩文件。
  const maskBuffer =
    maskFormat === "alpha"
      ? await buildAlphaMaskFromBase(baseImage.buffer, maskMap, width, height)
      : await buildGreyMask(maskMap, width, height);

  const imageUrls: string[] = [];
  for (const image of resolvedImages) {
    const baseName = sanitizeFileName(image.baseName || "image");
    const ext = resolveImageExtension(image.mediaType);
    const fileName = `${baseName}.${ext}`;
    const key = `ai-temp/chat/${input.sessionId}/${fileName}`;
    const result = await storage.putObject({
      key,
      body: image.buffer,
      contentType: image.mediaType,
      contentLength: image.buffer.byteLength,
    });
    imageUrls.push(result.url);
  }

  const baseName = sanitizeFileName(baseImage.baseName || "image");
  const maskFileName = `${baseName}_${maskFormat}.png`;
  const maskKey = `ai-temp/chat/${input.sessionId}/${maskFileName}`;
  const maskResult = await storage.putObject({
    key: maskKey,
    body: maskBuffer,
    contentType: "image/png",
    contentLength: maskBuffer.byteLength,
  });

  return {
    images: imageUrls,
    ...(typeof input.prompt.text === "string" && input.prompt.text.trim()
      ? { text: input.prompt.text }
      : {}),
    mask: maskResult.url,
  };
}
