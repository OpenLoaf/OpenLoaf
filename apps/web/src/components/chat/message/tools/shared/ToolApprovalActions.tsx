"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useChatContext } from "../../../ChatProvider";

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
      await chat.addToolApprovalResponse({ id: approvalId, approved: true });
      // 中文注释：审批回应写入后需要触发 sendMessage，继续后续工具执行与生成。
      await chat.sendMessage();
    },
    [chat, approvalId],
  );

  const handleReject = React.useCallback(
    async (event: React.MouseEvent) => {
      // 中文注释：summary 内点击按钮不应触发折叠开关。
      event.preventDefault();
      event.stopPropagation();
      await chat.addToolApprovalResponse({ id: approvalId, approved: false });
      await chat.sendMessage();
    },
    [chat, approvalId],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="text-[11px] text-muted-foreground">需要审批</div>
      <Button type="button" size="sm" variant="default" disabled={disabled} onClick={handleApprove}>
        允许
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={handleReject}>
        拒绝
      </Button>
    </div>
  );
}
