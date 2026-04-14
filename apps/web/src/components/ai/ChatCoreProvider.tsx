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

import React, { type ReactNode } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { trpc, trpcClient } from "@/utils/trpc";
import { useAppView } from "@/hooks/use-app-view";
import { useChatRuntime, type ToolPartSnapshot } from "@/hooks/use-chat-runtime";
import { useLayoutState } from "@/hooks/use-layout-state";
import { createChatTransport } from "@/lib/ai/transport";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { refreshAccessToken } from "@/lib/saas-auth";
import type { PendingCloudMessage } from "./context/ChatStateContext";
import type { ImageGenerateOptions } from "@openloaf/api/types/image";
import type { CodexOptions } from "@/lib/chat/codex-options";
import type { ClaudeCodeOptions } from "@/lib/chat/claude-code-options";
import { invalidateChatSessions } from "@/hooks/use-chat-sessions";
import { incrementChatPerf } from "@/lib/chat/chat-perf";
import { isHiddenToolPart } from "@/lib/chat/message-parts";
import type { ChatAttachmentInput, MaskedAttachmentInput } from "./input/chat-attachments";
import {
  ChatActionsProvider,
  ChatOptionsProvider,
  ChatSessionProvider,
  ChatStateProvider,
  ChatToolProvider,
} from "./context";
import { useBranchSnapshot, useChatBranchState } from "./hooks/use-chat-branch-state";
import { useChatToolStream } from "./hooks/use-chat-tool-stream";
import { useChatLifecycle } from "./hooks/use-chat-lifecycle";
import { useSubAgentStreams } from "./hooks/use-sub-agent-streams";
import { useChatApproval } from "./hooks/use-chat-approval";
import { useTabActive } from "@/components/layout/TabActiveContext";
import { useChatMessageOps } from "./hooks/use-chat-message-ops";
import { useBackgroundProcesses } from "@/hooks/use-background-processes";
import { useChatSessionManagement } from "./hooks/use-chat-session-management";
import {
  handleSubAgentDataPart,
  handleStepThinkingDataPart,
  handleBranchSnapshotDataPart,
  handlePlanFileDataPart,
  handleMediaGenerateDataPart,
  handleToolProgressDataPart,
} from "./utils/chat-data-handlers";
import { isSaasUnauthorizedErrorMessage } from "./utils/message-predicates";
import { taskStatusCache } from "@/lib/chat/task-status-cache";

// 提供稳定的空对象，避免 useSyncExternalStore 报错。
const EMPTY_TOOL_PARTS: Record<string, ToolPartSnapshot> = {};

/**
 * Chat provider component.
 * Provides chat state and actions to children.
 */
type ChatCoreProviderProps = {
  children: ReactNode;
  tabId?: string;
  sessionId: string;
  loadHistory?: boolean;
  params?: Record<string, unknown>;
  onSessionChange?: (
    sessionId: string,
    options?: { loadHistory?: boolean; replaceCurrent?: boolean }
  ) => void;
  addAttachments?: (files: FileList | ChatAttachmentInput[]) => void;
  addMaskedAttachment?: (input: MaskedAttachmentInput) => void;
};

