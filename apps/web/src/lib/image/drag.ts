import {
  FILE_DRAG_IMAGE_MIME,
  FILE_DRAG_MASK_URI_MIME,
  FILE_DRAG_NAME_MIME,
  FILE_DRAG_URI_MIME,
} from "@/components/ui/tenas/drag-drop-types";
import { resolveFileName } from "@/lib/image/uri";

export type ImageDragPayload = {
  /** Base image uri for dragging. */
  baseUri: string;
  /** Optional file name for the dragged image. */
  fileName?: string;
  /** Optional mask uri for the dragged image. */
  maskUri?: string;
};

type DragPayloadOptions = {
  /** The dragged payload kind. */
  kind?: "image" | "file";
};

/** Set drag payload for image attachments. */
export function setImageDragPayload(
  dataTransfer: DataTransfer,
  payload: ImageDragPayload,
  options?: DragPayloadOptions
) {
  // 中文注释：清空浏览器默认拖拽数据，避免外部程序识别为文件拖拽。
  dataTransfer.clearData();
  const fileName = payload.fileName || resolveFileName(payload.baseUri);
  dataTransfer.setData(FILE_DRAG_URI_MIME, payload.baseUri);
  dataTransfer.setData(FILE_DRAG_NAME_MIME, fileName);
  if (payload.maskUri) {
    dataTransfer.setData(FILE_DRAG_MASK_URI_MIME, payload.maskUri);
  }
  if ((options?.kind ?? "image") === "image") {
    dataTransfer.setData(FILE_DRAG_IMAGE_MIME, "1");
  }
  // 中文注释：增加 text/plain 标记，确保应用内拖拽可被识别但不暴露文件内容。
  dataTransfer.setData("text/plain", "tenas-file");
}

/** Read drag payload for image attachments. */
export function readImageDragPayload(dataTransfer: DataTransfer) {
  const baseUri = dataTransfer.getData(FILE_DRAG_URI_MIME);
  if (!baseUri) return null;
  const fileName = dataTransfer.getData(FILE_DRAG_NAME_MIME) || resolveFileName(baseUri);
  const maskUri = dataTransfer.getData(FILE_DRAG_MASK_URI_MIME);
  return { baseUri, fileName, maskUri: maskUri || undefined };
}
