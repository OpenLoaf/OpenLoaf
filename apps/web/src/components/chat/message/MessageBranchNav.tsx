"use client";

import * as React from "react";
import { Button } from "@tenas-ai/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useChatActions, useChatSession, useChatState } from "../context";

export default function MessageBranchNav({ messageId }: { messageId: string }) {
  const { status } = useChatState();
  const { siblingNav } = useChatSession();
  const { switchSibling } = useChatActions();

  const isBusy = status === "submitted" || status === "streaming";
  const nav = siblingNav[messageId];

  type SiblingNav = (typeof siblingNav)[string];

  // 消息列表只渲染“当前主链”，因此不再需要 branchMessageIds 作为额外判定；
  // 只要 siblingNav 提供了信息，就应显示（避免切分支时状态更新顺序导致短暂消失）。
  const [isRendered, setIsRendered] = React.useState(Boolean(nav && nav.siblingTotal > 1));
  const [isVisible, setIsVisible] = React.useState(Boolean(nav && nav.siblingTotal > 1));
  const [displayNav, setDisplayNav] = React.useState<SiblingNav | null>(nav ?? null);

  // 关键：支持分支切换栏的淡入淡出（避免条件渲染导致“瞬间消失”）
  React.useEffect(() => {
    if (nav) setDisplayNav(nav);
  }, [nav]);

  const effectiveNav = nav ?? displayNav;
  const shouldShow = Boolean(effectiveNav && effectiveNav.siblingTotal > 1);

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

  if (!effectiveNav) return null;

  return (
    <div
      className={cn(
        "inline-flex select-none items-center gap-1 transition-opacity duration-200",
        isVisible ? "opacity-100" : "opacity-0"
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-6 w-6 text-muted-foreground hover:text-foreground"
        disabled={isBusy || !effectiveNav.prevSiblingId}
        aria-label="切换到前一个分支"
        title="切换到前一个分支"
        onClick={() => switchSibling(messageId, "prev", effectiveNav ?? undefined)}
      >
        <ChevronLeft className="size-3" />
      </Button>

      <span className="text-xs tabular-nums text-muted-foreground select-none">{`${effectiveNav.siblingIndex}/${effectiveNav.siblingTotal}`}</span>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-6 w-6 text-muted-foreground hover:text-foreground"
        disabled={isBusy || !effectiveNav.nextSiblingId}
        aria-label="切换到后一个分支"
        title="切换到后一个分支"
        onClick={() => switchSibling(messageId, "next", effectiveNav ?? undefined)}
      >
        <ChevronRight className="size-3" />
      </Button>
    </div>
  );
}
