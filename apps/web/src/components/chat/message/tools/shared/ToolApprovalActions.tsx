"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useChatContext } from "../../../ChatProvider";
import { countPendingToolApprovals, hasRejectedToolApproval } from "./tool-utils";

interface ToolApprovalActionsProps {
  /** Approval id to submit. */
  approvalId: string;
}

/** Render approval actions for a tool request. */
export default function ToolApprovalActions({ approvalId }: ToolApprovalActionsProps) {
  const chat = useChatContext();
  const disabled = chat.status === "streaming" || chat.status === "submitted";

  const handleApprove = React.useCallback(
    async (event: React.MouseEvent) => {
      // 中文注释：summary 内点击按钮不应触发折叠开关。
      event.preventDefault();
      event.stopPropagation();
      const pendingBefore = countPendingToolApprovals(chat.messages ?? []);
      const hasRejected = hasRejectedToolApproval(chat.messages ?? []);
      await chat.addToolApprovalResponse({ id: approvalId, approved: true });
      if (pendingBefore <= 1 && !hasRejected) {
        // 中文注释：仅在最后一个审批完成后继续执行，避免多审批被一次通过。
        await chat.sendMessage();
      }
    },
    [chat, approvalId],
  );

  const handleReject = React.useCallback(
    async (event: React.MouseEvent) => {
      // 中文注释：summary 内点击按钮不应触发折叠开关。
      event.preventDefault();
      event.stopPropagation();
      await chat.addToolApprovalResponse({ id: approvalId, approved: false });
    },
    [chat, approvalId],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="default" disabled={disabled} onClick={handleApprove}>
        允许
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={handleReject}>
        拒绝
      </Button>
    </div>
  );
}
