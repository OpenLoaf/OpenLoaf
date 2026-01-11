"use client";

import { generateId } from "ai";

const CLIENT_STREAM_CLIENT_ID_STORAGE_KEY = "tenas:chat:sse-client-id";

// 关键：同一浏览器会话的 clientId 保持稳定，便于服务端识别。
export function getWebClientId() {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.sessionStorage.getItem(CLIENT_STREAM_CLIENT_ID_STORAGE_KEY);
    if (existing) return existing;
    const created = globalThis.crypto?.randomUUID?.() ?? `cid_${generateId()}`;
    window.sessionStorage.setItem(CLIENT_STREAM_CLIENT_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return globalThis.crypto?.randomUUID?.() ?? `cid_${generateId()}`;
  }
}
