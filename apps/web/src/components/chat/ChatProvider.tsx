"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport, generateId } from "ai";
import { skipToken, useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useTabs } from "@/hooks/use_tabs";

const CLIENT_STREAM_CLIENT_ID_STORAGE_KEY = "teatime:chat:sse-client-id";

function getStableClientStreamClientId() {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.sessionStorage.getItem(
      CLIENT_STREAM_CLIENT_ID_STORAGE_KEY
    );
    if (existing) return existing;
    const created =
      globalThis.crypto?.randomUUID?.() ?? `cid_${generateId()}`;
    window.sessionStorage.setItem(CLIENT_STREAM_CLIENT_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return globalThis.crypto?.randomUUID?.() ?? `cid_${generateId()}`;
  }
}

function normalizeMessages(messages: UIMessage[]): UIMessage[] {
  const indexById = new Map<string, number>();
  const result: UIMessage[] = [];

  for (const message of messages) {
    const id = typeof message.id === "string" ? message.id : "";
    if (!id) {
      result.push(message);
      continue;
    }

    const existingIndex = indexById.get(id);
    if (existingIndex === undefined) {
      indexById.set(id, result.length);
      result.push(message);
      continue;
    }

    result[existingIndex] = message;
  }

  return result;
}

/**
 * 聊天上下文类型
 * 包含聊天所需的所有状态和方法
 */
interface ChatContextType extends ReturnType<typeof useChat> {
  /** 当前输入框的内容 */
  input: string;
  /** 设置输入框内容的方法 */
  setInput: (value: string) => void;
  /** 用于触发消息列表滚动到底部的信号（自增即可） */
  scrollToBottomToken: number;
  /** 是否正在加载/应用该 session 的历史消息 */
  isHistoryLoading: boolean;
  /** 创建新会话（清空消息并切换 id） */
  newSession: () => void;
  /** 切换到某个历史会话，并加载历史消息 */
  selectSession: (sessionId: string) => void;
  /** 更新单个消息的方法（同时写回 history query cache，确保切回时仍是最新） */
  updateMessage: (id: string, updates: Partial<UIMessage>) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

/**
 * 聊天上下文钩子
 * 用于在组件中访问聊天状态和方法
 */
export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}

/**
 * 聊天提供者组件
 * 用于包裹聊天相关组件，提供聊天状态和方法
 */
