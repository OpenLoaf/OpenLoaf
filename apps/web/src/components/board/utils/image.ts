import {
  fetchBlobFromUri,
  loadImageFromBlob,
  resolveBaseName,
  resolveFileName,
} from "@/lib/image/uri";
import {
  IMAGE_NODE_DEFAULT_MAX_SIZE,
  IMAGE_PREVIEW_MAX_DIMENSION,
  IMAGE_PREVIEW_QUALITY,
} from "../nodes/node-config";

export type ImageNodePayload = {
  /** Props used by the image node component. */
  props: {
    /** Compressed preview used for rendering. */
    previewSrc: string;
    /** Original image uri used for download/copy. */
    originalSrc: string;
    /** MIME type for the original image. */
    mimeType: string;
    /** Suggested file name for download. */
    fileName: string;
    /** Original image width in pixels. */
    naturalWidth: number;
    /** Original image height in pixels. */
    naturalHeight: number;
  };
  /** Suggested node size in world coordinates. */
  size: [number, number];
};

/** Extract a lowercase file extension from a name. */
function getFileExtension(fileName: string): string {
  const clean = fileName.split("?")[0]?.split("#")[0] || fileName;
  const parts = clean.split(".");
  if (parts.length <= 1) return "";
  return String(parts.pop() ?? "").toLowerCase();
}

/** Check whether a file is JPG or PNG. */
function isJpegOrPng(file: File): boolean {
  const type = file.type.toLowerCase();
  const ext = getFileExtension(file.name);
  if (type === "image/png" || type === "image/jpeg" || type === "image/jpg") return true;
  return ext === "png" || ext === "jpg" || ext === "jpeg";
}

/** Decide whether a file should be converted to PNG before insertion. */
export function shouldConvertImageToPng(file: File): boolean {
  return !isJpegOrPng(file);
}

/** Check whether a file is HEIC/HEIF. */
function isHeicLike(file: File): boolean {
  const type = file.type.toLowerCase();
  const ext = getFileExtension(file.name);
  if (type === "image/heic" || type === "image/heif") return true;
  return ext === "heic" || ext === "heif";
}

/** Build a PNG file name from the original file. */
function buildPngFileName(fileName: string): string {
  const base = resolveBaseName(fileName) || "image";
  // 逻辑：清理非法路径分隔符，避免生成嵌套路径。
  const safeBase = base.replace(/[\\/]/g, "-") || "image";
  return `${safeBase}.png`;
}

/** Read a blob as a data url string. */
function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read blob."));
    reader.readAsDataURL(blob);
  });
}

/** Decode an image from a data url. */
async function decodeImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = dataUrl;
  if (image.decode) {
    await image.decode();
    return image;
  }
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to decode image."));
  });
  return image;
}

/** Convert an image file into a PNG file using canvas rendering. */
async function convertImageFileToPng(file: File): Promise<File> {
  const dataUrl = await readBlobAsDataUrl(file);
  const image = await decodeImage(dataUrl);
  const width = image.naturalWidth || 1;
  const height = image.naturalHeight || 1;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas context unavailable");
  }
  ctx.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/png");
  });
  if (!blob) {
    throw new Error("png conversion failed");
  }
  return new File([blob], buildPngFileName(file.name), { type: "image/png" });
}

/** Convert a file to PNG when needed, otherwise return the original file. */
export async function convertImageFileToPngIfNeeded(
  file: File
): Promise<{ file: File; converted: boolean }> {
  if (isJpegOrPng(file)) {
    return { file, converted: false };
  }
  if (isHeicLike(file)) {
    // 逻辑：动态加载 heic2any，避免首屏增包。
    const heic2any = (await import("heic2any")).default as (args: {
      blob: Blob;
      toType: string;
    }) => Promise<Blob | Blob[]>;
    const result = await heic2any({ blob: file, toType: "image/png" });
    const blob = Array.isArray(result) ? result[0] : result;
    if (!blob) {
      throw new Error("heic conversion failed");
    }
    return {
      file: new File([blob], buildPngFileName(file.name), { type: "image/png" }),
      converted: true,
    };
  }
  return { file: await convertImageFileToPng(file), converted: true };
}

