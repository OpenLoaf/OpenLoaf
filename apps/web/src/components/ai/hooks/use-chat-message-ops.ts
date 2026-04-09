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
import { generateId } from "ai";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import i18next from "i18next";
import { trpc } from "@/utils/trpc";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useRecordEntityVisit } from "@/hooks/use-record-entity-visit";
import { getMessagePlainText } from "@/lib/chat/message-text";
import { TEMP_CHAT_TAB_INPUT } from "@openloaf/api/common";
import { invalidateChatSessions } from "@/hooks/use-chat-sessions";
import { getCachedAccessToken } from "@/lib/saas-auth";
import {
  resolveParentMessageId as resolveParentMessageIdPure,
  findParentUserForRetry as findParentUserForRetryPure,
  sliceMessagesToParent,
  resolveResendParentMessageId as resolveResendParentMessageIdPure,
} from "@/lib/chat/branch-utils";
import {
  isCompactCommandMessage,
  isSessionCommandMessage,
} from "../utils/message-predicates";

type UseChatMessageOpsOptions = {
  sessionId: string;
  tabId?: string;
  projectId?: string;
  chatRef: React.RefObject<{
    messages: UIMessage[];
    sendMessage: (...args: any[]) => any;
    regenerate: (...args: any[]) => any;
    stop: () => void;
    setMessages: (updater: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void;
  }>;
  leafMessageId: string | null | undefined;
  siblingNav: Record<string, any> | undefined;
  paramsRef: React.MutableRefObject<Record<string, unknown> | undefined>;
  tabIdRef: React.MutableRefObject<string | null | undefined>;
  sessionIdRef: React.MutableRefObject<string>;
  basicRef: React.MutableRefObject<{ autoApproveTools?: boolean }>;
  pendingUserMessageIdRef: React.MutableRefObject<string | null>;
  pendingCompactRequestRef: React.MutableRefObject<string | null>;
  pendingSessionCommandRef: React.MutableRefObject<string | null>;
  pendingInitialTitleRefreshRef: React.MutableRefObject<boolean>;
  needsBranchMetaRefreshRef: React.MutableRefObject<boolean>;
  setMessagesRef: React.MutableRefObject<any>;
  patchSnapshot: (update: any) => void;
  resetSnapshot: () => void;
  resetBranchSnapshotReceipt: () => void;
  replaceChatMessages: (messages: UIMessage[]) => void;
  commitServerSnapshot: (snapshot: any) => void;
  refreshSnapshot: (options: any) => Promise<any>;
  applyServerSnapshotToChat: (snapshot: { messages: UIMessage[] }) => void;
};

export function useChatMessageOps({
  sessionId,
  tabId,
  projectId,
  chatRef,
  leafMessageId,
  siblingNav,
  paramsRef,
  tabIdRef,
  sessionIdRef,
  basicRef,
  pendingUserMessageIdRef,
  pendingCompactRequestRef,
  pendingSessionCommandRef,
  pendingInitialTitleRefreshRef,
  needsBranchMetaRefreshRef,
  setMessagesRef,
  patchSnapshot,
  resetSnapshot,
  resetBranchSnapshotReceipt,
  replaceChatMessages,
  commitServerSnapshot,
  refreshSnapshot,
  applyServerSnapshotToChat,
}: UseChatMessageOpsOptions) {
  const queryClient = useQueryClient();
  const { recordEntityVisit } = useRecordEntityVisit();

  const deleteMessageSubtreeMutation = useMutation(
    trpc.chat.deleteMessageSubtree.mutationOptions()
  );

  const sendMessage = React.useCallback(
    (...args: any[]) => {
      const chat = chatRef.current!;
      const [message, options] = args as any[];
      if (!message) return (chat.sendMessage as any)(message, options);

      const explicitParentMessageId =
        typeof message?.parentMessageId === "string" || message?.parentMessageId === null
          ? message.parentMessageId
          : undefined;
      const parentMessageId = resolveParentMessageIdPure({
        explicitParentMessageId,
        leafMessageId: leafMessageId ?? null,
        messages: chat.messages as Array<{ id: string }>,
      });
      const nextMessageRaw =
        message && typeof message === "object" && "text" in message
          ? { parts: [{ type: "text", text: String((message as any).text ?? "") }] }
          : { ...(message ?? {}) };

      const id =
        !("id" in (nextMessageRaw as any)) || !(nextMessageRaw as any).id
          ? generateId()
          : (nextMessageRaw as any).id;

      const nextMessage: any = {
        role: (nextMessageRaw as any).role ?? "user",
        ...nextMessageRaw,
        ...(id ? { id } : {}),
        parentMessageId,
      };

      if (
        nextMessage.role === "user" &&
        !nextMessage.messageKind &&
        isCompactCommandMessage(nextMessage)
      ) {
        nextMessage.messageKind = "compact_prompt";
      }
      if (nextMessage.role === "user" && isCompactCommandMessage(nextMessage)) {
        pendingCompactRequestRef.current = String(nextMessage.id);
      }
      if (nextMessage.role === "user" && isSessionCommandMessage(nextMessage)) {
        pendingSessionCommandRef.current = String(nextMessage.id);
      }
      if (
        nextMessage.role === "user" &&
        !(chat.messages ?? []).some((m: any) => m?.role === "user") &&
        !isCompactCommandMessage(nextMessage) &&
        !isSessionCommandMessage(nextMessage)
      ) {
        const currentProjectId = paramsRef.current?.projectId;
        recordEntityVisit({
          entityType: "chat",
          entityId: sessionIdRef.current,
          projectId:
            typeof currentProjectId === "string" && currentProjectId.trim()
              ? currentProjectId.trim()
              : null,
          trigger: "chat-create",
        });

        pendingInitialTitleRefreshRef.current = true;

        const currentTabId = tabIdRef.current;
        if (currentTabId) {
          const tempTitle = i18next.t(TEMP_CHAT_TAB_INPUT.titleKey);
          const viewState = useAppView.getState();
          if (!viewState.projectShell && viewState.title === tempTitle) {
            const userText = getMessagePlainText(nextMessage);
            const truncated = userText.slice(0, 30).trim() || "新对话";
            viewState.setTitle(truncated);
          }
        }
      }

      pendingUserMessageIdRef.current = String(nextMessage.id);
      resetBranchSnapshotReceipt();

      const autoApproveBody = basicRef.current.autoApproveTools ? { autoApproveTools: true } : {};
      const mergedOptions = Object.keys(autoApproveBody).length > 0
        ? { ...options, body: { ...(options?.body ?? {}), ...autoApproveBody } }
        : options;
      const result = (chat.sendMessage as any)(nextMessage, mergedOptions);
      return result;
    },
    [leafMessageId, resetBranchSnapshotReceipt, paramsRef, tabIdRef, sessionIdRef, basicRef, pendingUserMessageIdRef, pendingCompactRequestRef, pendingSessionCommandRef, pendingInitialTitleRefreshRef, recordEntityVisit]
  );

  const switchSibling = React.useCallback(
    async (
      messageId: string,
      direction: "prev" | "next",
      navOverride?: { prevSiblingId?: string | null; nextSiblingId?: string | null }
    ) => {
      const nav = siblingNav?.[messageId] ?? navOverride;
      if (!nav) return;
      const targetId = direction === "prev" ? nav.prevSiblingId : nav.nextSiblingId;
      if (!targetId) return;

      chatRef.current!.stop();

      const nextSnapshot = await refreshSnapshot({
        anchor: { messageId: targetId, strategy: "latestLeafInSubtree" },
        window: { limit: 50 },
        includeToolOutput: true,
      });
      applyServerSnapshotToChat(nextSnapshot);
    },
    [
      siblingNav,
      applyServerSnapshotToChat,
      refreshSnapshot,
    ]
  );

  const retryAssistantMessage = React.useCallback(
    async (assistantMessageId: string) => {
      const chat = chatRef.current!;
      const assistant = (chat.messages as any[]).find((m: any) => String(m?.id) === assistantMessageId);
      if (!assistant) return;

      const parentUserMessageId = findParentUserForRetryPure({
        assistantMessageId,
        assistantParentMessageId: (assistant as any)?.parentMessageId,
        siblingNavParentMessageId: siblingNav?.[assistantMessageId]?.parentMessageId,
        messages: chat.messages as Array<{ id: string; role: string }>,
      });
      if (!parentUserMessageId) return;

      const isDirectCli = !!(
        (chat.messages as any[]).find((m: any) => String(m?.id) === parentUserMessageId)
          ?.metadata as any
      )?.directCli;
      const originalChatModelId =
        (assistant as any)?.metadata?.agent?.chatModelId ??
        (assistant as any)?.agent?.chatModelId;

      let prevAssistantUuid: string | undefined;
      if (isDirectCli) {
        const parentIdx = (chat.messages as any[]).findIndex(
          (m: any) => String(m?.id) === parentUserMessageId,
        );
        if (parentIdx > 0) {
          for (let i = parentIdx - 1; i >= 0; i--) {
            const m = (chat.messages as any[])[i];
            if (m?.role === "assistant") {
              prevAssistantUuid = m?.metadata?.sdkAssistantUuid;
              break;
            }
          }
        }
      }

      chat.stop();

      const slicedMessages = sliceMessagesToParent(
        chat.messages as Array<{ id: string }>,
        parentUserMessageId,
      ) as UIMessage[];
      if (slicedMessages.length === 0) return;
      replaceChatMessages(slicedMessages);
      patchSnapshot((previous: any) => {
        const chainIdx = previous.branchMessageIds.indexOf(parentUserMessageId);
        return {
          leafMessageId: parentUserMessageId,
          branchMessageIds:
            chainIdx >= 0
              ? previous.branchMessageIds.slice(0, chainIdx + 1)
              : previous.branchMessageIds,
        };
      });

      pendingUserMessageIdRef.current = parentUserMessageId;
      needsBranchMetaRefreshRef.current = true;
      resetBranchSnapshotReceipt();
      await (chat.regenerate as any)({
        body: {
          retry: true,
          ...(isDirectCli && originalChatModelId ? { chatModelId: originalChatModelId } : {}),
          ...(isDirectCli && prevAssistantUuid ? { sdkRewindTarget: prevAssistantUuid } : {}),
        },
      });
    },
    [
      siblingNav,
      patchSnapshot,
      replaceChatMessages,
      resetBranchSnapshotReceipt,
    ]
  );

  const resendUserMessage = React.useCallback(
    async (userMessageId: string, nextText: string, nextParts?: any[]) => {
      const chat = chatRef.current!;
      const user = (chat.messages as any[]).find((m: any) => String(m?.id) === userMessageId);
      if (!user || user.role !== "user") return;
      const parentMessageId = resolveResendParentMessageIdPure(user as any);

      chat.stop();

      if (parentMessageId) {
        const slicedMessages = sliceMessagesToParent(
          chat.messages as Array<{ id: string }>,
          parentMessageId,
        ) as UIMessage[];
        if (slicedMessages.length === 0) return;
        replaceChatMessages(slicedMessages);
        patchSnapshot((previous: any) => {
          const chainIdx = previous.branchMessageIds.indexOf(parentMessageId);
          return {
            leafMessageId: parentMessageId,
            branchMessageIds:
              chainIdx >= 0
                ? previous.branchMessageIds.slice(0, chainIdx + 1)
                : previous.branchMessageIds,
          };
        });
      } else {
        replaceChatMessages([]);
        resetSnapshot();
      }

      const nextUserId = generateId();
      needsBranchMetaRefreshRef.current = true;
      const parts =
        Array.isArray(nextParts) && nextParts.length > 0
          ? nextParts
          : [{ type: "text", text: nextText }];
      await (sendMessage as any)({
        id: nextUserId,
        role: "user",
        parts,
        parentMessageId,
      });
    },
    [
      sendMessage,
      patchSnapshot,
      replaceChatMessages,
      resetSnapshot,
    ]
  );

  const deleteMessageSubtree = React.useCallback(
    async (messageId: string) => {
      const normalizedId = String(messageId ?? "").trim();
      if (!normalizedId) return false;

      chatRef.current!.stop();

      const result = await deleteMessageSubtreeMutation.mutateAsync({
        sessionId,
        messageId: normalizedId,
      });
      if (!result) return false;
      const nextSnapshot = (result as any)?.snapshot;
      if (nextSnapshot) {
        commitServerSnapshot(nextSnapshot);
      }
      return true;
    },
    [
      commitServerSnapshot,
      deleteMessageSubtreeMutation.mutateAsync,
      sessionId,
    ]
  );

  return {
    sendMessage,
    switchSibling,
    retryAssistantMessage,
    resendUserMessage,
    deleteMessageSubtree,
  };
}
