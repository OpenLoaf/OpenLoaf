"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatContext } from "../../ChatProvider";

type TestApprovalToolPart = {
  toolName?: string;
  type: string;
  state?: string;
  approval?: { id?: string; approved?: boolean; reason?: string };
};

/**
 * Render a minimal approval UI for the test-approval tool.
 */
export function TestApprovalTool({ part }: { part: TestApprovalToolPart }) {
  const chat = useChatContext();
  const approvalId = typeof part.approval?.id === "string" ? part.approval?.id : undefined;
  const showActions = part.state === "approval-requested" && Boolean(approvalId);
  // 中文注释：审批中展示彩虹外框，审批完成后自动移除。
  const showThinkingBorder = showActions;
  const isRejected = part.approval?.approved === false;
  const thinkingBorderClassName = showThinkingBorder
    ? "tenas-thinking-border tenas-thinking-border-on border border-transparent"
    : isRejected
      ? "border border-destructive/50 bg-destructive/5"
    : undefined;
  const thinkingBorderStyle = showThinkingBorder
    ? ({ ["--tenas-thinking-border-fill" as any]: "var(--color-muted)" } as React.CSSProperties)
    : undefined;
  const approved = part.approval?.approved;
  const statusLabel =
    approved === true
      ? "已允许"
      : approved === false
        ? "已拒绝"
        : part.state === "approval-requested"
          ? "等待审批"
          : part.state
            ? String(part.state)
            : "未知状态";

  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-foreground",
        thinkingBorderClassName,
      )}
      style={thinkingBorderStyle}
    >
      <span className="text-xs text-muted-foreground">测试审批</span>
      <span className="text-xs text-muted-foreground/80">•</span>
      <span className="text-xs text-muted-foreground">{statusLabel}</span>
      {showActions ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={chat.status === "streaming" || chat.status === "submitted"}
            onClick={async () => {
              await chat.addToolApprovalResponse({ id: approvalId!, approved: true });
              // 审批回应写入后需要触发 sendMessage，继续后续工具执行与生成。
              await chat.sendMessage();
            }}
          >
            允许
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={chat.status === "streaming" || chat.status === "submitted"}
            onClick={async () => {
              await chat.addToolApprovalResponse({ id: approvalId!, approved: false });
              await chat.sendMessage();
            }}
          >
            拒绝
          </Button>
        </div>
      ) : null}
    </div>
  );
}
