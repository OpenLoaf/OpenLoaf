"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useChatContext } from "../ChatProvider";

export default function MessageBranchNav({ messageId }: { messageId: string }) {
  const { status, branchMessageIds, siblingNav, switchSibling } = useChatContext();

  const isBusy = status === "submitted" || status === "streaming";
  const isBranchNode = branchMessageIds.includes(messageId);
  const nav = siblingNav[messageId];

  // 关键：只对“当前分支链上的节点”显示切换按钮
  if (!isBranchNode || !nav || nav.siblingTotal <= 1) return null;

  return (
    <div className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        disabled={isBusy || !nav.prevSiblingId}
        aria-label="切换到前一个分支"
        title="切换到前一个分支"
        onClick={() => switchSibling(messageId, "prev")}
      >
        <ChevronLeft className="size-3.5" />
      </Button>

      <span className="text-xs tabular-nums text-muted-foreground select-none">{`${nav.siblingIndex}/${nav.siblingTotal}`}</span>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        disabled={isBusy || !nav.nextSiblingId}
        aria-label="切换到后一个分支"
        title="切换到后一个分支"
        onClick={() => switchSibling(messageId, "next")}
      >
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  );
}

