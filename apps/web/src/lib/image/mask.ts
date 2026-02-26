/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { loadImageFromBlob, resolveBaseName } from "@/lib/image/uri";

/** Build a mask file name for a base image. */
export function resolveMaskFileName(baseFileName: string) {
  const base = resolveBaseName(baseFileName).replace(/_mask$/i, "") || "image";
  return `${base}_mask.png`;
}

/** Draw a checkerboard background for transparency preview. */
function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cell: number
) {
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      const isEven = ((x / cell + y / cell) % 2) === 0;
      ctx.fillStyle = isEven ? "#f3f4f6" : "#e5e7eb";
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

/** Build a composite preview url with mask transparency. */
export async function buildMaskedPreviewUrl(baseBlob: Blob, maskBlob: Blob) {
  const [baseImage, maskImage] = await Promise.all([
    loadImageFromBlob(baseBlob),
    loadImageFromBlob(maskBlob),
  ]);
  const canvas = document.createElement("canvas");
  const width = baseImage.naturalWidth || baseImage.width;
  const height = baseImage.naturalHeight || baseImage.height;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas failed");
  // 逻辑：棋盘格背景 + 原图，mask 区域挖空透明。
  drawCheckerboard(ctx, width, height, 12);
  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = width;
  baseCanvas.height = height;
  const baseCtx = baseCanvas.getContext("2d");
  if (!baseCtx) throw new Error("base canvas failed");
  baseCtx.drawImage(baseImage, 0, 0, width, height);
  baseCtx.globalCompositeOperation = "destination-out";
  baseCtx.drawImage(maskImage, 0, 0, width, height);
  baseCtx.globalCompositeOperation = "source-over";
  ctx.drawImage(baseCanvas, 0, 0, width, height);
  const previewBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/png");
  });
  if (!previewBlob) throw new Error("preview failed");
  return URL.createObjectURL(previewBlob);
}
