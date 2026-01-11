"use client";

import { TriangleAlert } from "lucide-react";
import type { TenasWebContentsViewStatus } from "@/components/browser/browser-types";

export function BrowserErrorOverlay({
  failed,
}: {
  failed?: TenasWebContentsViewStatus["failed"];
}) {
  if (!failed) return null;
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-background/70">
      <div className="max-w-[360px] rounded-lg border bg-background p-4 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <TriangleAlert className="h-4 w-4" />
          <span>页面加载失败</span>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {failed.errorDescription || "Load failed"}
        </div>
        {failed.validatedURL ? (
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {failed.validatedURL}
          </div>
        ) : null}
      </div>
    </div>
  );
}

