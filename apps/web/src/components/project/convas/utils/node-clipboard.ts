"use client";

import type { NodeClipboardPayload } from "./node-copy-paste";

type CanvasClipboardEnvelope = {
  version: 1;
  kind: "payload" | "ids";
  pageId?: string;
  payload?: NodeClipboardPayload;
  ids?: string[];
};

const CANVAS_CLIPBOARD_PREFIX = "teatime:canvas:nodes:";

/** Serialize a canvas clipboard payload to a text string. */
export function serializeCanvasClipboard(
  payload: NodeClipboardPayload,
  pageId?: string,
): string {
  const envelope: CanvasClipboardEnvelope = { version: 1, kind: "payload", pageId, payload };
  return `${CANVAS_CLIPBOARD_PREFIX}${JSON.stringify(envelope)}`;
}

/** Serialize canvas clipboard ids to a text string. */
export function serializeCanvasClipboardIds(ids: string[], pageId?: string): string {
  const envelope: CanvasClipboardEnvelope = { version: 1, kind: "ids", pageId, ids };
  return `${CANVAS_CLIPBOARD_PREFIX}${JSON.stringify(envelope)}`;
}

/** Parse a canvas clipboard payload from a text string. */
export function parseCanvasClipboard(
  text: string,
):
  | { kind: "payload"; payload: NodeClipboardPayload; pageId?: string }
  | { kind: "ids"; ids: string[]; pageId?: string }
  | null {
  if (!text.startsWith(CANVAS_CLIPBOARD_PREFIX)) return null;
  const raw = text.slice(CANVAS_CLIPBOARD_PREFIX.length);
  try {
    const parsed = JSON.parse(raw) as CanvasClipboardEnvelope;
    if (!parsed || parsed.version !== 1) return null;
    if (parsed.kind === "payload" && parsed.payload) {
      return { kind: "payload", payload: parsed.payload, pageId: parsed.pageId };
    }
    if (parsed.kind === "ids" && Array.isArray(parsed.ids)) {
      return { kind: "ids", ids: parsed.ids, pageId: parsed.pageId };
    }
    return null;
  } catch {
    return null;
  }
}

/** Build a clipboard item for a single image node when possible. */
export async function buildImageClipboardItem(
  payload: NodeClipboardPayload,
): Promise<ClipboardItem | null> {
  if (payload.nodes.length !== 1) return null;
  const node = payload.nodes[0];
  if (node.type !== "image") return null;
  const src = (node.data as { src?: string } | undefined)?.src;
  if (!src) return null;
  try {
    // 流程：请求图片 -> 转换 blob -> 构建剪贴板对象
    const response = await fetch(src);
    const blob = await response.blob();
    const text = serializeCanvasClipboard(payload);
    return new ClipboardItem({
      [blob.type || "image/png"]: blob,
      "text/plain": new Blob([text], { type: "text/plain" }),
    });
  } catch {
    return null;
  }
}
