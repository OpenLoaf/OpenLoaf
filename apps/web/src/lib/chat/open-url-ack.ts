"use client";

import type { OpenLoafWebContentsViewStatus } from "@/components/browser/browser-types";

export type WebContentsReadyResult = {
  /** Result status. */
  status: "ready" | "failed";
  /** Source status detail. */
  detail: OpenLoafWebContentsViewStatus;
};

/** Resolve when a WebContentsView finishes loading for the given viewKey. */
export function waitForWebContentsViewReady(viewKey: string): Promise<WebContentsReadyResult | null> {
  const key = viewKey.trim();
  if (!key) return Promise.resolve(null);
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    // 中文注释：必须先观察到 loading=true，避免初始状态 loading=false 导致过早回执。
    let sawLoading = false;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OpenLoafWebContentsViewStatus>).detail;
      if (!detail || detail.key !== key) return;
      // 中文注释：只有在加载结束或失败时才回执，避免打开后立刻 ack。
      if (detail.failed) {
        window.removeEventListener("openloaf:webcontents-view:status", handler);
        resolve({ status: "failed", detail });
        return;
      }
      if (detail.loading === true) {
        sawLoading = true;
      }
      const isReady = detail.ready === true || (detail.loading === false && sawLoading);
      if (!isReady) return;
      window.removeEventListener("openloaf:webcontents-view:status", handler);
      resolve({ status: "ready", detail });
    };

    // 中文注释：不做前端超时，后端负责兜底。
    window.addEventListener("openloaf:webcontents-view:status", handler);
  });
}
