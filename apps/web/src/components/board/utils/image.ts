import { fetchBlobFromUri, resolveFileName } from "@/lib/image/uri";

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

const DEFAULT_PREVIEW_MAX = 1024;
const DEFAULT_NODE_MAX = 420;
const DEFAULT_PREVIEW_QUALITY = 0.82;

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
    maxDimension: options?.maxPreviewDimension ?? DEFAULT_PREVIEW_MAX,
    quality: options?.quality ?? DEFAULT_PREVIEW_QUALITY,
  });
  const [nodeWidth, nodeHeight] = fitSize(
    naturalWidth,
    naturalHeight,
    options?.maxNodeDimension ?? DEFAULT_NODE_MAX
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
    /** Project id for resolving relative paths. */
    projectId?: string;
  }
): Promise<ImageNodePayload> {
  const blob = await fetchBlobFromUri(uri, { projectId: options?.projectId });
  const dataUrl = await readBlobAsDataUrl(blob);
  const image = await decodeImage(dataUrl);
  const naturalWidth = image.naturalWidth || 1;
  const naturalHeight = image.naturalHeight || 1;
  const mimeType = blob.type || "image/png";
  const { previewSrc } = await buildPreviewDataUrl(image, mimeType, {
    maxDimension: options?.maxPreviewDimension ?? DEFAULT_PREVIEW_MAX,
    quality: options?.quality ?? DEFAULT_PREVIEW_QUALITY,
  });
  const [nodeWidth, nodeHeight] = fitSize(
    naturalWidth,
    naturalHeight,
    options?.maxNodeDimension ?? DEFAULT_NODE_MAX
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
