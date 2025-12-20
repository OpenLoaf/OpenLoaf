"use client";

import { generateId } from "ai";

const CLIENT_STREAM_CLIENT_ID_STORAGE_KEY = "teatime:chat:sse-client-id";

// 关键：同一浏览器会话的 SSE clientId 必须稳定（用于断线续传去重）
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

