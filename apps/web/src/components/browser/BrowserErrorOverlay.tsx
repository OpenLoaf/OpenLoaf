"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@tenas-ai/ui/button";
import type { TenasWebContentsViewStatus } from "@/components/browser/browser-types";

export function BrowserErrorOverlay({
  failed,
  isOffline,
  url,
  onRetry,
}: {
  failed?: TenasWebContentsViewStatus["failed"];
  // 中文注释：来自 navigator.onLine 的离线状态。
  isOffline?: boolean;
  // 中文注释：用于展示的 URL。
  url?: string;
  // 中文注释：重试回调。
  onRetry?: () => void;
}) {
  const showOffline = Boolean(isOffline);
  const showFailed = Boolean(failed);
  if (!showOffline && !showFailed) return null;
  const title = showOffline ? "网络不可用" : "页面加载失败";
  const description = showOffline
    ? "网络连接不可用，请检查网络后重试。"
    : failed?.errorDescription || "Load failed";
  const displayUrl = failed?.validatedURL || url;
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-background/70">
      <div className="max-w-[360px] rounded-lg border bg-background p-4 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <TriangleAlert className="h-4 w-4" />
          <span>{title}</span>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {description}
        </div>
        {displayUrl ? (
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {displayUrl}
          </div>
        ) : null}
        {onRetry ? (
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="outline" onClick={onRetry}>
              重试
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
