"use client";

import React, { createContext, useContext, type ReactNode } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport, generateId } from "ai";
import { skipToken, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import { useTabs } from "@/hooks/use_tabs";

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
  sessionId,
  loadHistory,
  params,
  onSessionChange,
}: {
  children: ReactNode;
  sessionId: string;
  loadHistory?: boolean;
  params?: Record<string, unknown>;
  onSessionChange?: (
    sessionId: string,
    options?: { loadHistory?: boolean }
  ) => void;
}) {
  const appliedHistorySessionIdRef = React.useRef<string | null>(null);
  const [appliedHistorySessionId, setAppliedHistorySessionId] = React.useState<
    string | null
  >(null);
  const [forceHistoryLoading, setForceHistoryLoading] = React.useState(false);
  const [scrollToBottomToken, setScrollToBottomToken] = React.useState(0);
  const { tabs, activeTabId } = useTabs();

  const chat = useChat({
    id: sessionId,
    // mount 时自动尝试恢复未完成的流（AI SDK v6 内部会触发 GET `${api}/${id}/stream`）
    resume: true,
    transport: new DefaultChatTransport({
      api: `${process.env.NEXT_PUBLIC_SERVER_URL}/chat/sse`,
      credentials: "include",
      prepareSendMessagesRequest({ id, messages, ...requestOptions }) {
        const mergedParams = { ...(params ?? {}), ...(requestOptions ?? {}) };
        if (messages.length === 0) {
          return {
            body: { params: mergedParams, sessionId: id, id, messages: [] },
          };
        }

        const activeTab = tabs.find((tab) => tab.id === activeTabId);

        const lastMessage = {
          ...messages[messages.length - 1],
          metadata: {
            // activeTab:
            activeTab,
          },
        };
        console.log(
          `SendMessage Id: ${id} Messages: ${JSON.stringify(
            lastMessage
          )} Params: ${JSON.stringify(mergedParams)}`
        );

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
        return {
          api: `${process.env.NEXT_PUBLIC_SERVER_URL}/chat/sse/${id}/stream`,
          credentials: "include",
        };
      },
    }),
  });

  type HistoryResponse = {
    messages: UIMessage[];
    nextCursor: string | null;
  };

  const shouldLoadHistory = loadHistory !== false;

  // 使用 tRPC 拉取该 session 的历史消息（倒序返回）
  const historyQuery = useQuery(
    trpc.chat.getChatMessageHistory.queryOptions(
      shouldLoadHistory
        ? ({
            sessionId,
            take: 50,
          } as any)
        : (skipToken as any)
    ) as any
  );
  const historyData = historyQuery.data as HistoryResponse | undefined;

  const isHistoryLoading =
    shouldLoadHistory &&
    (forceHistoryLoading ||
      (appliedHistorySessionId !== sessionId &&
        (historyQuery.isLoading || historyQuery.isFetching)));

  React.useEffect(() => {
    if (!forceHistoryLoading) return;
    // 避免历史接口失败/空响应时一直卡在 skeleton
    if (historyQuery.isError || (historyQuery.isSuccess && !historyData)) {
      appliedHistorySessionIdRef.current = sessionId;
      setAppliedHistorySessionId(sessionId);
      setForceHistoryLoading(false);
    }
  }, [
    forceHistoryLoading,
    historyQuery.isError,
    historyQuery.isSuccess,
    historyData,
    sessionId,
  ]);

  React.useEffect(() => {
    if (!historyData) return;

    // 只在“切换 session”时应用一次，避免 refetch 把正在对话的消息覆盖掉
    if (appliedHistorySessionIdRef.current === sessionId) return;
    appliedHistorySessionIdRef.current = sessionId;

    // API 返回倒序（最新在前），UI 展示通常需要正序（最早在前）
    const chronological = [...historyData.messages].reverse();
    chat.setMessages(chronological);
    setAppliedHistorySessionId(sessionId);
    setForceHistoryLoading(false);
    // 应用历史后，滚动到最底部显示最新消息
    setScrollToBottomToken((n) => n + 1);
  }, [historyData, sessionId, chat.setMessages]);

  const updateMessage = (id: string, updates: Partial<UIMessage>) => {
    // 1) 更新 useChat 的本地消息（立即更新 UI）
    chat.setMessages((messages) =>
      messages.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg))
    );

    // 2) 同步写回 React Query 的 history cache
    //    这样切走再切回同一个 session 时，缓存就是“被 updateMessage 改过的版本”，不会先闪旧
    queryClient.setQueryData(
      (
        trpc.chat.getChatMessageHistory.queryOptions({
          sessionId,
          take: 50,
        } as any) as any
      ).queryKey,
      (prev: HistoryResponse | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((msg) =>
            msg.id === id ? ({ ...msg, ...updates } as any) : msg
          ),
        } as any;
      }
    );
  };

  const newSession = () => {
    if (chat.status !== "ready") {
      chat.stop();
    }
    setForceHistoryLoading(false);
    // 立即清空，避免 UI 闪回旧消息
    chat.setMessages([]);
    appliedHistorySessionIdRef.current = null;
    setAppliedHistorySessionId(null);
    onSessionChange?.(generateId(), { loadHistory: false });
    // 新会话也滚动到底部（此时通常为空，属于安全操作）
    setScrollToBottomToken((n) => n + 1);
  };

  const selectSession = (nextSessionId: string) => {
    if (chat.status !== "ready") {
      chat.stop();
    }
    setForceHistoryLoading(true);
    // 立即清空，避免 UI 闪回旧消息
    chat.setMessages([]);
    appliedHistorySessionIdRef.current = null;
    setAppliedHistorySessionId(null);
    onSessionChange?.(nextSessionId, { loadHistory: true });
    // 先触发一次滚动：避免短暂显示在顶部；历史加载后还会再触发一次
    setScrollToBottomToken((n) => n + 1);
  };

  // 兼容性处理：新版本useChat可能不返回input和setInput
  const [input, setInput] = React.useState("");

  const chatWithFallbacks = {
    ...chat,
    input,
    setInput,
  };

  return (
    <ChatContext.Provider
      value={{
        ...chatWithFallbacks,
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
