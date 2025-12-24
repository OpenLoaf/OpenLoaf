"use client";

export interface ImagePreviewOptions {
  maxDimension?: number;
  mimeType?: string;
  quality?: number;
}

const DEFAULT_PREVIEW_MAX_DIMENSION = 512;

/** Create a low-resolution preview from an image element. */
export function createImagePreviewFromImage(
  image: HTMLImageElement,
  options: ImagePreviewOptions = {},
) {
  const maxDimension = options.maxDimension ?? DEFAULT_PREVIEW_MAX_DIMENSION;
  const maxSide = Math.max(image.width, image.height);
  if (!Number.isFinite(maxSide) || maxSide <= maxDimension) {
    return image.src;
  }
  // 流程：计算缩放比例 -> 绘制到画布 -> 导出低分辨率 dataURL
  const scale = maxDimension / maxSide;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return image.src;
  ctx.drawImage(image, 0, 0, width, height);
  const mimeType = options.mimeType ?? "image/png";
  if (typeof options.quality === "number") {
    return canvas.toDataURL(mimeType, options.quality);
  }
  return canvas.toDataURL(mimeType);
}

/** Create a low-resolution preview from an image source string. */
export async function createImagePreviewFromSrc(
  src: string,
  options: ImagePreviewOptions = {},
) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image preview source."));
    img.src = src;
  });
  return createImagePreviewFromImage(image, options);
}
