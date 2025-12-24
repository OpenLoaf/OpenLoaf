"use client";

import type { Edge, Node as RFNode } from "reactflow";

type CanvasStoragePayload = {
  version: number;
  nodes: RFNode[];
  edges: Edge[];
};

const CANVAS_STORAGE_VERSION = 1;
const CANVAS_STORAGE_PREFIX = "teatime:canvas";

/** Build a stable storage key for a canvas page. */
export function buildCanvasStorageKey(pageId?: string): string {
  const normalized = (pageId ?? "").trim();
  const suffix = normalized.length > 0 ? normalized : "default";
  return `${CANVAS_STORAGE_PREFIX}:${encodeURIComponent(suffix)}`;
}

/** Read canvas data from localStorage safely. */
export function readCanvasStorage(key: string): CanvasStoragePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CanvasStoragePayload;
    // 流程：解析结果 -> 校验版本/结构 -> 只在合法时返回
    if (!parsed || parsed.version !== CANVAS_STORAGE_VERSION) return null;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}
