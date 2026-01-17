"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface CompactSummaryDividerProps {
  /** Summary text content. */
  summary: string;
  /** Optional class names for the container. */
  className?: string;
}

/** Renders a compact summary divider. */
export default function CompactSummaryDivider({
  summary,
  className,
}: CompactSummaryDividerProps) {
  const summaryText = summary?.trim() ?? "";
  const hasSummary = summaryText.length > 0;
  const summaryId = React.useId();
  const [expanded, setExpanded] = React.useState(false);

  const toggleExpanded = React.useCallback(() => {
    // 中文注释：点击分隔条切换摘要显示。
    if (!hasSummary) return;
    setExpanded((prev) => !prev);
  }, [hasSummary]);

  return (
    <div className={cn("flex flex-col items-center gap-2 py-1", className)}>
      <button
        type="button"
        onClick={toggleExpanded}
        disabled={!hasSummary}
        aria-expanded={expanded}
        aria-controls={hasSummary ? summaryId : undefined}
        className={cn(
          "w-full text-xs text-muted-foreground transition",
          hasSummary ? "cursor-pointer hover:text-foreground/80" : "cursor-default"
        )}
      >
        <div className="flex items-center gap-2">
          <span className="h-px flex-1 bg-muted-foreground/30" />
          <span className="px-3 py-1 rounded-full border border-muted-foreground/30 bg-muted/20">
            上下文已压缩
          </span>
          <span className="h-px flex-1 bg-muted-foreground/30" />
        </div>
      </button>
      {expanded && hasSummary ? (
        <div
          id={summaryId}
          className="w-full max-w-3xl rounded-lg border border-muted-foreground/20 bg-muted/20 px-3 py-2 text-xs text-foreground/80 whitespace-pre-wrap"
        >
          {summaryText}
        </div>
      ) : null}
    </div>
  );
}