export default function ChatProvider({
  children,
  tabId,
  sessionId,
  loadHistory,
  params,
  onSessionChange,
}: {
  children: ReactNode;
  tabId?: string;
  sessionId: string;
  loadHistory?: boolean;
  params?: Record<string, unknown>;
  onSessionChange?: (
    sessionId: string,
    options?: { loadHistory?: boolean }
  ) => void;
}) {
  const appliedHistorySessionIdRef = React.useRef<string | null>(null);
  const [forceHistoryLoading, setForceHistoryLoading] = React.useState(false);
  const [scrollToBottomToken, setScrollToBottomToken] = React.useState(0);
  const tabs = useTabs((s) => s.tabs);
  const activeTabId = useTabs((s) => s.activeTabId);
  const upsertToolPart = useTabs((s) => s.upsertToolPart);
  const pushStackItem = useTabs((s) => s.pushStackItem);
  const clearToolPartsForTab = useTabs((s) => s.clearToolPartsForTab);
  const promoteTab = useTabs((s) => s.promoteTab);

  const activeMessageListSourceRef = React.useRef<string>(generateId());
  const [messageListMessages, setMessageListMessages] = React.useState<
    UIMessage[]
  >([]);

  const setMessageListMessagesFromSource = useCallback(
    (sourceId: string, nextMessages: UIMessage[]) => {
      if (sourceId !== activeMessageListSourceRef.current) return;
      setMessageListMessages(nextMessages);
    },
    []
  );

  const rotateMessageListSource = useCallback(() => {
    activeMessageListSourceRef.current = generateId();
  }, []);

  React.useEffect(() => {
    rotateMessageListSource();
    setMessageListMessages([]);
    appliedHistorySessionIdRef.current = null;
  }, [sessionId, rotateMessageListSource]);

  const openedToolKeysRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    openedToolKeysRef.current = new Set();
    if (tabId) {
      clearToolPartsForTab(tabId);
    }
  }, [tabId, sessionId, clearToolPartsForTab]);

  const paramsRef = React.useRef<Record<string, unknown> | undefined>(params);
  const tabsRef = React.useRef(tabs);
  const activeTabIdRef = React.useRef(activeTabId);

  React.useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  React.useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
  }, [tabs, activeTabId]);

  React.useEffect(() => {
    if (!tabId) return;

    for (const message of messageListMessages) {
      const messageId = typeof message.id === "string" ? message.id : "m";
      const parts = (message as any).parts ?? [];

      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        const type = typeof part?.type === "string" ? part.type : "";
        const isTool = type === "dynamic-tool" || type.startsWith("tool-");
        if (!isTool) continue;

        const toolKey = String(part.toolCallId ?? `${messageId}:${index}`);
        upsertToolPart(tabId, toolKey, {
          type,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          title: part.title,
          state: part.state,
          input: part.input,
          output: part.output,
          errorText: part.errorText,
        });

        const hasResult =
          typeof part.output !== "undefined" ||
          (typeof part.errorText === "string" && part.errorText.length > 0);
        const isDone =
          part.state === "output-available" ||
          part.state === "done" ||
          part.state === "complete";
        if (!hasResult && !isDone) continue;
        if (openedToolKeysRef.current.has(toolKey)) continue;
        openedToolKeysRef.current.add(toolKey);

        const displayName =
          part.title ||
          part.toolName ||
          (type.startsWith("tool-") ? type.slice("tool-".length) : type);

        pushStackItem(tabId, {
          id: `tool:${toolKey}`,
          sourceKey: toolKey,
          title: displayName ? `Tool: ${displayName}` : "Tool Result",
          component: "tool-result",
          params: { toolKey },
        });
      }
    }
  }, [messageListMessages, tabId, pushStackItem, upsertToolPart]);

  const transport = React.useMemo(() => {
    const apiBase = `${process.env.NEXT_PUBLIC_SERVER_URL}/chat/sse`;
    return new DefaultChatTransport({
      api: apiBase,
      credentials: "include",
      prepareSendMessagesRequest({ id, messages, ...requestOptions }) {
        const mergedParams = {
          ...(paramsRef.current ?? {}),
          ...(requestOptions ?? {}),
        };
        if (messages.length === 0) {
          return {
            body: { params: mergedParams, sessionId: id, id, messages: [] },
          };
        }

        const activeTab = tabsRef.current.find(
          (tab) => tab.id === activeTabIdRef.current
        );

        const lastMessage = {
          ...messages[messages.length - 1],
          metadata: {
            activeTab: activeTab
              ? {
                  id: activeTab.id,
                  resourceId: activeTab.resourceId,
                  workspaceId: activeTab.workspaceId,
                  title: activeTab.title,
                  icon: activeTab.icon,
                  chatSessionId: activeTab.chatSessionId,
                }
              : null,
          },
        };

        return {
          body: {
            params: mergedParams,
            sessionId: id,
            id,
            messages: [lastMessage],
          },
        };
      },
      prepareReconnectToStreamRequest: ({ id }) => {
        const clientId = getStableClientStreamClientId();
        return {
          api: `${apiBase}/${id}/stream${
            clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""
          }`,
          credentials: "include",
        };
      },
    });
  }, []);

  const chatConfig = React.useMemo(
    () => ({
      id: sessionId,
      // mount 时自动尝试恢复未完成的流（AI SDK v6 内部会触发 GET `${api}/${id}/stream`）
      resume: true,
      transport,
    }),
    [sessionId, transport]
  );

  const chat = useChat(chatConfig);

  const setMessages = useCallback(
    (
      updater:
        | UIMessage[]
        | ((prev: UIMessage[]) => UIMessage[])
        | undefined
    ) => {
      const source = activeMessageListSourceRef.current;
      if (!updater) return;

      chat.setMessages((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        const normalized = normalizeMessages(next);
        setMessageListMessagesFromSource(source, normalized);
        return normalized;
      });
    },
    [chat.setMessages, setMessageListMessagesFromSource]
  );

  React.useEffect(() => {
    const source = activeMessageListSourceRef.current;
    setMessageListMessagesFromSource(source, normalizeMessages(chat.messages));
  }, [chat.messages, setMessageListMessagesFromSource]);

  const shouldLoadHistory = loadHistory !== false;

  // 使用 tRPC 拉取该 session 的历史消息（倒序返回）
  const historyQuery = useQuery(
    trpc.chat.getChatMessageHistory.queryOptions(
      shouldLoadHistory
        ? {
            sessionId,
            take: 50,
          }
        : skipToken
    )
  );

  const isHistoryLoading =
    shouldLoadHistory &&
    (forceHistoryLoading ||
      (appliedHistorySessionIdRef.current !== sessionId &&
        (historyQuery.isLoading || historyQuery.isFetching)));

  React.useEffect(() => {
    if (!forceHistoryLoading) return;
    // 避免历史接口失败/空响应时一直卡在 skeleton
    if (
      historyQuery.isError ||
      (historyQuery.isSuccess && !historyQuery.data)
    ) {
      appliedHistorySessionIdRef.current = sessionId;
      setForceHistoryLoading(false);
    }
  }, [
    forceHistoryLoading,
    historyQuery.isError,
    historyQuery.isSuccess,
    historyQuery.data,
    sessionId,
  ]);

  React.useEffect(() => {
    const historyData = historyQuery.data;
    if (!historyData) return;

    // 只在“切换 session”时应用一次，避免 refetch 把正在对话的消息覆盖掉
    if (appliedHistorySessionIdRef.current === sessionId) return;
    appliedHistorySessionIdRef.current = sessionId;

    // API 返回倒序（最新在前），UI 展示通常需要正序（最早在前）
    const chronological = [...historyData.messages]
      .reverse()
      .filter((msg): msg is UIMessage => msg.role !== "tool");
    setMessages(chronological);
    setForceHistoryLoading(false);
    // 应用历史后，滚动到最底部显示最新消息
    setScrollToBottomToken((n) => n + 1);
  }, [historyQuery.data, sessionId, setMessages]);

  const updateMessage = useCallback(
    (id: string, updates: Partial<UIMessage>) => {
      // 1) 更新 useChat 的本地消息（立即更新 UI）
      setMessages((messages) =>
        messages.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg))
      );
    },
    [setMessages]
  );

  const newSession = useCallback(() => {
    if (chat.status !== "ready") {
      chat.stop();
    }
    rotateMessageListSource();
    setForceHistoryLoading(false);
    // 立即清空，避免 UI 闪回旧消息
    setMessages([]);
    appliedHistorySessionIdRef.current = null;
    onSessionChange?.(generateId(), { loadHistory: false });
    // 新会话也滚动到底部（此时通常为空，属于安全操作）
    setScrollToBottomToken((n) => n + 1);
  }, [chat, onSessionChange, rotateMessageListSource, setMessages]);

  const selectSession = useCallback(
    (nextSessionId: string) => {
      if (chat.status !== "ready") {
        chat.stop();
      }
      rotateMessageListSource();
      setForceHistoryLoading(true);
      // 立即清空，避免 UI 闪回旧消息
      setMessages([]);
      appliedHistorySessionIdRef.current = null;
      onSessionChange?.(nextSessionId, { loadHistory: true });
      // 先触发一次滚动：避免短暂显示在顶部；历史加载后还会再触发一次
      setScrollToBottomToken((n) => n + 1);
    },
    [chat, onSessionChange, rotateMessageListSource, setMessages]
  );

  // 兼容性处理：新版本useChat可能不返回input和setInput
  const [input, setInput] = React.useState("");

  const sendMessage = useCallback(
    (...args: Parameters<typeof chat.sendMessage>) => {
      if (tabId) promoteTab(tabId);
      return chat.sendMessage(...args);
    },
    [chat.sendMessage, promoteTab, tabId],
  );

  const chatWithFallbacks = {
    ...chat,
    input,
    setInput,
    sendMessage,
  };

  return (
    <ChatContext.Provider
      value={{
        ...chatWithFallbacks,
        messages: messageListMessages,
        isHistoryLoading,
        scrollToBottomToken,
        newSession,
        selectSession,
        updateMessage,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
