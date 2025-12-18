"use client";

import React, {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { generateId } from "ai";
import { skipToken, useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useTabs } from "@/hooks/use-tabs";
import { createChatTransport } from "@/lib/chat/transport";
import { handleChatDataPart } from "@/lib/chat/dataPart";
import { syncToolPartsFromMessages } from "@/lib/chat/toolParts";

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
  /** 当前聊天所属的 Tab ID */
  tabId?: string;
  /** 当前会话 ID（与 useChat 的 id 一致） */
  sessionId: string;
  /** 用户手动停止生成（同时通知服务端终止内存流，避免 resume 继续） */
  stopGenerating: () => void;
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
  const [scrollToBottomToken, setScrollToBottomToken] = React.useState(0);
  const upsertToolPart = useTabs((s) => s.upsertToolPart);
  const clearToolPartsForTab = useTabs((s) => s.clearToolPartsForTab);

  React.useEffect(() => {
    if (tabId) {
      clearToolPartsForTab(tabId);
    }
  }, [tabId, sessionId, clearToolPartsForTab]);

  const paramsRef = React.useRef<Record<string, unknown> | undefined>(params);

  React.useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  const upsertToolPartMerged = React.useCallback(
    (key: string, next: Partial<Parameters<typeof upsertToolPart>[2]>) => {
      if (!tabId) return;
      const current = useTabs.getState().toolPartsByTabId[tabId]?.[key];
      upsertToolPart(tabId, key, { ...current, ...next } as any);
    },
    [tabId, upsertToolPart]
  );

  const transport = React.useMemo(() => {
    return createChatTransport({ paramsRef });
  }, []);

  const chatConfig = React.useMemo(
    () => ({
      id: sessionId,
      // mount 时自动尝试恢复未完成的流（AI SDK v6 内部会触发 GET `${api}/${id}/stream`）
      resume: true,
      transport,
      onData: (dataPart: any) => {
        handleChatDataPart({ dataPart, tabId, upsertToolPartMerged });
      },
    }),
    [sessionId, tabId, transport, upsertToolPartMerged]
  );

  const chat = useChat(chatConfig);

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
    shouldLoadHistory && (historyQuery.isLoading || historyQuery.isFetching);

  React.useEffect(() => {
    const historyData = historyQuery.data;
    if (!historyData) return;

    if (chat.messages.length > 0) return;

    // API 返回倒序（最新在前），UI 展示通常需要正序（最早在前）
    const chronological = [...historyData.messages]
      .reverse()
      .filter((msg): msg is UIMessage => msg.role !== "tool");
    if (chronological.length > 0) {
      chat.setMessages(chronological);
      syncToolPartsFromMessages({ tabId, messages: chronological });
    }
    // 应用历史后，滚动到最底部显示最新消息
    setScrollToBottomToken((n) => n + 1);
  }, [historyQuery.data, chat.setMessages, tabId]);

  const updateMessage = React.useCallback(
    (id: string, updates: Partial<UIMessage>) => {
      chat.setMessages((messages) =>
        messages.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg))
      );
    },
    [chat.setMessages]
  );

  const newSession = React.useCallback(() => {
    chat.stop();
    // 立即清空，避免 UI 闪回旧消息
    chat.setMessages([]);
    onSessionChange?.(generateId(), { loadHistory: false });
    // 新会话也滚动到底部（此时通常为空，属于安全操作）
    setScrollToBottomToken((n) => n + 1);
  }, [chat.stop, chat.setMessages, onSessionChange]);

  const selectSession = React.useCallback(
    (nextSessionId: string) => {
      chat.stop();
      // 立即清空，避免 UI 闪回旧消息
      chat.setMessages([]);
      onSessionChange?.(nextSessionId, { loadHistory: true });
      // 先触发一次滚动：避免短暂显示在顶部；历史加载后还会再触发一次
      setScrollToBottomToken((n) => n + 1);
    },
    [chat.stop, chat.setMessages, onSessionChange]
  );

  const [input, setInput] = React.useState("");

  const stopGenerating = React.useCallback(() => {
    chat.stop();

    const base = process.env.NEXT_PUBLIC_SERVER_URL ?? "";
    // 关键：因为启用了 resume + 内存流续传，单纯 stop()（中断连接）会被自动续传“接着推”。
    // 这里额外通知服务端 stop，使其 abort agent 并删除内存流，彻底停止本次生成。
    fetch(`${base}/chat/sse/${encodeURIComponent(sessionId)}/stop`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {
      // ignore
    });
  }, [chat.stop, sessionId]);

  return (
    <ChatContext.Provider
      value={{
        ...chat,
        input,
        setInput,
        isHistoryLoading,
        scrollToBottomToken,
        newSession,
        selectSession,
        updateMessage,
        tabId,
        sessionId,
        stopGenerating,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
