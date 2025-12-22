"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ManualStopToolPart = {
  type: string;
  state?: string;
  data?: { reason?: string };
  output?: unknown;
};

/**
 * Renders a subtle marker for manual stop.
 */
export function ManualStopTool({ part }: { part: ManualStopToolPart }) {
  const reason =
    (typeof part.output === "string" && part.output.trim()) ||
    (typeof part.data?.reason === "string" && part.data.reason.trim()) ||
    "用户手动中断";

  return (
    <div className={cn("ml-2 flex items-center text-xs text-muted-foreground")}>
      <span>已手动中断</span>
      <span className="mx-2">•</span>
      <span>{reason}</span>
    </div>
  );
}
