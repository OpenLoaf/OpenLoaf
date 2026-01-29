"use client";

import type { TenasWebContentsViewStatus } from "@/components/browser/browser-types";

export type WebContentsReadyResult = {
  /** Result status. */
  status: "ready" | "failed";
  /** Source status detail. */
  detail: TenasWebContentsViewStatus;
};

/** Resolve when a WebContentsView finishes loading for the given viewKey. */
export function waitForWebContentsViewReady(viewKey: string): Promise<WebContentsReadyResult | null> {
  const key = viewKey.trim();
  if (!key) return Promise.resolve(null);
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TenasWebContentsViewStatus>).detail;
      if (!detail || detail.key !== key) return;
      // 中文注释：只有在加载结束或失败时才回执，避免打开后立刻 ack。
      if (detail.failed) {
        window.removeEventListener("tenas:webcontents-view:status", handler);
        resolve({ status: "failed", detail });
        return;
      }
      const isReady = detail.ready === true || detail.loading === false;
      if (!isReady) return;
      window.removeEventListener("tenas:webcontents-view:status", handler);
      resolve({ status: "ready", detail });
    };

    // 中文注释：不做前端超时，后端负责兜底。
    window.addEventListener("tenas:webcontents-view:status", handler);
  });
}
