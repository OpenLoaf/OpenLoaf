import {
  FILE_DRAG_MASK_URI_MIME,
  FILE_DRAG_NAME_MIME,
  FILE_DRAG_URI_MIME,
} from "@/components/ui/teatime/drag-drop-types";
import { resolveFileName } from "@/lib/image/uri";

export type ImageDragPayload = {
  /** Base image uri for dragging. */
  baseUri: string;
  /** Optional file name for the dragged image. */
  fileName?: string;
  /** Optional mask uri for the dragged image. */
  maskUri?: string;
};

/** Set drag payload for image attachments. */
export function setImageDragPayload(dataTransfer: DataTransfer, payload: ImageDragPayload) {
  const fileName = payload.fileName || resolveFileName(payload.baseUri);
  dataTransfer.setData(FILE_DRAG_URI_MIME, payload.baseUri);
  dataTransfer.setData(FILE_DRAG_NAME_MIME, fileName);
  if (payload.maskUri) {
    dataTransfer.setData(FILE_DRAG_MASK_URI_MIME, payload.maskUri);
  }
  dataTransfer.setData("text/plain", fileName);
  dataTransfer.setData("text/uri-list", payload.baseUri);
}

/** Read drag payload for image attachments. */
export function readImageDragPayload(dataTransfer: DataTransfer) {
  const baseUri = dataTransfer.getData(FILE_DRAG_URI_MIME);
  if (!baseUri) return null;
  const fileName = dataTransfer.getData(FILE_DRAG_NAME_MIME) || resolveFileName(baseUri);
  const maskUri = dataTransfer.getData(FILE_DRAG_MASK_URI_MIME);
  return { baseUri, fileName, maskUri: maskUri || undefined };
}
