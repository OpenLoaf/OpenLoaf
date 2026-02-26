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
import { useChatActions, useChatSession, useChatState, useChatTools } from "../../../context";
import { trpc } from "@/utils/trpc";
import { useMutation } from "@tanstack/react-query";
import { resolveServerUrl } from "@/utils/server-url";
import { ConfirmationAction } from "@/components/ai-elements/confirmation";

interface ToolApprovalActionsProps {
  /** Approval id to submit. */
  approvalId: string;
  /** Button size variant. */
  size?: "sm" | "default";
}

/** Render approval actions for a tool request. */
export default function ToolApprovalActions({ approvalId, size = "sm" }: ToolApprovalActionsProps) {
  const { messages, status } = useChatState();
  const { updateMessage, addToolApprovalResponse } = useChatActions();
  const {
    toolParts,
    upsertToolPart,
    clearToolApprovalPayload,
    continueAfterToolApprovals,
  } = useChatTools();
  const { sessionId } = useChatSession();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const toolSnapshot = React.useMemo(
    () => Object.values(toolParts).find((part) => part.approval?.id === approvalId),
    [toolParts, approvalId]
  );
  const toolCallId =
    typeof toolSnapshot?.toolCallId === "string" ? toolSnapshot.toolCallId : "";
  const isDecided =
    toolSnapshot?.approval?.approved === true || toolSnapshot?.approval?.approved === false;
  // 中文注释：子代理审批会阻塞主流式，需允许在 streaming 状态下交互。
  const isSubAgentApproval = Boolean(toolSnapshot?.subAgentToolCallId);
  const disabled =
    isSubmitting ||
    isDecided ||
    (!isSubAgentApproval && (status === "streaming" || status === "submitted"));
  const updateApprovalMutation = useMutation({
    ...trpc.chat.updateMessageParts.mutationOptions(),
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
          clearToolApprovalPayload(toolCallId);
          await continueAfterToolApprovals();
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
      postSubAgentApprovalAck,
      toolSnapshot?.subAgentToolCallId,
      clearToolApprovalPayload,
      continueAfterToolApprovals,
      toolCallId,
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
          clearToolApprovalPayload(toolCallId);
          await continueAfterToolApprovals();
          if (approvalUpdate) {
            // 中文注释：拒绝审批后立即落库，避免刷新后仍显示“待审批”。
            try {
              await updateApprovalMutation.mutateAsync({
                sessionId,
                messageId: approvalUpdate.messageId,
                parts: approvalUpdate.nextParts as any,
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
      clearToolApprovalPayload,
      continueAfterToolApprovals,
      toolCallId,
    ],
  );

  const isLarge = size === "default";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ConfirmationAction
        type="button"
        size={size}
        variant="default"
        className={
          isLarge
            ? "h-8 rounded-md px-3 text-xs bg-emerald-500 text-white hover:bg-emerald-600 border-0"
            : "h-6 px-2 text-[10px]"
        }
        disabled={disabled}
        onClick={handleApprove}
      >
        允许
      </ConfirmationAction>
      <ConfirmationAction
        type="button"
        size={size}
        variant={isLarge ? "ghost" : "outline"}
        className={
          isLarge
            ? "h-8 rounded-md px-3 text-xs text-muted-foreground hover:text-foreground"
            : "h-6 px-2 text-[10px]"
        }
        disabled={disabled}
        onClick={handleReject}
      >
        拒绝
      </ConfirmationAction>
    </div>
  );
}
