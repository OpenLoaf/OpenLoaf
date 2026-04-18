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
import { useChatActions, useChatSession, useChatMessages, useChatTools } from "../../../context";
import { trpc } from "@/utils/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CLIENT_HEADERS } from "@/lib/client-headers";
import { resolveServerUrl } from "@/utils/server-url";
import { ConfirmationAction } from "@/components/ai-elements/confirmation";
import { suggestRule } from "@openloaf/api/types/toolApproval";

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

/** Render approval actions for a tool request. */
export default function ToolApprovalActions({ approvalId, size = "sm" }: ToolApprovalActionsProps) {
  const { t } = useTranslation("ai");
  const { messages } = useChatMessages();
  const { updateMessage, addToolApprovalResponse } = useChatActions();
  const {
    toolParts,
    upsertToolPart,
    queueToolApprovalPayload,
    clearToolApprovalPayload,
    continueAfterToolApprovals,
  } = useChatTools();
  const { sessionId, projectId } = useChatSession();
  const queryClient = useQueryClient();
  const addProjectRuleMutation = useMutation({
    ...trpc.project.addToolApprovalRule.mutationOptions(),
  });
  const addGlobalRuleMutation = useMutation({
    ...trpc.settings.addToolApprovalRule.mutationOptions(),
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const toolSnapshot = React.useMemo(
    () => Object.values(toolParts).find((part) => part.approval?.id === approvalId),
    [toolParts, approvalId]
  );
  // 中文注释：`toolParts` 仅在前端运行态同步，历史消息恢复或测试 harness 等场景下
  // 可能为空；此时走消息链回落，用 approvalId 反查 toolCallId，保证
  // queueToolApprovalPayload(toolCallId,...) 不被空 id 短路。
  const toolCallId = React.useMemo(() => {
    if (typeof toolSnapshot?.toolCallId === "string" && toolSnapshot.toolCallId) {
      return toolSnapshot.toolCallId;
    }
    for (const message of messages ?? []) {
      const parts = Array.isArray((message as any)?.parts) ? (message as any).parts : [];
      for (const part of parts) {
        if (part?.approval?.id === approvalId && typeof part?.toolCallId === "string") {
          return part.toolCallId as string;
        }
      }
    }
    return "";
  }, [toolSnapshot, messages, approvalId]);
  const isDecided =
    toolSnapshot?.approval?.approved === true || toolSnapshot?.approval?.approved === false;
  // 中文注释：审批等待期间 stream 已经在服务端挂起，按钮必须可点（否则用户的
  // Approve/Reject 被 chat.status='streaming' 卡住，等同于审批功能失灵）。
  // 除本地 `isSubmitting`/`isDecided` 外，不再受上层 chat.status 限制。
  const disabled = isSubmitting || isDecided;
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
    return suggestRule(toolId, input);
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
          // 中文注释：approved=false 时同步把 state 切到 output-denied，
          // 让 <ConfirmationRejected> 分支（要求 state 属于 approval-responded /
          // output-denied / output-available）能展示"已拒绝执行"视觉反馈。
          // approved=true 时不动 state —— 等 server stream 回写 output-available。
          const nextState = approved === false ? "output-denied" : part.state;
          return {
            ...part,
            state: nextState,
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
        // approved=false 时同步 state → output-denied（同 updateApprovalInMessages），
        // 让 Confirmation/ConfirmationRejected 分支立即显示"已拒绝执行"文案。
        const nextState = approved === false ? ("output-denied" as const) : part.state;
        upsertToolPart(toolCallId, {
          ...part,
          state: nextState,
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
      // 中文注释：允许/拒绝都必须 queue payload —— 后端 stripPendingToolParts
      // 依据 toolApprovalPayloads[toolCallId] 才能把 approval-requested 的 tool part
      // 转成 output-available 塞回模型链；缺了这一步 tool part 会被整段丢弃。
      queueToolApprovalPayload(toolCallId, { approved: true });
      await continueAfterToolApprovals();
      clearToolApprovalPayload(toolCallId);
    }
  }, [
    approvalId,
    updateApprovalSnapshot,
    updateApprovalInMessages,
    addToolApprovalResponse,
    postSubAgentApprovalAck,
    toolSnapshot?.subAgentToolCallId,
    queueToolApprovalPayload,
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
        // 项目对话写项目白名单，临时对话写全局临时对话白名单。
        // 两个 mutation 都是后端原子的 read-modify-write，避免并发 lost update。
        // 写规则失败时只 console.warn 不中断 approve —— 用户已经表达"始终允许"的意图，
        // 至少应完成本次放行，规则丢失属于降级体验。
        try {
          if (projectId) {
            await addProjectRuleMutation.mutateAsync({
              projectId,
              rule: suggestedRule,
              behavior: "allow",
            });
            const aiSettingsOptions = trpc.project.getAiSettings.queryOptions({ projectId });
            queryClient.invalidateQueries({ queryKey: aiSettingsOptions.queryKey });
          } else {
            await addGlobalRuleMutation.mutateAsync({
              rule: suggestedRule,
              behavior: "allow",
            });
          }
        } catch (err) {
          console.warn("[toolApproval] failed to persist allow rule", err);
        }
        await performApprove();
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      isSubmitting,
      isDecided,
      suggestedRule,
      performApprove,
      projectId,
      queryClient,
      addProjectRuleMutation,
      addGlobalRuleMutation,
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
          // 中文注释：必须先 queue {approved:false} 再 continue —— 后端才能把
          // approval-requested tool part 原地改写成 output-available(output={approved:false})
          // 喂给 LLM，让 LLM 感知"用户拒绝"并作出响应（否则整段 tool part 被删，
          // 表现为"点拒绝没反应"）。
          queueToolApprovalPayload(toolCallId, { approved: false });
          await continueAfterToolApprovals();
          clearToolApprovalPayload(toolCallId);
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
      sessionId,
      updateApprovalSnapshot,
      updateApprovalInMessages,
      addToolApprovalResponse,
      updateApprovalMutation,
      postSubAgentApprovalAck,
      toolSnapshot?.subAgentToolCallId,
      queueToolApprovalPayload,
      clearToolApprovalPayload,
      continueAfterToolApprovals,
      toolCallId,
    ],
  );

  const isLarge = size === "default";

  return (
    <div className="ml-auto flex flex-wrap items-center gap-2" data-testid="tool-approval-actions">
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
        data-testid="tool-approval-approve"
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
          data-testid="tool-approval-always-allow"
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
        data-testid="tool-approval-reject"
      >
        {t('tool.reject')}
      </ConfirmationAction>
    </div>
  );
}
