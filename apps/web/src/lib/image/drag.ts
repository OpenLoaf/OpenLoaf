/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type React from "react";
import {
  extractAttachmentTagPath,
  formatAttachmentTag,
} from "@openloaf/api/common";
import {
  FILE_DRAG_IMAGE_MIME,
  FILE_DRAG_MASK_URI_MIME,
  FILE_DRAG_NAME_MIME,
  FILE_DRAG_REF_MIME,
  FILE_DRAG_URI_MIME,
} from "@openloaf/ui/openloaf/drag-drop-types";
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
  dataTransfer.setData("text/plain", "openloaf-file");
}

/** Check whether a string looks like a relative (non-URI) path. */
function isRelativePath(value: string) {
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

/** Build the FILE_DRAG_REF_MIME attachment-tag payload for an image source. */
export function buildChatFileRefText(url: string, name?: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  // 已经是完整 attachment tag — 直接沿用。
  if (extractAttachmentTagPath(trimmed) !== null) return trimmed;
  // 只接受相对路径 / http(s) 网络图片，其余（blob: / data:）无法被 ChatInput 的
  // attachment 管线识别，跳过以便回落到 image drag payload 路径。
  if (!isRelativePath(trimmed) && !/^https?:\/\//i.test(trimmed)) return "";
  const friendly = name?.trim();
  return friendly
    ? formatAttachmentTag({ path: trimmed, name: friendly })
    : formatAttachmentTag(trimmed);
}

type ChatImageDragOptions = {
  /** Image source URL (relative path, http(s) URL, blob:, or data:). */
  url: string;
  /** Friendly display label (goes into attachment tag's `name` attr). */
  name?: string;
  /** Best-known thumbnail URL for the drag ghost (falls back to `url`). */
  thumbnailUrl?: string;
};

/**
 * Set drag data + a 72px drag ghost for chat image thumbnails.
 * Used by MessageFile, WebSearchImageTool grid, and any other chat image surface
 * that should be droppable into ChatInput as an @attachment mention.
 */
export function applyChatImageDrag(
  event: React.DragEvent | DragEvent,
  opts: ChatImageDragOptions,
) {
  const dataTransfer = (event as DragEvent).dataTransfer;
  if (!dataTransfer) return;
  dataTransfer.effectAllowed = "copy";
  const fileName = opts.name?.trim() || resolveFileName(opts.url);
  setImageDragPayload(dataTransfer, { baseUri: opts.url, fileName });
  const fileRefText = buildChatFileRefText(opts.url, opts.name);
  if (fileRefText) {
    dataTransfer.setData(FILE_DRAG_REF_MIME, fileRefText);
    dataTransfer.setData("text/plain", `${fileRefText} `);
  }
  // 72px 圆角缩略图作为 drag ghost，避免浏览器用原始大图跟随鼠标。
  const ghostSrc = opts.thumbnailUrl || opts.url;
  if (ghostSrc && typeof document !== "undefined") {
    const thumb = document.createElement("div");
    thumb.style.cssText = [
      "width:72px",
      "height:72px",
      "border-radius:12px",
      "overflow:hidden",
      "border:1px solid rgba(0,0,0,0.12)",
      "box-shadow:0 6px 16px rgba(0,0,0,0.18)",
      "background-size:cover",
      "background-position:center",
      "background-repeat:no-repeat",
      `background-image:url("${ghostSrc.replace(/"/g, '\\"')}")`,
      "position:fixed",
      "top:-1000px",
      "left:-1000px",
      "pointer-events:none",
    ].join(";");
    document.body.appendChild(thumb);
    dataTransfer.setDragImage(thumb, 36, 36);
    setTimeout(() => thumb.remove(), 0);
  }
}

/**
 * Dispatch a chat-mention insertion event for an image. Used by the image
 * hover action "引用" — same effect as dragging the image into ChatInput.
 * Returns true if a valid attachment tag was dispatched.
 */
export function insertChatImageMention(opts: { url: string; name?: string }): boolean {
  const tag = buildChatFileRefText(opts.url, opts.name);
  if (!tag) return false;
  if (typeof window === "undefined") return false;
  window.dispatchEvent(
    new CustomEvent("openloaf:chat-insert-mention", { detail: { value: tag } }),
  );
  return true;
}

/** Read drag payload for image attachments. */
export function readImageDragPayload(dataTransfer: DataTransfer) {
  const baseUri = dataTransfer.getData(FILE_DRAG_URI_MIME);
  if (!baseUri) return null;
  const fileName = dataTransfer.getData(FILE_DRAG_NAME_MIME) || resolveFileName(baseUri);
  const maskUri = dataTransfer.getData(FILE_DRAG_MASK_URI_MIME);
  return { baseUri, fileName, maskUri: maskUri || undefined };
}
