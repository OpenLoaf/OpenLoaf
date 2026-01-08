import { loadImageFromBlob, resolveBaseName } from "@/lib/image/uri";

/** Build a mask file name for a base image. */
export function resolveMaskFileName(baseFileName: string) {
  const base = resolveBaseName(baseFileName).replace(/_mask$/i, "") || "image";
  return `${base}_mask.png`;
}

/** Build a composite preview url with mask overlay. */
export async function buildMaskedPreviewUrl(baseBlob: Blob, maskBlob: Blob) {
  const [baseImage, maskImage] = await Promise.all([
    loadImageFromBlob(baseBlob),
    loadImageFromBlob(maskBlob),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = baseImage.naturalWidth || baseImage.width;
  canvas.height = baseImage.naturalHeight || baseImage.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas failed");
  // 逻辑：将 base + mask 合成一张带笔刷预览的图片。
  ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.7;
  ctx.drawImage(maskImage, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
  const previewBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/png");
  });
  if (!previewBlob) throw new Error("preview failed");
  return URL.createObjectURL(previewBlob);
}
