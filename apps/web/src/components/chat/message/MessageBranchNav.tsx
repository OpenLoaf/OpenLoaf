"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useChatContext } from "../ChatProvider";

export default function MessageBranchNav({ messageId }: { messageId: string }) {
  const { status, branchMessageIds, siblingNav, switchSibling } = useChatContext();

  const isBusy = status === "submitted" || status === "streaming";
  const isBranchNode = branchMessageIds.includes(messageId);
  const nav = siblingNav[messageId];

  type SiblingNav = ReturnType<typeof useChatContext>["siblingNav"][string];

  const shouldShow = Boolean(isBranchNode && nav && nav.siblingTotal > 1);

  const [isRendered, setIsRendered] = React.useState(shouldShow);
  const [isVisible, setIsVisible] = React.useState(shouldShow);
  const [displayNav, setDisplayNav] = React.useState<SiblingNav | null>(nav ?? null);

  // 关键：支持分支切换栏的淡入淡出（避免条件渲染导致“瞬间消失”）
  React.useEffect(() => {
    if (nav) setDisplayNav(nav);
  }, [nav]);

  React.useEffect(() => {
    if (shouldShow) {
      setIsRendered(true);
      // 下一帧再显示，确保 transition 能触发
      const raf = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(raf);
    }

    setIsVisible(false);
    const t = window.setTimeout(() => setIsRendered(false), 200);
    return () => window.clearTimeout(t);
  }, [shouldShow]);

  if (!isRendered) return null;

  const effectiveNav = nav ?? displayNav;
  if (!effectiveNav) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 transition-opacity duration-200",
        isVisible ? "opacity-100" : "opacity-0"
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        disabled={isBusy || !effectiveNav.prevSiblingId}
        aria-label="切换到前一个分支"
        title="切换到前一个分支"
        onClick={() => switchSibling(messageId, "prev")}
      >
        <ChevronLeft className="size-3.5" />
      </Button>

      <span className="text-xs tabular-nums text-muted-foreground select-none">{`${effectiveNav.siblingIndex}/${effectiveNav.siblingTotal}`}</span>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        disabled={isBusy || !effectiveNav.nextSiblingId}
        aria-label="切换到后一个分支"
        title="切换到后一个分支"
        onClick={() => switchSibling(messageId, "next")}
      >
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  );
}
