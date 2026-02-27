/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Checkpoint,
  CheckpointIcon,
  CheckpointTrigger,
} from "@/components/ai-elements/checkpoint";
import { MessageResponse } from "@/components/ai-elements/message";

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
      <Checkpoint className="w-full">
        <CheckpointIcon className="size-3.5" />
        <CheckpointTrigger
          onClick={toggleExpanded}
          disabled={!hasSummary}
          aria-expanded={expanded}
          aria-controls={hasSummary ? summaryId : undefined}
          className={cn(
            "h-7 rounded-full border border-muted-foreground/30 bg-muted/20 px-3 py-1 text-xs text-muted-foreground",
            hasSummary ? "cursor-pointer hover:text-foreground/80" : "cursor-default",
          )}
          tooltip={hasSummary ? (expanded ? "收起压缩摘要" : "展开压缩摘要") : undefined}
        >
          上下文已压缩
        </CheckpointTrigger>
      </Checkpoint>
      {expanded && hasSummary ? (
        <div
          id={summaryId}
          className="w-full max-w-3xl rounded-lg border border-muted-foreground/20 bg-muted/20 px-3 py-2 text-xs text-foreground/80"
        >
          <MessageResponse className="whitespace-pre-wrap break-words">
            {summaryText}
          </MessageResponse>
        </div>
      ) : null}
    </div>
  );
}
