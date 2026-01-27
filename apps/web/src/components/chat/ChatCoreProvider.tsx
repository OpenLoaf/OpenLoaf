"use client";

import React, { type ReactNode } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { generateId, readUIMessageStream, type UIMessageChunk } from "ai";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useTabs } from "@/hooks/use-tabs";
import { useChatRuntime, type ToolPartSnapshot } from "@/hooks/use-chat-runtime";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { createChatTransport } from "@/lib/chat/transport";
import { useBasicConfig } from "@/hooks/use-basic-config";
import type { ImageGenerateOptions } from "@tenas-ai/api/types/image";
import type { CodexOptions } from "@/lib/chat/codex-options";
import type { ChatMessageKind } from "@tenas-ai/api";
import { SUMMARY_HISTORY_COMMAND, SUMMARY_TITLE_COMMAND } from "@tenas-ai/api/common";
import { invalidateChatSessions } from "@/hooks/use-chat-sessions";
import { incrementChatPerf } from "@/lib/chat/chat-perf";
import type { ChatAttachmentInput, MaskedAttachmentInput } from "./input/chat-attachments";
import { createChatSessionId } from "@/lib/chat-session-id";
import { getMessagePlainText } from "@/lib/chat/message-text";
import {
  ChatActionsProvider,
  ChatOptionsProvider,
  ChatSessionProvider,
  ChatStateProvider,
  ChatToolProvider,
} from "./context";
import { useChatBranchState } from "./hooks/use-chat-branch-state";
import { useChatToolStream } from "./hooks/use-chat-tool-stream";
import { useChatLifecycle } from "./hooks/use-chat-lifecycle";
import type { SubAgentStreamState } from "./context/ChatToolContext";

/** Check whether the message is a compact command request. */
function isCompactCommandMessage(input: {
  parts?: unknown[];
  messageKind?: ChatMessageKind;
}): boolean {
  if (input.messageKind === "compact_prompt") return true;
  const text = getMessagePlainText({ parts: input.parts ?? [] });
  return isCommandAtStart(text, SUMMARY_HISTORY_COMMAND);
}

/** Check whether the message is a session command request. */
function isSessionCommandMessage(input: { parts?: unknown[] }): boolean {
  const text = getMessagePlainText({ parts: input.parts ?? [] });
  return isCommandAtStart(text, SUMMARY_TITLE_COMMAND);
}

/** Check whether text starts with the given command token. */
function isCommandAtStart(text: string, command: string): boolean {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith(command)) return false;
  const rest = trimmed.slice(command.length);
  return rest.length === 0 || /^\s/u.test(rest);
}

// 中文注释：提供稳定的空对象，避免 useSyncExternalStore 报错。
const EMPTY_TOOL_PARTS: Record<string, ToolPartSnapshot> = {};

type SubAgentDataPayload = {
  toolCallId?: string;
  name?: string;
  task?: string;
  delta?: string;
  output?: string;
  errorText?: string;
  chunk?: UIMessageChunk;
};

function handleSubAgentDataPart(input: {
  dataPart: any;
  setSubAgentStreams?: React.Dispatch<React.SetStateAction<Record<string, SubAgentStreamState>>>;
  enqueueSubAgentChunk?: (toolCallId: string, chunk: UIMessageChunk) => void;
  closeSubAgentStream?: (
    toolCallId: string,
    state: "output-available" | "output-error",
  ) => void;
}) {
  const type = input.dataPart?.type;
  if (
    type !== "data-sub-agent-start" &&
    type !== "data-sub-agent-delta" &&
    type !== "data-sub-agent-end" &&
    type !== "data-sub-agent-error" &&
    type !== "data-sub-agent-chunk"
  ) {
    return false;
  }

  const payload = input.dataPart?.data as SubAgentDataPayload | undefined;
  const toolCallId = typeof payload?.toolCallId === "string" ? payload?.toolCallId : "";
  if (!toolCallId) return true;

  if (type === "data-sub-agent-chunk") {
    const chunk = payload?.chunk;
    if (!chunk) return true;
    input.enqueueSubAgentChunk?.(toolCallId, chunk);
    return true;
  }

  const setSubAgentStreams = input.setSubAgentStreams;
  if (!setSubAgentStreams) return true;
  if (type === "data-sub-agent-end") {
    input.closeSubAgentStream?.(toolCallId, "output-available");
  }
  if (type === "data-sub-agent-error") {
    input.closeSubAgentStream?.(toolCallId, "output-error");
  }

  setSubAgentStreams((prev) => {
    const current = prev[toolCallId] ?? {
      toolCallId,
      output: "",
      state: "output-streaming",
    };

    if (type === "data-sub-agent-start") {
      const name = typeof payload?.name === "string" ? payload?.name : "";
      const task = typeof payload?.task === "string" ? payload?.task : "";
      return {
        ...prev,
        [toolCallId]: {
          ...current,
          name: name || current.name,
          task: task || current.task,
          state: "output-streaming",
          streaming: true,
        },
      };
    }

    if (type === "data-sub-agent-delta") {
      const delta = typeof payload?.delta === "string" ? payload?.delta : "";
      return {
        ...prev,
        [toolCallId]: {
          ...current,
          output: `${current.output}${delta}`,
          state: "output-streaming",
          streaming: true,
        },
      };
    }

    if (type === "data-sub-agent-end") {
      const output = typeof payload?.output === "string" ? payload?.output : "";
      return {
        ...prev,
        [toolCallId]: {
          ...current,
          output: output || current.output,
          state: "output-available",
          streaming: false,
        },
      };
    }

    if (type === "data-sub-agent-error") {
      const errorText = typeof payload?.errorText === "string" ? payload?.errorText : "";
      return {
        ...prev,
        [toolCallId]: {
          ...current,
          errorText: errorText || current.errorText,
          state: "output-error",
          streaming: false,
        },
      };
    }

    return prev;
  });

  return true;
}

