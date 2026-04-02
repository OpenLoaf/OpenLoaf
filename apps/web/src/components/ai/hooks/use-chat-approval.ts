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

import React from "react";
import type { UIMessage } from "@ai-sdk/react";
import { useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useChatRuntime, type ToolPartSnapshot } from "@/hooks/use-chat-runtime";
import {
  findLastAssistantMessage,
  mapToolPartsFromMessage,
  collectApprovalToolCallIds,
  isToolApprovalResolved,
} from "../utils/message-predicates";

// 提供稳定的空对象，避免 useSyncExternalStore 报错。
const EMPTY_TOOL_PARTS: Record<string, ToolPartSnapshot> = {};

type UseChatApprovalOptions = {
  sessionId: string;
  tabId?: string;
  chat: {
    messages: UIMessage[];
    sendMessage: (...args: any[]) => any;
    stop: () => void;
  };
  basicRef: React.MutableRefObject<{ autoApproveTools?: boolean }>;
  resetBranchSnapshotReceipt: () => void;
  updateMessage: (id: string, updates: Partial<UIMessage>) => void;
  upsertToolPartForTab: (toolCallId: string, next: any) => void;
  setStepThinking: React.Dispatch<React.SetStateAction<boolean>>;
  abortSubAgentStreams?: () => void;
};