/** Compute a fitted size that preserves aspect ratio. */
function fitSize(width: number, height: number, maxDimension: number): [number, number] {
  const maxSide = Math.max(width, height);
  if (maxSide <= maxDimension) {
    return [Math.max(1, Math.round(width)), Math.max(1, Math.round(height))];
  }
  const scale = maxDimension / maxSide;
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

/** Render a preview image for display on the canvas. */
async function buildPreviewDataUrl(
  image: HTMLImageElement,
  mimeType: string,
  options: { maxDimension: number; quality: number }
): Promise<{ previewSrc: string; previewWidth: number; previewHeight: number }> {
  const [previewWidth, previewHeight] = fitSize(
    image.naturalWidth,
    image.naturalHeight,
    options.maxDimension
  );
  const canvas = document.createElement("canvas");
  canvas.width = previewWidth;
  canvas.height = previewHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      previewSrc: image.src,
      previewWidth,
      previewHeight,
    };
  }
  const previewMime =
    mimeType === "image/png" || mimeType === "image/webp" ? mimeType : "image/jpeg";
  if (previewMime === "image/jpeg") {
    // 逻辑：JPEG 预览先铺底色，避免透明图片渲染发黑。
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, previewWidth, previewHeight);
  }
  ctx.drawImage(image, 0, 0, previewWidth, previewHeight);
  return {
    previewSrc: canvas.toDataURL(previewMime, options.quality),
    previewWidth,
    previewHeight,
  };
}

/** Build image node props and a suggested size from an image file. */
export async function buildImageNodePayloadFromFile(
  file: File,
  options?: {
    /** Max dimension for the preview bitmap. */
    maxPreviewDimension?: number;
    /** Max dimension for the initial node size. */
    maxNodeDimension?: number;
    /** Quality used when encoding compressed previews. */
    quality?: number;
  }
): Promise<ImageNodePayload> {
  const originalSrc = await readBlobAsDataUrl(file);
  const image = await decodeImage(originalSrc);
  const naturalWidth = image.naturalWidth || 1;
  const naturalHeight = image.naturalHeight || 1;
  const { previewSrc } = await buildPreviewDataUrl(image, file.type, {
    maxDimension: options?.maxPreviewDimension ?? IMAGE_PREVIEW_MAX_DIMENSION,
    quality: options?.quality ?? IMAGE_PREVIEW_QUALITY,
  });
  const [nodeWidth, nodeHeight] = fitSize(
    naturalWidth,
    naturalHeight,
    options?.maxNodeDimension ?? IMAGE_NODE_DEFAULT_MAX_SIZE
  );

  return {
    props: {
      previewSrc,
      originalSrc,
      mimeType: file.type || "image/png",
      fileName: file.name || "Image",
      naturalWidth,
      naturalHeight,
    },
    size: [nodeWidth, nodeHeight],
  };
}

/** Build image node props and a suggested size from a uri. */
export async function buildImageNodePayloadFromUri(
  uri: string,
  options?: {
    /** Max dimension for the preview bitmap. */
    maxPreviewDimension?: number;
    /** Max dimension for the initial node size. */
    maxNodeDimension?: number;
    /** Quality used when encoding compressed previews. */
    quality?: number;
    /** Target byte size for preview fetch. */
    maxPreviewBytes?: number;
    /** Preview source mode used for data url generation. */
    previewMode?: "dataUrl" | "none";
    /** Project id for resolving relative paths. */
    projectId?: string;
  }
): Promise<ImageNodePayload> {
  const blob = await fetchBlobFromUri(uri, {
    projectId: options?.projectId,
    maxBytes: options?.maxPreviewBytes,
  });
  const previewMode = options?.previewMode ?? "dataUrl";
  const image =
    previewMode === "none"
      ? await loadImageFromBlob(blob)
      : await decodeImage(await readBlobAsDataUrl(blob));
  const naturalWidth = image.naturalWidth || 1;
  const naturalHeight = image.naturalHeight || 1;
  const mimeType = blob.type || "image/png";
  const previewSrc =
    previewMode === "none"
      ? ""
      : (
          await buildPreviewDataUrl(image, mimeType, {
            maxDimension: options?.maxPreviewDimension ?? IMAGE_PREVIEW_MAX_DIMENSION,
            quality: options?.quality ?? IMAGE_PREVIEW_QUALITY,
          })
        ).previewSrc;
  const [nodeWidth, nodeHeight] = fitSize(
    naturalWidth,
    naturalHeight,
    options?.maxNodeDimension ?? IMAGE_NODE_DEFAULT_MAX_SIZE
  );

  return {
    props: {
      previewSrc,
      originalSrc: uri,
      mimeType,
      fileName: resolveFileName(uri, mimeType),
      naturalWidth,
      naturalHeight,
    },
    size: [nodeWidth, nodeHeight],
  };
}

/** Convert a data url into a blob for clipboard operations. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}