function handleStepThinkingDataPart(input: {
  dataPart: any;
  setStepThinking?: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const type = input.dataPart?.type;
  if (type !== "data-step-thinking") return false;
  const setStepThinking = input.setStepThinking;
  if (!setStepThinking) return true;

  const active = Boolean(input.dataPart?.data?.active);
  // 中文注释：由服务端按 step 事件触发显隐。
  setStepThinking(active);
  return true;
}

/**
 * Chat provider component.
 * Provides chat state and actions to children.
 */
type ChatCoreProviderProps = {
  /** Children nodes inside chat provider. */
  children: ReactNode;
  /** Current tab id. */
  tabId?: string;
  /** Current session id. */
  sessionId: string;
  /** Whether to load history messages. */
  loadHistory?: boolean;
  /** Extra params sent with chat requests. */
  params?: Record<string, unknown>;
  /** Session change handler. */
  onSessionChange?: (
    sessionId: string,
    options?: { loadHistory?: boolean }
  ) => void;
  /** Selected chat model id. */
  chatModelId?: string | null;
  /** Selected chat model source. */
  chatModelSource?: string | null;
  /** Add image attachments to the chat input. */
  addAttachments?: (files: FileList | ChatAttachmentInput[]) => void;
  /** Add a masked attachment to the chat input. */
  addMaskedAttachment?: (input: MaskedAttachmentInput) => void;
};

export default function ChatCoreProvider({
  children,
  tabId,
  sessionId,
  loadHistory,
  params,
  onSessionChange,
  chatModelId,
  chatModelSource,
  addAttachments,
  addMaskedAttachment,
}: ChatCoreProviderProps) {
  const {
    leafMessageId,
    setLeafMessageId,
    branchMessageIds,
    setBranchMessageIds,
    siblingNav,
    setSiblingNav,
    refreshBranchMeta,
  } = useChatBranchState(sessionId);
  const [subAgentStreams, setSubAgentStreams] = React.useState<
    Record<string, SubAgentStreamState>
  >({});
  const subAgentStreamControllersRef = React.useRef(
    new Map<string, ReadableStreamDefaultController<UIMessageChunk>>(),
  );
  const [stepThinking, setStepThinking] = React.useState(false);
  const [sessionErrorMessage, setSessionErrorMessage] = React.useState<string | null>(null);
  const upsertToolPart = useChatRuntime((s) => s.upsertToolPart);
  const clearToolPartsForTab = useChatRuntime((s) => s.clearToolPartsForTab);
  const queryClient = useQueryClient();
  const { basic } = useBasicConfig();
  const toolStream = useChatToolStream();

  // 中文注释：每 5 次 assistant 回复触发自动标题更新。
  const autoTitleMutation = useMutation({
    ...(trpc.chat.autoTitle.mutationOptions() as any),
    onSuccess: () => {
      invalidateChatSessions(queryClient);
    },
  });
  const deleteMessageSubtreeMutation = useMutation(
    trpc.chatmessage.deleteManyChatMessage.mutationOptions()
  );
  const sessionIdRef = React.useRef(sessionId);
  sessionIdRef.current = sessionId;
  const chatModelIdRef = React.useRef<string | null>(
    typeof chatModelId === "string" ? chatModelId : null
  );
  const chatModelSourceRef = React.useRef<string | null>(
    typeof chatModelSource === "string" ? chatModelSource : null
  );

  // 关键：记录一次请求对应的 userMessageId（用于在 onFinish 补齐 assistant.parentMessageId）
  const pendingUserMessageIdRef = React.useRef<string | null>(null);
  // 关键：仅 retry/resend 会产生 sibling，需要在 SSE 完整结束后刷新 siblingNav
  const needsBranchMetaRefreshRef = React.useRef(false);
  // 关键：useChat 的 onFinish 里需要 setMessages，但 chat 在 hook 调用之后才可用
  const setMessagesRef = React.useRef<ReturnType<typeof useChat>["setMessages"] | null>(null);
  // 关键：标记当前请求是否为 compact，以便回写 compact_summary。
  const pendingCompactRequestRef = React.useRef<string | null>(null);
  // 关键：session command 不应更新 leafMessageId。
  const pendingSessionCommandRef = React.useRef<string | null>(null);
  // 关键：用于自动标题更新的回复计数与首条消息刷新。
  const assistantReplyCountRef = React.useRef(0);
  const pendingInitialTitleRefreshRef = React.useRef(false);

  const ensureSubAgentStreamController = React.useCallback(
    (toolCallId: string) => {
      const existing = subAgentStreamControllersRef.current.get(toolCallId);
      if (existing) return existing;

      let controller: ReadableStreamDefaultController<UIMessageChunk> | null = null;
      const stream = new ReadableStream<UIMessageChunk>({
        start(controllerParam) {
          controller = controllerParam;
        },
      });
      if (!controller) return null;
      subAgentStreamControllersRef.current.set(toolCallId, controller);

      const messageStream = readUIMessageStream({
        stream,
      });

      (async () => {
        try {
          for await (const message of messageStream as AsyncIterable<{
            parts?: unknown[];
          }>) {
            setSubAgentStreams((prev) => {
              const current = prev[toolCallId] ?? {
                toolCallId,
                output: "",
                state: "output-streaming",
              };
              return {
                ...prev,
                [toolCallId]: {
                  ...current,
                  parts: Array.isArray(message.parts) ? message.parts : current.parts,
                  state: "output-streaming",
                  streaming: true,
                },
              };
            });
          }
        } finally {
          setSubAgentStreams((prev) => {
            const current = prev[toolCallId];
            if (!current) return prev;
            return {
              ...prev,
              [toolCallId]: {
                ...current,
                streaming: false,
              },
            };
          });
        }
      })();

      return controller;
    },
    [setSubAgentStreams],
  );

  const enqueueSubAgentChunk = React.useCallback(
    (toolCallId: string, chunk: UIMessageChunk) => {
      const controller = ensureSubAgentStreamController(toolCallId);
      if (!controller) return;
      controller.enqueue(chunk);
      const type = (chunk as any)?.type;
      if (type === "finish" || type === "error" || type === "abort") {
        controller.close();
        subAgentStreamControllersRef.current.delete(toolCallId);
        setSubAgentStreams((prev) => {
          const current = prev[toolCallId];
          if (!current) return prev;
          return {
            ...prev,
            [toolCallId]: {
              ...current,
              streaming: false,
              state: type === "error" || type === "abort" ? "output-error" : "output-available",
            },
          };
        });
      }
    },
    [ensureSubAgentStreamController, setSubAgentStreams],
  );

  const closeSubAgentStream = React.useCallback(
    (toolCallId: string, state: "output-available" | "output-error") => {
      const controller = subAgentStreamControllersRef.current.get(toolCallId);
      if (controller) {
        controller.close();
        subAgentStreamControllersRef.current.delete(toolCallId);
      }
      setSubAgentStreams((prev) => {
        const current = prev[toolCallId];
        if (!current) return prev;
        return {
          ...prev,
          [toolCallId]: {
            ...current,
            streaming: false,
            state,
          },
        };
      });
    },
    [setSubAgentStreams],
  );

  React.useEffect(() => {
    assistantReplyCountRef.current = 0;
    pendingInitialTitleRefreshRef.current = false;
  }, [sessionId]);

  React.useEffect(() => {
    if (tabId) {
      clearToolPartsForTab(tabId);
    }
  }, [tabId, clearToolPartsForTab]);

  const paramsRef = React.useRef<Record<string, unknown> | undefined>(params);
  const tabIdRef = React.useRef<string | null | undefined>(tabId);
  const workspaceId = React.useMemo(() => {
    if (typeof params?.workspaceId !== "string") return undefined;
    const trimmed = params.workspaceId.trim();
    return trimmed ? trimmed : undefined;
  }, [params]);
  const projectId = React.useMemo(() => {
    if (typeof params?.projectId !== "string") return undefined;
    const trimmed = params.projectId.trim();
    return trimmed ? trimmed : undefined;
  }, [params]);

  React.useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  React.useEffect(() => {
    tabIdRef.current = tabId;
  }, [tabId]);

  React.useEffect(() => {
    // 中文注释：为空代表 Auto，不透传 chatModelId。
    chatModelIdRef.current =
      typeof chatModelId === "string" ? chatModelId.trim() || null : null;
  }, [chatModelId]);

  React.useEffect(() => {
    // 中文注释：仅允许 local/cloud，其他值视为未传。
    chatModelSourceRef.current =
      typeof chatModelSource === "string" ? chatModelSource.trim() || null : null;
  }, [chatModelSource]);

  const upsertToolPartMerged = React.useCallback(
    (key: string, next: Partial<Parameters<typeof upsertToolPart>[2]>) => {
      if (!tabId) return;
      const current = useChatRuntime.getState().toolPartsByTabId[tabId]?.[key];
      upsertToolPart(tabId, key, { ...current, ...next } as any);
    },
    [tabId, upsertToolPart]
  );

  const transport = React.useMemo(() => {
    return createChatTransport({ paramsRef, tabIdRef, chatModelIdRef, chatModelSourceRef });
  }, []);

  const onFinish = React.useCallback(
    ({ message }: { message: UIMessage }) => {
      // 关键：切换 session 后，旧请求的 onFinish 可能晚到；必须忽略，避免污染新会话的 leafMessageId。
      if (sessionIdRef.current !== sessionId) return;
      if (pendingSessionCommandRef.current) {
        pendingSessionCommandRef.current = null;
        pendingUserMessageIdRef.current = null;
        pendingCompactRequestRef.current = null;
        return;
      }
      const assistantId = String((message as any)?.id ?? "");
      if (!assistantId) return;
      setLeafMessageId(assistantId);

      const parentUserMessageId = pendingUserMessageIdRef.current;
      pendingUserMessageIdRef.current = null;
      if (parentUserMessageId && setMessagesRef.current) {
        // 关键：AI SDK 的 assistant message 默认不带 parentMessageId（我们扩展字段），这里统一补齐
        setMessagesRef.current((messages) =>
          (messages as any[]).map((m) =>
            String((m as any)?.id) === assistantId &&
            ((m as any)?.parentMessageId === undefined ||
              (m as any)?.parentMessageId === null)
              ? { ...(m as any), parentMessageId: parentUserMessageId }
              : m
          )
        );
      }
      if (parentUserMessageId && pendingCompactRequestRef.current === parentUserMessageId) {
        pendingCompactRequestRef.current = null;
        if (setMessagesRef.current) {
          setMessagesRef.current((messages) =>
            (messages as any[]).map((m) =>
              String((m as any)?.id) === assistantId
                ? { ...(m as any), messageKind: "compact_summary" }
                : m
            )
          );
        }
      }

      // 关键：retry/resend 的 sibling 信息必须等 SSE 完全结束后再刷新（否则 DB 还没落库）
      if (needsBranchMetaRefreshRef.current) {
        needsBranchMetaRefreshRef.current = false;
        void refreshBranchMeta(assistantId);
      }
      // 中文注释：成功完成后清空会话错误提示。
      setSessionErrorMessage(null);
      if (pendingInitialTitleRefreshRef.current) {
        pendingInitialTitleRefreshRef.current = false;
        invalidateChatSessions(queryClient);
      }
      // 中文注释：每 5 次 assistant 回复触发 AI 自动标题。
      assistantReplyCountRef.current += 1;
      if (assistantReplyCountRef.current % 5 === 0 && !autoTitleMutation.isPending) {
        autoTitleMutation.mutate({ sessionId } as any);
      }
    },
    [autoTitleMutation, queryClient, refreshBranchMeta, sessionId, setLeafMessageId]
  );

  const chatConfig = React.useMemo(
    () => ({
      id: sessionId,
      // 关键：不要用 useChat 的自动续接，保持流程可控。
      resume: false,
      transport,
      onFinish,
      onData: (dataPart: any) => {
        // 关键：切换 session 后忽略旧流的 dataPart，避免 toolParts 被写回新会话 UI。
        if (sessionIdRef.current !== sessionId) return;
        incrementChatPerf("chat.onData");
        if (dataPart?.type === "data-session-title") {
          invalidateChatSessions(queryClient);
          const title =
            typeof dataPart?.data?.title === "string" ? dataPart.data.title.trim() : "";
          const sessionIdInData =
            typeof dataPart?.data?.sessionId === "string" ? dataPart.data.sessionId : "";
          if (title && tabId && (!sessionIdInData || sessionIdInData === sessionIdRef.current)) {
            const tab = useTabs.getState().getTabById(tabId);
            const hasBase = Boolean(useTabRuntime.getState().runtimeByTabId[tabId]?.base);
            if (tab && !hasBase && tab.title !== title) {
              useTabs.getState().setTabTitle(tabId, title);
            }
          }
          return;
        }
        if (handleStepThinkingDataPart({ dataPart, setStepThinking })) return;
        if (
          handleSubAgentDataPart({
            dataPart,
            setSubAgentStreams,
            enqueueSubAgentChunk,
            closeSubAgentStream,
          })
        )
          return;
        toolStream.handleDataPart({ dataPart, tabId, upsertToolPartMerged });
      },
    }),
    [
      sessionId,
      tabId,
      transport,
      upsertToolPartMerged,
      onFinish,
      setSubAgentStreams,
      setStepThinking,
      queryClient,
      toolStream,
    ]
  );

  const chat = useChat(chatConfig);
  setMessagesRef.current = chat.setMessages;

  const effectiveError =
    chat.error ??
    (chat.status === "ready" && sessionErrorMessage
      ? new Error(sessionErrorMessage)
      : undefined);

  useChatLifecycle({
    tabId,
    sessionId,
    status: chat.status,
    soundEnabled: basic.modelSoundEnabled,
    snapshotEnabled: chat.status !== "ready",
  });

  React.useEffect(() => {
    if (!tabId) return;
    // 中文注释：确保 tool parts 与消息同步，兼容部分运行环境不触发 onData 的场景。
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
      void toolStream.executeFromToolPart({ part, tabId });
    }
  }, [chat.messages, chat.status, tabId, toolStream]);

  // 中文注释：仅在显式需要时才拉取历史，避免新会话多余请求。
  const shouldLoadHistory = Boolean(loadHistory);

  /** Stop streaming and reset local state before switching sessions. */
  const stopAndResetSession = React.useCallback(
    (clearTools: boolean) => {
      // 中文注释：切换会话前必须停止流式并清空本地状态，避免脏数据串流。
      chat.stop();
      chat.setMessages([]);
      pendingUserMessageIdRef.current = null;
      needsBranchMetaRefreshRef.current = false;
      pendingCompactRequestRef.current = null;
      setLeafMessageId(null);
      setBranchMessageIds([]);
      setSiblingNav({});
      setSubAgentStreams({});
      subAgentStreamControllersRef.current.forEach((controller) => {
        controller.close();
      });
      subAgentStreamControllersRef.current.clear();
      setStepThinking(false);
      setSessionErrorMessage(null);
      if (clearTools && tabId) clearToolPartsForTab(tabId);
    },
    [
      chat.stop,
      chat.setMessages,
      tabId,
      clearToolPartsForTab,
      setLeafMessageId,
      setBranchMessageIds,
      setSiblingNav,
    ]
  );

  React.useLayoutEffect(() => {
    // 关键：sessionId 可能由外部状态直接切换（不一定走 newSession/selectSession）。
    // 必须在浏览器可交互前完成清理，否则首条消息会错误复用旧 leaf 作为 parentMessageId。
    stopAndResetSession(true);
  }, [sessionId, stopAndResetSession]);

  // 使用 tRPC 拉取“当前视图”（主链消息 + sibling 导航）
  const branchQuery = useQuery(
    {
      ...trpc.chat.getChatView.queryOptions({
        sessionId,
        window: { limit: 50 },
        includeToolOutput: false,
      }),
      enabled: shouldLoadHistory && chat.messages.length === 0,
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnWindowFocus: false,
    },
  );

  const isHistoryLoading =
    shouldLoadHistory && (branchQuery.isLoading || branchQuery.isFetching);

  React.useEffect(() => {
    const data = branchQuery.data;
    if (!data) return;
    const nextErrorMessage =
      typeof data.errorMessage === "string" ? data.errorMessage : null;
    setSessionErrorMessage(nextErrorMessage);

    // 关键：历史接口已按时间正序返回（最早在前），可直接渲染
    if (chat.messages.length === 0) {
      const messages = (data.messages ?? []) as UIMessage[];
      chat.setMessages(messages);
      if (tabId) {
        clearToolPartsForTab(tabId);
        toolStream.syncFromMessages({ tabId, messages });
      }
    }
    setLeafMessageId(data.leafMessageId ?? null);
    setBranchMessageIds(data.branchMessageIds ?? []);
    setSiblingNav((data.siblingNav ?? {}) as any);
  }, [
    branchQuery.data,
    chat.messages.length,
    chat.setMessages,
    tabId,
    clearToolPartsForTab,
    setLeafMessageId,
    setBranchMessageIds,
    setSiblingNav,
    toolStream,
  ]);

  const updateMessage = React.useCallback(
    (id: string, updates: Partial<UIMessage>) => {
      chat.setMessages((messages) =>
        messages.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg))
      );
    },
    [chat.setMessages]
  );

  const newSession = React.useCallback(() => {
    // 中文注释：立即清空，避免 UI 闪回旧消息。
    stopAndResetSession(true);
    onSessionChange?.(createChatSessionId(), { loadHistory: false });
  }, [stopAndResetSession, onSessionChange]);

  const selectSession = React.useCallback(
    (nextSessionId: string) => {
      // 中文注释：立即清空，避免 UI 闪回旧消息。
      stopAndResetSession(true);
      onSessionChange?.(nextSessionId, { loadHistory: true });
    },
    [stopAndResetSession, onSessionChange]
  );

  const [input, setInput] = React.useState("");
  /** Image options for this chat session. */
  const [imageOptions, setImageOptions] = React.useState<ImageGenerateOptions | undefined>(undefined);
  /** Codex options for this chat session. */
  const [codexOptions, setCodexOptions] = React.useState<CodexOptions | undefined>(undefined);

  React.useEffect(() => {
    // 关键：空消息列表时不应存在 leafMessageId（否则会把“脏 leaf”带进首条消息的 parentMessageId）
    if ((chat.messages?.length ?? 0) === 0 && leafMessageId) {
      setLeafMessageId(null);
    }
  }, [chat.messages?.length, leafMessageId, setLeafMessageId]);

  // 发送消息后立即滚动到底部（即使 AI 还没开始返回内容）
  const sendMessage = React.useCallback(
    (...args: Parameters<typeof chat.sendMessage>) => {
      const [message, options] = args as any[];
      if (!message) return (chat.sendMessage as any)(message, options);

      // 关键：parentMessageId 是消息树的核心字段，必须挂在 UIMessage 顶层（不放 metadata）
      const explicitParentMessageId =
        typeof message?.parentMessageId === "string" || message?.parentMessageId === null
          ? message.parentMessageId
          : undefined;
      const lastMessageId =
        (chat.messages?.length ?? 0) === 0
          ? null
          : (String((chat.messages as any[])?.at(-1)?.id ?? "") || null);
      const isLeafInCurrentMessages =
        typeof leafMessageId === "string" &&
        leafMessageId.length > 0 &&
        Boolean((chat.messages as any[])?.some((m) => String((m as any)?.id) === leafMessageId));
      const fallbackParentMessageId =
        (chat.messages?.length ?? 0) === 0
          ? null
          : (isLeafInCurrentMessages ? leafMessageId : null) ?? lastMessageId;
      // 关键：explicitParentMessageId 允许为 null（根节点），不能被 leafMessageId 覆盖
      const parentMessageId =
        explicitParentMessageId !== undefined ? explicitParentMessageId : fallbackParentMessageId;
      const nextMessageRaw =
        message && typeof message === "object" && "text" in message
          ? { parts: [{ type: "text", text: String((message as any).text ?? "") }] }
          : { ...(message ?? {}) };

      // 关键：统一生成 user messageId，确保服务端可稳定落库
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
        // 中文注释：/summary-history 指令统一标记为 compact_prompt，避免 UI 直接展示。
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
        !(chat.messages ?? []).some((m) => (m as any)?.role === "user") &&
        !isCompactCommandMessage(nextMessage) &&
        !isSessionCommandMessage(nextMessage)
      ) {
        // 中文注释：首条用户消息完成后刷新会话列表，展示标题。
        pendingInitialTitleRefreshRef.current = true;
      }

      pendingUserMessageIdRef.current = String(nextMessage.id);

      const result = (chat.sendMessage as any)(nextMessage, options);
      return result;
    },
    [chat.sendMessage, chat.messages, leafMessageId]
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

      chat.stop();

      const data = await queryClient.fetchQuery(
        trpc.chat.getChatView.queryOptions({
          sessionId,
          anchor: { messageId: targetId, strategy: "latestLeafInSubtree" },
          window: { limit: 50 },
          includeToolOutput: false,
        })
      );
      // 关键：切分支时，用服务端返回的“当前链快照”覆盖本地 messages（避免前端拼接导致重复渲染）
      const messages = (data?.messages ?? []) as UIMessage[];
      chat.setMessages(messages);
      if (tabId) {
        clearToolPartsForTab(tabId);
        toolStream.syncFromMessages({ tabId, messages });
      }
      setLeafMessageId(data?.leafMessageId ?? null);
      setBranchMessageIds(data?.branchMessageIds ?? []);
      setSiblingNav((data?.siblingNav ?? {}) as any);
    },
    [
      siblingNav,
      chat.stop,
      chat.setMessages,
      queryClient,
      sessionId,
      tabId,
      clearToolPartsForTab,
      setLeafMessageId,
      setBranchMessageIds,
      setSiblingNav,
      toolStream,
    ]
  );

  const retryAssistantMessage = React.useCallback(
    async (assistantMessageId: string) => {
      const assistant = (chat.messages as any[]).find((m) => String(m?.id) === assistantMessageId);
      if (!assistant) return;

      // 关键：AI 重试 = 重发该 assistant 的 parent user 消息（但不重复保存 user 到 DB）
      let parentUserMessageId =
        (assistant as any)?.parentMessageId ?? siblingNav?.[assistantMessageId]?.parentMessageId ?? null;
      if (!parentUserMessageId) {
        // 兜底：不请求服务端，直接在当前 messages 中向上找最近的 user（MVP）
        const current = chat.messages as any[];
        const idx = current.findIndex((m) => String(m?.id) === assistantMessageId);
        if (idx >= 0) {
          for (let i = idx - 1; i >= 0; i -= 1) {
            if (current[i]?.role === "user") {
              parentUserMessageId = String(current[i].id);
              break;
            }
          }
        }
      }
      if (!parentUserMessageId) return;

      chat.stop();

      // 关键：retry 不应在 SSE 完成前请求历史接口（此时 DB 还没落库，拿不到新 sibling）。
      // 这里直接在前端本地“切链”：保留到 parent user 为止，隐藏其后的旧分支内容。
      const currentMessages = chat.messages as any[];
      const userIndex = currentMessages.findIndex((m) => String(m?.id) === parentUserMessageId);
      if (userIndex < 0) return;

      const slicedMessages = currentMessages.slice(0, userIndex + 1) as UIMessage[];
      chat.setMessages(slicedMessages);
      if (tabId) {
        clearToolPartsForTab(tabId);
        toolStream.syncFromMessages({ tabId, messages: slicedMessages });
      }
      setLeafMessageId(parentUserMessageId);
      const chainIdx = branchMessageIds.indexOf(parentUserMessageId);
      if (chainIdx >= 0) {
        setBranchMessageIds(branchMessageIds.slice(0, chainIdx + 1));
      }

      // 关键：retry 走 AI SDK v6 原生 regenerate（trigger: regenerate-message）
      // - 我们先把本地 messages 切到目标 user（成为最后一条消息）
      // - 然后直接 regenerate()：服务端按 regenerate-message 复用该 user 节点生成新 assistant sibling
      pendingUserMessageIdRef.current = parentUserMessageId;
      needsBranchMetaRefreshRef.current = true;
      await (chat.regenerate as any)({ body: { retry: true } });
    },
    [
      chat.stop,
      chat.messages,
      chat.setMessages,
      chat.regenerate,
      siblingNav,
      tabId,
      clearToolPartsForTab,
      branchMessageIds,
      setLeafMessageId,
      setBranchMessageIds,
      toolStream,
    ]
  );

  const resendUserMessage = React.useCallback(
    async (userMessageId: string, nextText: string, nextParts?: any[]) => {
      const user = (chat.messages as any[]).find((m) => String(m?.id) === userMessageId);
      if (!user || user.role !== "user") return;
      const parentMessageId =
        typeof (user as any)?.parentMessageId === "string" || (user as any)?.parentMessageId === null
          ? ((user as any).parentMessageId as string | null)
          : null;

      chat.stop();

      // 关键：编辑重发只需要本地切链（不提前请求历史接口）。
      // - 有 parent：保留到 parent 节点为止，隐藏旧 user 及其后续内容
      // - 无 parent：清空对话，从根重新开始
      if (parentMessageId) {
        const currentMessages = chat.messages as any[];
        const parentIndex = currentMessages.findIndex((m) => String(m?.id) === parentMessageId);
        if (parentIndex < 0) return;
        const slicedMessages = currentMessages.slice(0, parentIndex + 1) as UIMessage[];
        chat.setMessages(slicedMessages);
        if (tabId) {
          clearToolPartsForTab(tabId);
          toolStream.syncFromMessages({ tabId, messages: slicedMessages });
        }
        setLeafMessageId(parentMessageId);
        const chainIdx = branchMessageIds.indexOf(parentMessageId);
        if (chainIdx >= 0) {
          setBranchMessageIds(branchMessageIds.slice(0, chainIdx + 1));
        }
      } else {
        chat.setMessages([]);
        if (tabId) clearToolPartsForTab(tabId);
        setLeafMessageId(null);
        setBranchMessageIds([]);
        setSiblingNav({});
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
      chat.stop,
      chat.messages,
      chat.setMessages,
      sendMessage,
      tabId,
      clearToolPartsForTab,
      branchMessageIds,
      setLeafMessageId,
      setBranchMessageIds,
      setSiblingNav,
      toolStream,
    ]
  );

  /**
   * Delete a message subtree and refresh the current view snapshot.
   */
  const deleteMessageSubtree = React.useCallback(
    async (messageId: string) => {
      const normalizedId = String(messageId ?? "").trim();
      if (!normalizedId) return false;

      chat.stop();

      // 中文注释：先定位目标消息的 path/parent，防止误删其他会话数据。
      const target = await queryClient.fetchQuery(
        trpc.chatmessage.findUniqueChatMessage.queryOptions({
          where: { id: normalizedId },
          select: { id: true, sessionId: true, parentMessageId: true, path: true },
        })
      );
      if (!target || target.sessionId !== sessionId) return false;

      const targetPath = String((target as any)?.path ?? "");
      if (!targetPath) return false;

      // 中文注释：按 path 前缀删除整个子树（包含自身与所有后代）。
      await deleteMessageSubtreeMutation.mutateAsync({
        where: {
          sessionId,
          path: { startsWith: targetPath },
        },
      });

      // 中文注释：删除后回到父节点视图，刷新消息与分支导航。
      const viewInput: Parameters<typeof trpc.chat.getChatView.queryOptions>[0] = {
        sessionId,
        window: { limit: 50 },
        includeToolOutput: false,
      };
      if (target.parentMessageId) {
        viewInput.anchor = { messageId: String(target.parentMessageId) };
      }

      const data = await queryClient.fetchQuery(
        trpc.chat.getChatView.queryOptions(viewInput)
      );
      const messages = (data?.messages ?? []) as UIMessage[];
      chat.setMessages(messages);
      if (tabId) {
        clearToolPartsForTab(tabId);
        toolStream.syncFromMessages({ tabId, messages });
      }
      setLeafMessageId(data?.leafMessageId ?? null);
      setBranchMessageIds(data?.branchMessageIds ?? []);
      setSiblingNav((data?.siblingNav ?? {}) as any);
      return true;
    },
    [
      chat.stop,
      chat.setMessages,
      queryClient,
      deleteMessageSubtreeMutation.mutateAsync,
      sessionId,
      tabId,
      clearToolPartsForTab,
      setLeafMessageId,
      setBranchMessageIds,
      setSiblingNav,
      toolStream,
    ]
  );

  const stopGenerating = React.useCallback(() => {
    // 中文注释：使用 AI SDK 内置中断，直接终止当前请求。
    chat.stop();
  }, [chat]);

  const toolParts = useChatRuntime((state) => {
    if (!tabId) return EMPTY_TOOL_PARTS;
    return state.toolPartsByTabId[tabId] ?? EMPTY_TOOL_PARTS;
  });

  const upsertToolPartForTab = React.useCallback(
    (toolCallId: string, next: Parameters<typeof upsertToolPart>[2]) => {
      if (!tabId) return;
      upsertToolPart(tabId, toolCallId, next);
    },
    [tabId, upsertToolPart]
  );

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

  const stateValue = React.useMemo(
    () => ({
      messages: chat.messages as UIMessage[],
      status: chat.status,
      error: effectiveError,
      isHistoryLoading,
      stepThinking,
    }),
    [chat.messages, chat.status, effectiveError, isHistoryLoading, stepThinking]
  );

  const sessionValue = React.useMemo(
    () => ({
      sessionId,
      tabId,
      workspaceId,
      projectId,
      leafMessageId,
      branchMessageIds,
      siblingNav,
    }),
    [
      sessionId,
      tabId,
      workspaceId,
      projectId,
      leafMessageId,
      branchMessageIds,
      siblingNav,
    ]
  );

  const actionsValue = React.useMemo(
    () => ({
      sendMessage,
      regenerate: chat.regenerate,
      addToolApprovalResponse: chat.addToolApprovalResponse,
      clearError: chat.clearError,
      stopGenerating,
      updateMessage,
      newSession,
      selectSession,
      switchSibling,
      retryAssistantMessage,
      resendUserMessage,
      deleteMessageSubtree,
    }),
    [
      sendMessage,
      chat.regenerate,
      chat.addToolApprovalResponse,
      chat.clearError,
      stopGenerating,
      updateMessage,
      newSession,
      selectSession,
      switchSibling,
      retryAssistantMessage,
      resendUserMessage,
      deleteMessageSubtree,
    ]
  );

  const optionsValue = React.useMemo(
    () => ({
      input,
      setInput,
      imageOptions,
      setImageOptions,
      codexOptions,
      setCodexOptions,
      addAttachments,
      addMaskedAttachment,
    }),
    [
      input,
      imageOptions,
      codexOptions,
      addAttachments,
      addMaskedAttachment,
    ]
  );

  const toolsValue = React.useMemo(
    () => ({
      toolParts,
      upsertToolPart: upsertToolPartForTab,
      markToolStreaming,
      subAgentStreams,
    }),
    [toolParts, upsertToolPartForTab, markToolStreaming, subAgentStreams]
  );

  return (
    <ChatStateProvider value={stateValue}>
      <ChatSessionProvider value={sessionValue}>
        <ChatActionsProvider value={actionsValue}>
          <ChatOptionsProvider value={optionsValue}>
            <ChatToolProvider value={toolsValue}>
              {children}
            </ChatToolProvider>
          </ChatOptionsProvider>
        </ChatActionsProvider>
      </ChatSessionProvider>
    </ChatStateProvider>
  );
}
