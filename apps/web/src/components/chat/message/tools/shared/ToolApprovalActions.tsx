"use client";

import * as React from "react";
import { Button } from "@tenas-ai/ui/button";
import { useChatActions, useChatState, useChatTools } from "../../../context";
import { countPendingToolApprovals, hasRejectedToolApproval } from "./tool-utils";
import { trpc } from "@/utils/trpc";
import { useMutation } from "@tanstack/react-query";
import { resolveServerUrl } from "@/utils/server-url";

interface ToolApprovalActionsProps {
  /** Approval id to submit. */
  approvalId: string;
}

/** Render approval actions for a tool request. */
export default function ToolApprovalActions({ approvalId }: ToolApprovalActionsProps) {
  const { messages, status } = useChatState();
  const { updateMessage, addToolApprovalResponse, sendMessage } = useChatActions();
  const { toolParts, upsertToolPart } = useChatTools();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const toolSnapshot = React.useMemo(
    () => Object.values(toolParts).find((part) => part.approval?.id === approvalId),
    [toolParts, approvalId]
  );
  const isDecided =
    toolSnapshot?.approval?.approved === true || toolSnapshot?.approval?.approved === false;
  // 逻辑：子代理审批会阻塞主流式，需允许在 streaming 状态下交互。
  const isSubAgentApproval = Boolean(toolSnapshot?.subAgentToolCallId);
  const disabled =
    isSubmitting ||
    isDecided ||
    (!isSubAgentApproval && (status === "streaming" || status === "submitted"));
  const updateApprovalMutation = useMutation({
    ...trpc.chatmessage.updateOneChatMessage.mutationOptions(),
  });

  const updateApprovalInMessages = React.useCallback(
    (approved: boolean) => {
      const nextMessages = messages ?? [];
      for (const message of nextMessages) {
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
        updateMessage(message.id, { parts: nextParts });
        return { messageId: message.id, nextParts };
      }
      return null;
    },
    [messages, updateMessage, approvalId],
  );

  /** Submit approval ack for sub-agent flow. */
  const postSubAgentApprovalAck = React.useCallback(
    async (approved: boolean, subAgentToolCallId: string) => {
      const baseUrl = resolveServerUrl();
      const endpoint = baseUrl ? `${baseUrl}/ai/tools/ack` : "/ai/tools/ack";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          toolCallId: approvalId,
          status: "success",
          output: { approvalId, approved },
          requestedAt: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || "sub-agent approval ack failed");
      }
    },
    [approvalId],
  );

  const updateApprovalSnapshot = React.useCallback(
    (approved: boolean) => {
      for (const [toolCallId, part] of Object.entries(toolParts)) {
        if (part?.approval?.id !== approvalId) continue;
        // 中文注释：本地先更新审批状态，避免按钮和边框滞后。
        upsertToolPart(toolCallId, {
          ...part,
          approval: { ...part.approval, approved },
        });
        break;
      }
    },
    [toolParts, upsertToolPart, approvalId],
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
      const pendingBefore = countPendingToolApprovals(messages ?? []);
      const hasRejected = hasRejectedToolApproval(messages ?? []);
      const subAgentToolCallId =
        typeof toolSnapshot?.subAgentToolCallId === "string"
          ? toolSnapshot.subAgentToolCallId
          : "";
      try {
        if (subAgentToolCallId) {
          // 中文注释：子代理审批走前端 ack 回传，阻塞子代理工具继续执行。
          await postSubAgentApprovalAck(true, subAgentToolCallId);
        } else {
          await addToolApprovalResponse({ id: approvalId, approved: true });
          if (pendingBefore <= 1 && !hasRejected) {
            // 中文注释：仅在最后一个审批完成后继续执行，避免多审批被一次通过。
            await sendMessage(undefined as any);
          }
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      approvalId,
      isSubmitting,
      isDecided,
      updateApprovalSnapshot,
      updateApprovalInMessages,
      messages,
      addToolApprovalResponse,
      sendMessage,
    ],
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
      const subAgentToolCallId =
        typeof toolSnapshot?.subAgentToolCallId === "string"
          ? toolSnapshot.subAgentToolCallId
          : "";
      try {
        if (subAgentToolCallId) {
          // 中文注释：子代理审批走前端 ack 回传，阻塞子代理工具继续执行。
          await postSubAgentApprovalAck(false, subAgentToolCallId);
        } else {
          await addToolApprovalResponse({ id: approvalId, approved: false });
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
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      approvalId,
      isSubmitting,
      isDecided,
      updateApprovalSnapshot,
      updateApprovalInMessages,
      addToolApprovalResponse,
      updateApprovalMutation,
      postSubAgentApprovalAck,
      toolSnapshot?.subAgentToolCallId,
    ],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="default"
        className="h-6 px-2 text-[10px]"
        disabled={disabled}
        onClick={handleApprove}
      >
        允许
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 px-2 text-[10px]"
        disabled={disabled}
        onClick={handleReject}
      >
        拒绝
      </Button>
    </div>
  );
}
