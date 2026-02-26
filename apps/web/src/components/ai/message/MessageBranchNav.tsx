/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useChatActions, useChatSession, useChatState } from "../context";
import {
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
} from "@/components/ai-elements/message";

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
  const totalBranches = Math.max(1, effectiveNav.siblingTotal);
  const currentBranch = Math.min(
    totalBranches - 1,
    Math.max(0, effectiveNav.siblingIndex - 1),
  );

  const handleBranchChange = (nextBranch: number) => {
    if (isBusy || nextBranch === currentBranch) return;
    const isPrev =
      (currentBranch === 0 && nextBranch === totalBranches - 1) ||
      nextBranch < currentBranch;
    switchSibling(messageId, isPrev ? "prev" : "next", effectiveNav ?? undefined);
  };

  return (
    <div
      className={cn(
        "inline-flex select-none items-center gap-1 transition-opacity duration-200",
        isVisible ? "opacity-100" : "opacity-0"
      )}
    >
      <MessageBranch
        key={`${messageId}:${effectiveNav.siblingIndex}:${effectiveNav.siblingTotal}:${effectiveNav.prevSiblingId ?? ""}:${effectiveNav.nextSiblingId ?? ""}`}
        defaultBranch={currentBranch}
        onBranchChange={handleBranchChange}
        className="w-auto"
      >
        <MessageBranchSelector className="items-center gap-1">
          <MessageBranchPrevious
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            disabled={isBusy || !effectiveNav.prevSiblingId}
            aria-label="切换到前一个分支"
            title="切换到前一个分支"
          />
          <MessageBranchPage className="px-0 text-xs tabular-nums text-muted-foreground select-none">
            {`${effectiveNav.siblingIndex}/${effectiveNav.siblingTotal}`}
          </MessageBranchPage>
          <MessageBranchNext
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            disabled={isBusy || !effectiveNav.nextSiblingId}
            aria-label="切换到后一个分支"
            title="切换到后一个分支"
          />
        </MessageBranchSelector>
        <MessageBranchContent className="hidden">
          {Array.from({ length: totalBranches }, (_, index) => (
            <div key={`branch-${index}`} />
          ))}
        </MessageBranchContent>
      </MessageBranch>
    </div>
  );
}
