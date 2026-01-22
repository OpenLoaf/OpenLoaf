"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useChatContext } from "../../../ChatProvider";
import { useTabs } from "@/hooks/use-tabs";
import { countPendingToolApprovals, hasRejectedToolApproval } from "./tool-utils";
import { trpc } from "@/utils/trpc";
import { useMutation } from "@tanstack/react-query";

interface ToolApprovalActionsProps {
  /** Approval id to submit. */
  approvalId: string;
}

/** Render approval actions for a tool request. */
export default function ToolApprovalActions({ approvalId }: ToolApprovalActionsProps) {
  const chat = useChatContext();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const toolSnapshot = useTabs((state) => {
    const tabId = chat.tabId;
    if (!tabId) return undefined;
    const parts = state.toolPartsByTabId[tabId] ?? {};
    return Object.values(parts).find((part) => part.approval?.id === approvalId);
  });
  const isDecided =
    toolSnapshot?.approval?.approved === true || toolSnapshot?.approval?.approved === false;
  const disabled = isSubmitting || isDecided || chat.status === "streaming" || chat.status === "submitted";
  const updateApprovalMutation = useMutation({
    ...trpc.chatmessage.updateOneChatMessage.mutationOptions(),
  });

  const updateApprovalInMessages = React.useCallback(
    (approved: boolean) => {
      const messages = chat.messages ?? [];
      for (const message of messages) {
        const parts = Array.isArray((message as any)?.parts) ? (message as any).parts : [];
        const hasTarget = parts.some((part: any) => part?.approval?.id === approvalId);
        if (!hasTarget) continue;
        const nextParts = parts.map((part: any) => {
          if (part?.approval?.id !== approvalId) return part;
          return {
            ...part,
            approval: { ...part.approval, approved },
          };
        });
        chat.updateMessage(message.id, { parts: nextParts });
        return { messageId: message.id, nextParts };
      }
      return null;
    },
    [chat, approvalId],
  );

  const updateApprovalSnapshot = React.useCallback(
    (approved: boolean) => {
      const tabId = chat.tabId;
      if (!tabId) return;
      const state = useTabs.getState();
      const toolParts = state.toolPartsByTabId[tabId] ?? {};
      for (const [toolCallId, part] of Object.entries(toolParts)) {
        if (part?.approval?.id !== approvalId) continue;
        // 中文注释：本地先更新审批状态，避免按钮和边框滞后。
        state.upsertToolPart(tabId, toolCallId, {
          ...part,
          approval: { ...part.approval, approved },
        });
        break;
      }
    },
    [chat.tabId, approvalId],
  );

  const handleApprove = React.useCallback(
    async (event: React.MouseEvent) => {
      // 中文注释：summary 内点击按钮不应触发折叠开关。
      event.preventDefault();
      event.stopPropagation();
      if (isSubmitting || isDecided) return;
      setIsSubmitting(true);
      updateApprovalSnapshot(true);
      updateApprovalInMessages(true);
      const pendingBefore = countPendingToolApprovals(chat.messages ?? []);
      const hasRejected = hasRejectedToolApproval(chat.messages ?? []);
      try {
        await chat.addToolApprovalResponse({ id: approvalId, approved: true });
        if (pendingBefore <= 1 && !hasRejected) {
          // 中文注释：仅在最后一个审批完成后继续执行，避免多审批被一次通过。
          await chat.sendMessage();
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [chat, approvalId, isSubmitting, isDecided, updateApprovalSnapshot],
  );

  const handleReject = React.useCallback(
    async (event: React.MouseEvent) => {
      // 中文注释：summary 内点击按钮不应触发折叠开关。
      event.preventDefault();
      event.stopPropagation();
      if (isSubmitting || isDecided) return;
      setIsSubmitting(true);
      updateApprovalSnapshot(false);
      const approvalUpdate = updateApprovalInMessages(false);
      try {
        await chat.addToolApprovalResponse({ id: approvalId, approved: false });
        if (approvalUpdate) {
          // 中文注释：拒绝审批后立即落库，避免刷新后仍显示“待审批”。
          try {
            await updateApprovalMutation.mutateAsync({
              where: { id: approvalUpdate.messageId },
              data: { parts: approvalUpdate.nextParts as any },
            });
          } catch {
            // 中文注释：落库失败时保留本地状态，避免阻断拒绝流程。
          }
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [chat, approvalId, isSubmitting, isDecided, updateApprovalSnapshot, updateApprovalMutation],
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
