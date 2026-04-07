/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import { useChatActions, useChatSession, useChatMessages, useChatStatus, useChatTools } from "../../../context";
import { trpc } from "@/utils/trpc";
import { useMutation } from "@tanstack/react-query";
import { CLIENT_HEADERS } from "@/lib/client-headers";
import { resolveServerUrl } from "@/utils/server-url";
import { ConfirmationAction } from "@/components/ai-elements/confirmation";

interface ToolApprovalActionsProps {
  /** Approval id to submit. */
  approvalId: string;
  /** Button size variant. */
  size?: "sm" | "default";
}

/** Extract tool ID from snapshot type (e.g. "tool-Write" → "Write"). */
function extractToolId(type?: string): string | null {
  if (!type) return null;
  if (type.startsWith("tool-")) return type.slice(5);
  return null;
}

/** Generate a suggested allow rule from a tool call (frontend mirror of server suggestRule). */
function suggestAllowRule(toolId: string, input: Record<string, unknown>): string | null {
  if (toolId === "Bash" && typeof input.command === "string") {
    const tokens = input.command.trim().split(/\s+/);
    if (tokens.length >= 2) {
      const first = tokens[0]!;
      const second = tokens[1]!;
      if (/^[a-zA-Z][\w-]*$/.test(second) && second.length < 20) {
        return `Bash(${first} ${second} *)`;
      }
    }
    if (tokens[0]) return `Bash(${tokens[0]} *)`;
    return "Bash";
  }
  const filePath = typeof input.file_path === "string" ? input.file_path : null;
  if ((toolId === "Edit" || toolId === "Write") && filePath) {
    const lastSlash = filePath.lastIndexOf("/");
    if (lastSlash > 0) return `${toolId}(${filePath.substring(0, lastSlash)}/**)`;
    return toolId;
  }
  return toolId;
}

/** Render approval actions for a tool request. */
export default function ToolApprovalActions({ approvalId, size = "sm" }: ToolApprovalActionsProps) {
  const { t } = useTranslation("ai");
  const { messages } = useChatMessages();
  const { status } = useChatStatus();
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
  const suggestedRule = React.useMemo(() => {
    if (!toolSnapshot) return null;
    const toolId = extractToolId(toolSnapshot.type);
    if (!toolId) return null;
    const input =
      typeof toolSnapshot.input === "object" && toolSnapshot.input
        ? (toolSnapshot.input as Record<string, unknown>)
        : {};
    return suggestAllowRule(toolId, input);
  }, [toolSnapshot]);

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

  /** Submit approval ack for SubAgent flow. */
  const postSubAgentApprovalAck = React.useCallback(
    async (approved: boolean, subAgentToolCallId: string) => {
      const baseUrl = resolveServerUrl();
      const endpoint = baseUrl ? `${baseUrl}/ai/tools/ack` : "/ai/tools/ack";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", ...CLIENT_HEADERS },
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
        throw new Error(text || "SubAgent approval ack failed");
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

  /** Core approve logic shared between "允许" and "始终允许". */
  const performApprove = React.useCallback(async () => {
    updateApprovalSnapshot(true);
    updateApprovalInMessages(true);
    const subAgentToolCallId =
      typeof toolSnapshot?.subAgentToolCallId === "string"
        ? toolSnapshot.subAgentToolCallId
        : "";
    if (subAgentToolCallId) {
      await postSubAgentApprovalAck(true, subAgentToolCallId);
    } else {
      await addToolApprovalResponse({ id: approvalId, approved: true });
      clearToolApprovalPayload(toolCallId);
      await continueAfterToolApprovals();
    }
  }, [
    approvalId,
    updateApprovalSnapshot,
    updateApprovalInMessages,
    addToolApprovalResponse,
    postSubAgentApprovalAck,
    toolSnapshot?.subAgentToolCallId,
    clearToolApprovalPayload,
    continueAfterToolApprovals,
    toolCallId,
  ]);

  const handleApprove = React.useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (isSubmitting || isDecided) return;
      setIsSubmitting(true);
      try {
        await performApprove();
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, isDecided, performApprove],
  );

  const handleAlwaysAllow = React.useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (isSubmitting || isDecided || !suggestedRule) return;
      setIsSubmitting(true);
      try {
        // Fire-and-forget: 添加规则到全局设置
        const baseUrl = resolveServerUrl();
        const endpoint = baseUrl
          ? `${baseUrl}/api/trpc/settings.addToolApprovalRule`
          : "/api/trpc/settings.addToolApprovalRule";
        fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json", ...CLIENT_HEADERS },
          body: JSON.stringify({ rule: suggestedRule, behavior: "allow" }),
        }).catch(() => {});
        await performApprove();
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, isDecided, suggestedRule, performApprove],
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
    <div className="ml-auto flex flex-wrap items-center gap-2">
      <ConfirmationAction
        type="button"
        size={size}
        variant="default"
        className={
          isLarge
            ? "h-8 rounded-3xl px-3 text-xs bg-foreground text-background hover:bg-foreground/90 border-0"
            : "h-6 px-2 text-[10px]"
        }
        disabled={disabled}
        onClick={handleApprove}
      >
        {t('tool.approve')}
      </ConfirmationAction>
      {suggestedRule && (
        <ConfirmationAction
          type="button"
          size={size}
          variant="outline"
          className={
            isLarge
              ? "h-8 rounded-3xl px-3 text-xs"
              : "h-6 px-2 text-[10px]"
          }
          disabled={disabled}
          onClick={handleAlwaysAllow}
          title={suggestedRule}
        >
          {t('tool.alwaysAllow')}
        </ConfirmationAction>
      )}
      <ConfirmationAction
        type="button"
        size={size}
        variant={isLarge ? "ghost" : "outline"}
        className={
          isLarge
            ? "h-8 rounded-3xl px-3 text-xs text-muted-foreground hover:text-foreground"
            : "h-6 px-2 text-[10px]"
        }
        disabled={disabled}
        onClick={handleReject}
      >
        {t('tool.reject')}
      </ConfirmationAction>
    </div>
  );
}