export function useChatApproval({
  sessionId,
  tabId,
  chat,
  basicRef,
  resetBranchSnapshotReceipt,
  updateMessage,
  upsertToolPartForTab,
  setStepThinking,
  abortSubAgentStreams,
}: UseChatApprovalOptions) {
  /** Queued approval payloads keyed by tool call id. */
  const approvalPayloadsRef = React.useRef<Record<string, Record<string, unknown>>>({});
  /** Track ongoing approval submission to avoid duplicate sends. */
  const approvalSubmitInFlightRef = React.useRef(false);
  /** Remember the tool call IDs included in the last approval continuation. */
  const lastApprovalSubmittedKeyRef = React.useRef<string>("");

  const updateApprovalMutation = useMutation({
    ...trpc.chat.updateMessageParts.mutationOptions(),
  });

  React.useEffect(() => {
    // 会话切换时清空审批暂存
    approvalPayloadsRef.current = {};
    approvalSubmitInFlightRef.current = false;
    lastApprovalSubmittedKeyRef.current = "";
  }, [sessionId]);

  /** Queue a tool approval payload for the next continuation. */
  const queueToolApprovalPayload = React.useCallback(
    (toolCallId: string, payload: Record<string, unknown>) => {
      if (!toolCallId) return;
      approvalPayloadsRef.current[toolCallId] = payload;
    },
    []
  );

  /** Clear a queued tool approval payload. */
  const clearToolApprovalPayload = React.useCallback((toolCallId: string) => {
    if (!toolCallId) return;
    delete approvalPayloadsRef.current[toolCallId];
  }, []);

  /** Attempt to continue chat after all approvals are resolved. */
  const continueAfterToolApprovals = React.useCallback(async () => {
    const messages = (chat.messages ?? []) as UIMessage[];
    const lastAssistant = findLastAssistantMessage(messages);
    if (!lastAssistant) return;
    const assistantId = typeof (lastAssistant as any)?.id === "string"
      ? String((lastAssistant as any).id)
      : "";
    if (!assistantId) return;
    if (approvalSubmitInFlightRef.current) return;

    const runtimeToolParts = tabId
      ? useChatRuntime.getState().toolPartsByTabId[tabId] ?? EMPTY_TOOL_PARTS
      : EMPTY_TOOL_PARTS;
    const toolPartById = mapToolPartsFromMessage(lastAssistant);
    const approvalToolCallIds = collectApprovalToolCallIds(lastAssistant, runtimeToolParts);
    const payloadToolCallIds = Object.keys(approvalPayloadsRef.current);
    const mergedToolCallIds = Array.from(
      new Set([...approvalToolCallIds, ...payloadToolCallIds]),
    );
    if (mergedToolCallIds.length === 0) return;
    const currentKey = mergedToolCallIds.slice().sort().join(",");
    if (lastApprovalSubmittedKeyRef.current === currentKey) return;
    const unresolved = mergedToolCallIds.filter((toolCallId) => {
      if (payloadToolCallIds.includes(toolCallId)) return false;
      return !isToolApprovalResolved({
        toolCallId,
        toolParts: runtimeToolParts,
        messagePart: toolPartById[toolCallId],
      });
    });
    if (unresolved.length > 0) return;

    const payloads: Record<string, Record<string, unknown>> = {};
    for (const toolCallId of mergedToolCallIds) {
      const payload = approvalPayloadsRef.current[toolCallId];
      if (payload && typeof payload === "object") payloads[toolCallId] = payload;
    }

    approvalSubmitInFlightRef.current = true;
    try {
      resetBranchSnapshotReceipt();
      const autoApproveBody = basicRef.current.autoApproveTools ? { autoApproveTools: true } : {};
      if (Object.keys(payloads).length > 0) {
        await chat.sendMessage(undefined as any, {
          body: { toolApprovalPayloads: payloads, ...autoApproveBody },
        });
      } else if (Object.keys(autoApproveBody).length > 0) {
        await chat.sendMessage(undefined as any, {
          body: autoApproveBody,
        });
      } else {
        await chat.sendMessage(undefined as any);
      }
      lastApprovalSubmittedKeyRef.current = currentKey;
      for (const toolCallId of mergedToolCallIds) {
        delete approvalPayloadsRef.current[toolCallId];
      }
    } catch {
      // 发送失败时保留暂存
    } finally {
      approvalSubmitInFlightRef.current = false;
    }
  }, [chat, resetBranchSnapshotReceipt, tabId, basicRef]);

  /** Reject pending tool approvals after manual stop. */
  const rejectPendingToolApprovals = React.useCallback(async () => {
    const messages = (chat.messages ?? []) as UIMessage[];
    if (messages.length === 0) return;
    const updates: Array<{ messageId: string; nextParts: unknown[] }> = [];
    for (const message of messages) {
      const parts = Array.isArray((message as any)?.parts) ? (message as any).parts : [];
      if (parts.length === 0) continue;
      let changed = false;
      const nextParts = parts.map((part: any) => {
        if (!part || typeof part !== "object") return part;
        const type = typeof part.type === "string" ? part.type : "";
        const isTool =
          type === "dynamic-tool" ||
          type.startsWith("tool-") ||
          typeof part.toolName === "string";
        if (!isTool) return part;
        const approval = part.approval;
        const approvalId = typeof approval?.id === "string" ? approval.id : "";
        if (!approvalId) return part;
        if (approval?.approved === true || approval?.approved === false) return part;
        changed = true;
        return {
          ...part,
          state: "output-denied",
          approval: { ...approval, approved: false },
        };
      });
      if (!changed) continue;
      const messageId = String((message as any)?.id ?? "");
      if (!messageId) continue;
      updates.push({ messageId, nextParts });
      updateMessage(messageId, { parts: nextParts });
      for (const part of nextParts) {
        const toolCallId =
          typeof (part as any)?.toolCallId === "string" ? String((part as any).toolCallId) : "";
        if (!toolCallId) continue;
        if ((part as any)?.approval?.approved !== false) continue;
        upsertToolPartForTab(toolCallId, part as any);
      }
    }
    if (updates.length === 0) return;
    for (const update of updates) {
      try {
        await updateApprovalMutation.mutateAsync({
          sessionId,
          messageId: update.messageId,
          parts: update.nextParts as any,
        });
      } catch {
        // 落库失败时保留本地状态
      }
    }
  }, [chat.messages, updateMessage, upsertToolPartForTab, updateApprovalMutation, sessionId]);

  /** Stop generating and reject pending approvals. */
  const stopGenerating = React.useCallback(() => {
    chat.stop();
    setStepThinking(false);
    void rejectPendingToolApprovals();
    abortSubAgentStreams?.();
  }, [chat, rejectPendingToolApprovals, setStepThinking, abortSubAgentStreams]);

  return {
    queueToolApprovalPayload,
    clearToolApprovalPayload,
    continueAfterToolApprovals,
    stopGenerating,
  };
}