export default function ChatCoreProvider({
  children,
  tabId,
  sessionId,
  loadHistory,
  params,
  onSessionChange,
  addAttachments,
  addMaskedAttachment,
}: ChatCoreProviderProps) {
  const [stepThinking, setStepThinking] = React.useState(false);
  const [pendingCloudMessage, setPendingCloudMessage] = React.useState<PendingCloudMessage | null>(null);
  const pendingCloudMessageRef = React.useRef(pendingCloudMessage);
  React.useEffect(() => { pendingCloudMessageRef.current = pendingCloudMessage }, [pendingCloudMessage]);
  const { loggedIn: authLoggedIn } = useSaasAuth();
  const upsertToolPart = useChatRuntime((s) => s.upsertToolPart);
  const clearToolPartsForTab = useChatRuntime((s) => s.clearToolPartsForTab);
  const queryClient = useQueryClient();
  const { basic } = useBasicConfig();
  const basicRef = React.useRef(basic);
  basicRef.current = basic;
  const toolStream = useChatToolStream();

  // ── Refs ──
  const sessionIdRef = React.useRef(sessionId);
  sessionIdRef.current = sessionId;
  const pendingUserMessageIdRef = React.useRef<string | null>(null);
  const needsBranchMetaRefreshRef = React.useRef(false);
  const branchSnapshotReceivedRef = React.useRef(false);
  const setMessagesRef = React.useRef<ReturnType<typeof useChat>["setMessages"] | null>(null);
  const pendingCompactRequestRef = React.useRef<string | null>(null);
  const pendingSessionCommandRef = React.useRef<string | null>(null);
  const assistantReplyCountRef = React.useRef(0);
  const pendingInitialTitleRefreshRef = React.useRef(false);
  const authRetryMessageIdsRef = React.useRef(new Set<string>());
  const authRetryInFlightRef = React.useRef(false);
  const paramsRef = React.useRef<Record<string, unknown> | undefined>(params);
  const tabIdRef = React.useRef<string | null | undefined>(tabId);

  const projectId = React.useMemo(() => {
    if (typeof params?.projectId !== "string") return undefined;
    const trimmed = params.projectId.trim();
    return trimmed ? trimmed : undefined;
  }, [params]);

  React.useEffect(() => { paramsRef.current = params }, [params]);
  React.useEffect(() => { tabIdRef.current = tabId }, [tabId]);

  // ── Auto title mutation ──
  const autoTitleMutation = useMutation({
    ...(trpc.chat.autoTitle.mutationOptions() as any),
    onSuccess: () => { invalidateChatSessions(queryClient) },
  });

  // ── Sub-agent streams ──
  const {
    enqueueSubAgentChunk,
    closeSubAgentStream,
    resetSubAgentStreams,
    abortSubAgentStreams,
  } = useSubAgentStreams({ tabIdRef, toolStream });

  React.useEffect(() => {
    assistantReplyCountRef.current = 0;
    pendingInitialTitleRefreshRef.current = false;
  }, [sessionId]);

  React.useEffect(() => {
    if (tabId) {
      clearToolPartsForTab(tabId);
      useChatRuntime.getState().clearCcRuntime(tabId);
    }
  }, [tabId, clearToolPartsForTab]);

  const upsertToolPartMerged = React.useCallback(
    (key: string, next: Partial<Parameters<typeof upsertToolPart>[2]>) => {
      if (!tabId) return;
      const current = useChatRuntime.getState().toolPartsByTabId[tabId]?.[key];
      upsertToolPart(tabId, key, { ...current, ...next } as any);
    },
    [tabId, upsertToolPart]
  );

  const transport = React.useMemo(
    () => createChatTransport({ paramsRef, tabIdRef, sessionIdRef }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Branch snapshot ──
  const branchSnapshot = useBranchSnapshot(sessionId);
  const { patchSnapshot, refreshBranchMeta } = branchSnapshot;
  const commitServerSnapshotRef = React.useRef<any>(null);

  const resetBranchSnapshotReceipt = React.useCallback(() => {
    branchSnapshotReceivedRef.current = false;
  }, []);

  // ── onFinish callback ──
  const onFinish = React.useCallback(
    ({ message }: { message: UIMessage }) => {
      if (sessionIdRef.current !== sessionId) return;
      if (pendingSessionCommandRef.current) {
        pendingSessionCommandRef.current = null;
        pendingUserMessageIdRef.current = null;
        pendingCompactRequestRef.current = null;
        needsBranchMetaRefreshRef.current = false;
        branchSnapshotReceivedRef.current = false;
        return;
      }
      const assistantId = String((message as any)?.id ?? "");
      if (!assistantId) {
        needsBranchMetaRefreshRef.current = false;
        branchSnapshotReceivedRef.current = false;
        return;
      }
      patchSnapshot({
        leafMessageId: assistantId,
        errorMessage: null,
      });

      const parentUserMessageId = pendingUserMessageIdRef.current;
      pendingUserMessageIdRef.current = null;
      if (parentUserMessageId && setMessagesRef.current) {
        setMessagesRef.current((messages: any[]) =>
          messages.map((m: any) =>
            String(m?.id) === assistantId &&
            (m?.parentMessageId === undefined || m?.parentMessageId === null)
              ? { ...m, parentMessageId: parentUserMessageId }
              : m
          )
        );
      }
      if (parentUserMessageId && pendingCompactRequestRef.current === parentUserMessageId) {
        pendingCompactRequestRef.current = null;
        if (setMessagesRef.current) {
          setMessagesRef.current((messages: any[]) =>
            messages.map((m: any) =>
              String(m?.id) === assistantId
                ? { ...m, messageKind: "compact_summary" }
                : m
            )
          );
        }
      }

      if (needsBranchMetaRefreshRef.current) {
        const shouldRefreshBranchMeta = !branchSnapshotReceivedRef.current;
        needsBranchMetaRefreshRef.current = false;
        if (shouldRefreshBranchMeta) {
          void refreshBranchMeta(assistantId);
        }
      }
      branchSnapshotReceivedRef.current = false;
      if (pendingInitialTitleRefreshRef.current) {
        pendingInitialTitleRefreshRef.current = false;
        invalidateChatSessions(queryClient);
      }
      assistantReplyCountRef.current += 1;
      if (assistantReplyCountRef.current % 5 === 0 && !autoTitleMutation.isPending) {
        autoTitleMutation.mutate({ sessionId } as any);
      }
      setStepThinking(false);

    },
    [autoTitleMutation, queryClient, sessionId, setStepThinking, patchSnapshot, refreshBranchMeta]
  );

  // ── Chat config & useChat ──
  const chatConfig = React.useMemo(
    () => ({
      id: sessionId,
      resume: false,
      experimental_throttle: 100,
      sendAutomaticallyWhen: () => false,
      transport,
      onToolCall: (payload: { toolCall: any }) => {
        void toolStream.handleToolCall({ toolCall: payload.toolCall, tabId });
      },
      onFinish,
      onData: (dataPart: any) => {
        if (sessionIdRef.current !== sessionId) return;
        incrementChatPerf("chat.onData");
        if (dataPart?.type === "data-session-title") {
          invalidateChatSessions(queryClient);
          const title =
            typeof dataPart?.data?.title === "string" ? dataPart.data.title.trim() : "";
          const sessionIdInData =
            typeof dataPart?.data?.sessionId === "string" ? dataPart.data.sessionId : "";
          if (title && (!sessionIdInData || sessionIdInData === sessionIdRef.current)) {
            const viewState = useAppView.getState();
            const hasBase = Boolean(useLayoutState.getState().base);
            if (viewState.projectShell) return;
            if (!hasBase && viewState.title !== title) {
              viewState.setTitle(title);
            }
          }
          return;
        }
        if (
          handleBranchSnapshotDataPart({
            dataPart,
            sessionId,
            commitServerSnapshot: commitServerSnapshotRef.current ?? undefined,
            markReceived: () => { branchSnapshotReceivedRef.current = true },
          })
        ) return;
        if (
          handlePlanFileDataPart({
            dataPart,
            sessionId,
            onPlanFile: ({ planNo, filePath }) => {
              useLayoutState.getState().pushStackItem({
                id: `plan-${sessionId}-${planNo}`,
                sourceKey: `plan-${sessionId}-${planNo}`,
                component: "markdown-viewer",
                params: {
                  // NOTE: filePath is a server-side absolute path; works in Electron
                  // (same machine), but requires API-based file read for web deployment.
                  uri: filePath,
                  name: `PLAN_${planNo}.md`,
                  ext: "md",
                  readOnly: true,
                  __customHeader: true,
                },
              });
            },
          })
        ) return;
        if (handleStepThinkingDataPart({ dataPart, setStepThinking })) return;
        if (handleMediaGenerateDataPart({ dataPart, upsertToolPartMerged })) return;
        if (handleToolProgressDataPart({ dataPart, tabId, upsertToolPartMerged })) return;
        if (
          handleSubAgentDataPart({
            dataPart,
            tabId,
            enqueueSubAgentChunk,
            closeSubAgentStream,
          })
        ) return;
        toolStream.handleDataPart({ dataPart, tabId, upsertToolPartMerged });
      },
    }),
    [
      sessionId,
      tabId,
      transport,
      upsertToolPartMerged,
      onFinish,
      setStepThinking,
      queryClient,
      toolStream,
      enqueueSubAgentChunk,
      closeSubAgentStream,
    ]
  );

  const chat = useChat(chatConfig);
  setMessagesRef.current = chat.setMessages;

  // Stable wrappers for chat functions that get new references on every
  // useChat state update.  Without this, actionsValue changes on every
  // throttled SSE chunk, causing all useChatActions() consumers to re-render.
  const chatRef = React.useRef(chat);
  chatRef.current = chat;
  const stableRegenerate = React.useCallback(
    (...args: Parameters<typeof chat.regenerate>) => chatRef.current.regenerate(...args),
    [],
  );
  const stableAddToolApprovalResponse = React.useCallback(
    (...args: Parameters<typeof chat.addToolApprovalResponse>) => chatRef.current.addToolApprovalResponse(...args),
    [],
  );
  const stableClearError = React.useCallback(
    () => chatRef.current.clearError(),
    [],
  );

  // ── Branch state ──
  const isTabActive = useTabActive();
  const shouldLoadHistory = Boolean(loadHistory);
  const {
    snapshot: sessionSnapshot,
    branchQueryData,
    isHistoryLoading,
    applySnapshot,
    resetSnapshot,
    clearCachedView,
    refreshSnapshot,
  } = useChatBranchState({
    sessionId,
    enabled: isTabActive && shouldLoadHistory && chat.messages.length === 0,
    localMessageCount: chat.messages.length,
    branchSnapshot,
  });
  const leafMessageId = sessionSnapshot.leafMessageId;
  const branchMessageIds = sessionSnapshot.branchMessageIds;
  const siblingNav = sessionSnapshot.siblingNav;

  const effectiveError =
    chat.error ??
    (chat.status === "ready" && sessionSnapshot.errorMessage
      ? new Error(sessionSnapshot.errorMessage)
      : undefined);

  useChatLifecycle({
    tabId,
    sessionId,
    status: chat.status,
    soundEnabled: basic.modelSoundEnabled,
    snapshotEnabled: chat.status !== "ready",
  });

  // ── Replace & commit helpers ──
  const replaceChatMessages = React.useCallback(
    (messages: UIMessage[]) => {
      chatRef.current.setMessages(messages);
      if (!tabId) return;
      clearToolPartsForTab(tabId);
      toolStream.syncFromMessages({ tabId, messages });
    },
    [tabId, clearToolPartsForTab, toolStream],
  );

  const applyServerSnapshotToChat = React.useCallback(
    (nextSnapshot: { messages: UIMessage[] }) => {
      replaceChatMessages(nextSnapshot.messages);
    },
    [replaceChatMessages],
  );

  const commitServerSnapshot = React.useCallback(
    (nextSnapshot: {
      messages: UIMessage[];
      leafMessageId?: string | null;
      branchMessageIds?: string[];
      siblingNav?: Record<string, unknown>;
      errorMessage?: string | null;
    }) => {
      applySnapshot(nextSnapshot);
      applyServerSnapshotToChat(nextSnapshot);
    },
    [applySnapshot, applyServerSnapshotToChat],
  );
  commitServerSnapshotRef.current = commitServerSnapshot;

  // ── Session management ──
  const {
    stopAndResetSession,
    newSession,
    selectSession,
  } = useChatSessionManagement({
    sessionId,
    tabId,
    projectId,
    sessionIdRef,
    chatRef,
    pendingUserMessageIdRef,
    needsBranchMetaRefreshRef,
    branchSnapshotReceivedRef,
    pendingCompactRequestRef,
    resetSnapshot,
    resetSubAgentStreams,
    setStepThinking,
    onSessionChange,
  });

  // ── Auth retry ──
  React.useEffect(() => {
    if (chat.status !== "ready") return;
    if (basic.chatSource !== "cloud") return;
    const errorText = chat.error?.message ?? sessionSnapshot.errorMessage ?? "";
    if (!isSaasUnauthorizedErrorMessage(errorText)) return;
    if (authRetryInFlightRef.current) return;

    const targetUserMessageId = pendingUserMessageIdRef.current;
    if (!targetUserMessageId) return;
    if (authRetryMessageIdsRef.current.has(targetUserMessageId)) return;

    authRetryMessageIdsRef.current.add(targetUserMessageId);
    authRetryInFlightRef.current = true;
    void (async () => {
      try {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          useSaasAuth.getState().logout();
          toast.error("登录失败，请重新登录");
          return;
        }
        chatRef.current.clearError();
        try {
          resetBranchSnapshotReceipt();
          await chatRef.current.regenerate();
        } catch {}
      } catch {
        useSaasAuth.getState().logout();
        toast.error("登录失败，请重新登录");
      } finally {
        authRetryInFlightRef.current = false;
      }
    })();
  }, [
    basic.chatSource,
    chat.error,
    chat.status,
    resetBranchSnapshotReceipt,
    sessionSnapshot.errorMessage,
  ]);

  // ── Tool sync effects ──
  React.useEffect(() => {
    if (!tabId) return;
    toolStream.syncFromMessages({ tabId, messages: chat.messages as UIMessage[] });
  }, [chat.messages, tabId, toolStream]);

  React.useEffect(() => {
    if (!tabId) return;
    if (chat.status === "ready") return;
    const lastMessage = (chat.messages as any[])?.at(-1);
    if (!lastMessage || lastMessage.role !== "assistant") return;
    const parts = Array.isArray(lastMessage.parts) ? lastMessage.parts : [];
    for (const part of parts) {
      const type = typeof part?.type === "string" ? part.type : "";
      const isTool =
        type === "dynamic-tool" || type.startsWith("tool-") || typeof part?.toolName === "string";
      if (!isTool) continue;
      if (isHiddenToolPart(part)) continue;
      const toolName = typeof part?.toolName === "string" ? part.toolName : "";
      const isFrontendTool = toolName === "OpenUrl" || type === "tool-OpenUrl";
      if (isFrontendTool) continue;
      void toolStream.executeFromToolPart({ part, tabId });
    }
  }, [chat.messages, chat.status, tabId, toolStream]);

  // ── Session switch cleanup ──
  const prevSessionIdRef = React.useRef(sessionId);

  React.useLayoutEffect(() => {
    if (prevSessionIdRef.current === sessionId) return;
    prevSessionIdRef.current = sessionId;
    stopAndResetSession(true);
    clearCachedView();
  }, [sessionId, stopAndResetSession, clearCachedView]);

  // ── History load ──
  React.useEffect(() => {
    const data = branchQueryData;
    if (!data) return;
    const nextSnapshot = applySnapshot(data);
    if (chat.messages.length === 0) {
      applyServerSnapshotToChat(nextSnapshot);
    }
  }, [branchQueryData, applyServerSnapshotToChat, applySnapshot, chat.messages.length]);

  // ── Background task completion notifications ──
  //
  // task-report events are delivered as independent notifications (toast),
  // NOT inserted into the chat message tree. The AI learns about task
  // results by actively calling the ScheduledTaskWait / ScheduledTaskStatus tool within its
  // turn, same philosophy as Claude Code's Sleep tool.
  //
  // See .plans/openloaf/docs/chat-ai/task-completion-flow.md for rationale.
  const bgDrainPendingRef = React.useRef(false);
  React.useEffect(() => {
    if (!sessionId || !isTabActive) return;
    const subscription = trpcClient.chat.onSessionUpdate.subscribe(
      { sessionId },
      {
        onData(event) {
          if (event.type === 'ScheduledTaskStatus-change') {
            // 更新 task status → ScheduledTaskTool 卡片通过 useSyncExternalStore 监听
            taskStatusCache.set(event.taskId, event.status)
            return
          }
          if (event.type === 'schedule-report') {
            // 独立通知，不进消息树
            if (event.status === 'completed') {
              toast.success(event.title, { description: event.summary });
            } else {
              toast.error(event.title, { description: event.summary });
            }
            return
          }
          if (event.type === 'bg-task-update') {
            useBackgroundProcesses.getState().upsertTask(sessionId, event.task);
            // 后台任务到达终态 + AI 空闲 → 自动触发 drain turn，
            // 让服务端 drain loop 消费积压的 bg-task-notification。
            // bgDrainPendingRef 防止同一微任务内多个终态事件重复触发。
            const isTerminal = event.task.status === 'completed' || event.task.status === 'failed';
            if (isTerminal && chatRef.current.status === 'ready' && !bgDrainPendingRef.current) {
              bgDrainPendingRef.current = true;
              (chatRef.current.sendMessage as any)({
                parts: [{ type: 'text', text: '<bg-drain>' }],
                metadata: { openloaf: { syntheticKind: 'bg-drain', isMeta: true } },
              });
              // sendMessage 后 chat.status 会在下一渲染周期变为非 ready，
              // 这里用 queueMicrotask 确保同批事件不重复触发。
              queueMicrotask(() => { bgDrainPendingRef.current = false; });
            }
            return
          }
        },
        onError() {},
      },
    );
    return () => { subscription.unsubscribe() };
  }, [sessionId, isTabActive]);

  const updateMessage = React.useCallback(
    (id: string, updates: Partial<UIMessage>) => {
      chatRef.current.setMessages((messages: any) =>
        messages.map((msg: any) => (msg.id === id ? { ...msg, ...updates } : msg))
      );
    },
    []
  );

  // ── Message operations ──
  const {
    sendMessage,
    switchSibling,
    retryAssistantMessage,
    continueAssistantTurn,
    resendUserMessage,
    deleteMessageSubtree,
  } = useChatMessageOps({
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
  });

  // ── Cloud message ──
  const sendPendingCloudMessage = React.useCallback(() => {
    const msg = pendingCloudMessageRef.current;
    if (!msg) return;
    setPendingCloudMessage(null);
    sendMessage({ parts: msg.parts, ...(msg.metadata ? { metadata: msg.metadata } : {}) } as any);
  }, [sendMessage]);

  React.useEffect(() => {
    if (!authLoggedIn) return;
    if (!pendingCloudMessageRef.current) return;
    sendPendingCloudMessage();
  }, [authLoggedIn, sendPendingCloudMessage]);

  const [input, setInput] = React.useState("");
  const [imageOptions, setImageOptions] = React.useState<ImageGenerateOptions | undefined>(undefined);
  const [codexOptions, setCodexOptions] = React.useState<CodexOptions | undefined>(undefined);
  const [claudeCodeOptions, setClaudeCodeOptions] = React.useState<ClaudeCodeOptions | undefined>(undefined);

  React.useEffect(() => {
    if ((chat.messages?.length ?? 0) === 0 && leafMessageId) {
      patchSnapshot({ leafMessageId: null });
    }
  }, [chat.messages?.length, leafMessageId, patchSnapshot]);

  const upsertToolPartForTab = React.useCallback(
    (toolCallId: string, next: Parameters<typeof upsertToolPart>[2]) => {
      if (!tabId) return;
      upsertToolPart(tabId, toolCallId, next);
    },
    [tabId, upsertToolPart]
  );

  // ── Approval workflow ──
  const {
    queueToolApprovalPayload,
    clearToolApprovalPayload,
    continueAfterToolApprovals,
    rejectPendingToolApprovals,
    stopGenerating,
  } = useChatApproval({
    sessionId,
    tabId,
    chatRef,
    basicRef,
    resetBranchSnapshotReceipt,
    updateMessage,
    upsertToolPartForTab,
    setStepThinking,
    abortSubAgentStreams,
  });

  const markToolStreaming = React.useCallback(
    (toolCallId: string) => {
      if (!tabId) return;
      const current = useChatRuntime.getState().toolPartsByTabId[tabId]?.[toolCallId];
      upsertToolPart(tabId, toolCallId, {
        ...current,
        state: "output-streaming",
        streaming: true,
      } as any);
    },
    [tabId, upsertToolPart]
  );

  // ── Context values ──
  // rAF + startTransition: SSE 期间用 requestAnimationFrame 合并多次 useChat 更新为每帧一次，
  // 再通过 startTransition 以可中断的 Transition 优先级传播给 consumer。
  // 比 useDeferredValue 更好：rAF 减少渲染次数，startTransition 确保可中断。
  const [contextMessages, setContextMessages] = React.useState<UIMessage[]>(
    () => chat.messages as UIMessage[],
  );
  const messageRafRef = React.useRef(0);

  React.useEffect(() => {
    // 非流式状态（初始加载、历史恢复、结束）直接同步更新，不走 rAF
    if (chat.status === "ready" || chat.status === "error") {
      if (messageRafRef.current) {
        cancelAnimationFrame(messageRafRef.current);
        messageRafRef.current = 0;
      }
      setContextMessages(chat.messages as UIMessage[]);
      return;
    }
    // 流式状态：rAF 合并 + startTransition 可中断
    if (messageRafRef.current) return;
    messageRafRef.current = requestAnimationFrame(() => {
      messageRafRef.current = 0;
      React.startTransition(() => {
        setContextMessages(chatRef.current.messages as UIMessage[]);
      });
    });
  }, [chat.messages, chat.status]);

  React.useEffect(() => () => {
    if (messageRafRef.current) cancelAnimationFrame(messageRafRef.current);
  }, []);

  const stateValue = React.useMemo(
    () => ({
      messages: contextMessages,
      status: chat.status,
      error: effectiveError,
      isHistoryLoading,
      stepThinking,
      pendingCloudMessage,
    }),
    [contextMessages, chat.status, effectiveError, isHistoryLoading, stepThinking, pendingCloudMessage]
  );

  const sessionValue = React.useMemo(
    () => ({
      sessionId,
      tabId,
      projectId,
      leafMessageId,
      branchMessageIds,
      siblingNav,
    }),
    [sessionId, tabId, projectId, leafMessageId, branchMessageIds, siblingNav]
  );

  // 用户发送新消息时，自动 reject 所有未决审批（避免旧审批 UI 仍可操作）
  const sendMessageWithApprovalCleanup = React.useCallback(
    (...args: Parameters<typeof sendMessage>) => {
      const [message] = args;
      // message 有值 = 用户主动发消息；message 为空 = 审批 continuation，不需要 reject
      if (message) {
        void rejectPendingToolApprovals();
      }
      return sendMessage(...args);
    },
    [sendMessage, rejectPendingToolApprovals]
  );

  // Ref-getter proxy: context value 对象引用永远不变，消除 ChatActionsContext 级联。
  // 消费者调用 actions.sendMessage() 时通过 getter 取到最新函数，无需 context 重渲染。
  const _actionsLatest = React.useRef({
    sendMessage: sendMessageWithApprovalCleanup,
    regenerate: stableRegenerate,
    addToolApprovalResponse: stableAddToolApprovalResponse,
    clearError: stableClearError,
    stopGenerating,
    updateMessage,
    newSession,
    selectSession,
    switchSibling,
    retryAssistantMessage,
    continueAssistantTurn,
    resendUserMessage,
    deleteMessageSubtree,
    setPendingCloudMessage,
    sendPendingCloudMessage,
  });
  _actionsLatest.current = {
    sendMessage: sendMessageWithApprovalCleanup,
    regenerate: stableRegenerate,
    addToolApprovalResponse: stableAddToolApprovalResponse,
    clearError: stableClearError,
    stopGenerating,
    updateMessage,
    newSession,
    selectSession,
    switchSibling,
    retryAssistantMessage,
    continueAssistantTurn,
    resendUserMessage,
    deleteMessageSubtree,
    setPendingCloudMessage,
    sendPendingCloudMessage,
  };
  const actionsValue = React.useMemo(
    () =>
      new Proxy({} as typeof _actionsLatest.current, {
        get: (_, prop) => (_actionsLatest.current as any)?.[prop],
      }),
    [],
  );

  const optionsValue = React.useMemo(
    () => ({
      input,
      setInput,
      imageOptions,
      setImageOptions,
      codexOptions,
      setCodexOptions,
      claudeCodeOptions,
      setClaudeCodeOptions,
      addAttachments,
      addMaskedAttachment,
    }),
    [input, imageOptions, codexOptions, claudeCodeOptions, addAttachments, addMaskedAttachment]
  );

  const _toolCallbacksLatest = React.useRef({
    upsertToolPart: upsertToolPartForTab,
    markToolStreaming,
    queueToolApprovalPayload,
    clearToolApprovalPayload,
    continueAfterToolApprovals,
  });
  _toolCallbacksLatest.current = {
    upsertToolPart: upsertToolPartForTab,
    markToolStreaming,
    queueToolApprovalPayload,
    clearToolApprovalPayload,
    continueAfterToolApprovals,
  };
  const toolCallbacks = React.useMemo(
    () =>
      new Proxy({} as typeof _toolCallbacksLatest.current, {
        get: (_, prop) => (_toolCallbacksLatest.current as any)?.[prop],
        ownKeys: () => Object.keys(_toolCallbacksLatest.current),
        getOwnPropertyDescriptor: (_, prop) => ({
          configurable: true,
          enumerable: true,
          get: () => (_toolCallbacksLatest.current as any)?.[prop as string],
        }),
      }),
    [],
  );

  return (
    <ChatStateProvider value={stateValue}>
      <ChatSessionProvider value={sessionValue}>
        <ChatActionsProvider value={actionsValue}>
          <ChatOptionsProvider value={optionsValue}>
            <ChatToolBridge tabId={tabId} callbacks={toolCallbacks}>
              {children}
            </ChatToolBridge>
          </ChatOptionsProvider>
        </ChatActionsProvider>
      </ChatSessionProvider>
    </ChatStateProvider>
  );
}

/**
 * Inner bridge that subscribes to the zustand tool-parts store
 * so that ChatCoreProvider itself does not re-render on every tool-part update.
 */
function ChatToolBridge({
  tabId,
  callbacks,
  children,
}: {
  tabId?: string;
  callbacks: {
    upsertToolPart: (toolCallId: string, next: any) => void;
    markToolStreaming: (toolCallId: string) => void;
    queueToolApprovalPayload: (toolCallId: string, payload: Record<string, unknown>) => void;
    clearToolApprovalPayload: (toolCallId: string) => void;
    continueAfterToolApprovals: () => void;
  };
  children: React.ReactNode;
}) {
  const toolParts = useChatRuntime((state) => {
    if (!tabId) return EMPTY_TOOL_PARTS;
    return state.toolPartsByTabId[tabId] ?? EMPTY_TOOL_PARTS;
  });

  // rAF + startTransition: 与 messages 同样的策略。
  // zustand 的 toolParts 更新频繁，通过 rAF 合并 + startTransition 可中断。
  const [contextToolParts, setContextToolParts] = React.useState(toolParts);
  const toolRafRef = React.useRef(0);
  React.useEffect(() => {
    if (toolRafRef.current) return;
    toolRafRef.current = requestAnimationFrame(() => {
      toolRafRef.current = 0;
      React.startTransition(() => {
        setContextToolParts(useChatRuntime.getState().toolPartsByTabId[tabId ?? ""] ?? EMPTY_TOOL_PARTS);
      });
    });
  }, [toolParts, tabId]);
  React.useEffect(() => () => {
    if (toolRafRef.current) cancelAnimationFrame(toolRafRef.current);
  }, []);

  const toolsValue = React.useMemo(
    () => ({ toolParts: contextToolParts, ...callbacks }),
    [contextToolParts, callbacks],
  );

  return (
    <ChatToolProvider value={toolsValue}>
      {children}
    </ChatToolProvider>
  );
}
