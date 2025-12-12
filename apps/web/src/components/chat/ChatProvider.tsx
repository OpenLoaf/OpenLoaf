"use client";

import React, { createContext, useContext, type ReactNode } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport, generateId } from "ai";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

/**
 * 聊天上下文类型
 * 包含聊天所需的所有状态和方法
 */
interface ChatContextType {
  /** 当前会话 id（同时作为 sessionId 发给服务端） */
  id: string;
  /** 消息列表 */
  messages: UIMessage[];
  /** 本地覆写消息列表（用于加载历史） */
  setMessages: ReturnType<typeof useChat>["setMessages"];
  /** 用于触发消息列表滚动到底部的信号（自增即可） */
  scrollToBottomToken: number;
  /** 发送消息的方法 */
  sendMessage: ReturnType<typeof useChat>["sendMessage"];
  /** 聊天状态 */
  status: ReturnType<typeof useChat>["status"];
  /** 停止生成消息的方法 */
  stop: ReturnType<typeof useChat>["stop"];
  /** 重新生成消息的方法 */
  regenerate: ReturnType<typeof useChat>["regenerate"];
  /** 清除错误的方法 */
  clearError: ReturnType<typeof useChat>["clearError"];
  /** 恢复流的方法 */
  resumeStream: ReturnType<typeof useChat>["resumeStream"];
  /** 添加工具输出的方法 */
  addToolOutput: ReturnType<typeof useChat>["addToolOutput"];
  /** 添加工具批准响应的方法 */
  addToolApprovalResponse: ReturnType<
    typeof useChat
  >["addToolApprovalResponse"];
  /** 错误信息 */
  error: ReturnType<typeof useChat>["error"];
  /** 是否正在加载/应用该 session 的历史消息 */
  isHistoryLoading: boolean;
  /** 创建新会话（清空消息并切换 id） */
  newSession: () => void;
  /** 切换到某个历史会话，并加载历史消息 */
  selectSession: (sessionId: string) => void;
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
export default function ChatProvider({ children }: { children: ReactNode }) {
  const [chatId, setChatId] = React.useState(() => generateId());
  const appliedHistorySessionIdRef = React.useRef<string | null>(null);
  const [appliedHistorySessionId, setAppliedHistorySessionId] = React.useState<
    string | null
  >(null);
  const [forceHistoryLoading, setForceHistoryLoading] = React.useState(false);
  const [scrollToBottomToken, setScrollToBottomToken] = React.useState(0);

  const chat = useChat({
    id: chatId,
    transport: new DefaultChatTransport({
      api: `${process.env.NEXT_PUBLIC_SERVER_URL}/chat/sse`,
      prepareSendMessagesRequest({ id, messages, ...params }) {
        if (messages.length === 0) {
          return { body: { params, id, messages: [] } };
        }
        const lastMessage = messages[messages.length - 1];
        console.log(
          `SendMessage Id: ${id} Messages: ${JSON.stringify(
            lastMessage
          )} Params: ${JSON.stringify(params)}`
        );

        return {
          body: {
            params,
            id,
            messages: [lastMessage],
          },
        };
      },
    }),
  });

  type HistoryResponse = {
    messages: UIMessage[];
    nextCursor: string | null;
  };

  // 使用 tRPC 拉取该 session 的历史消息（倒序返回）
  const historyQuery = useQuery(
    trpc.chat.getChatMessageHistory.queryOptions({
      sessionId: chatId,
      take: 50,
    } as any) as any
  );
  const historyData = historyQuery.data as HistoryResponse | undefined;

  const isHistoryLoading =
    forceHistoryLoading ||
    (appliedHistorySessionId !== chatId &&
      (historyQuery.isLoading || historyQuery.isFetching));

  React.useEffect(() => {
    if (!forceHistoryLoading) return;
    // 避免历史接口失败/空响应时一直卡在 skeleton
    if (historyQuery.isError || (historyQuery.isSuccess && !historyData)) {
      appliedHistorySessionIdRef.current = chatId;
      setAppliedHistorySessionId(chatId);
      setForceHistoryLoading(false);
    }
  }, [
    forceHistoryLoading,
    historyQuery.isError,
    historyQuery.isSuccess,
    historyData,
    chatId,
  ]);

  React.useEffect(() => {
    if (!historyData) return;
    // 只在“切换 session”时应用一次，避免 refetch 把正在对话的消息覆盖掉
    if (appliedHistorySessionIdRef.current === chatId) return;
    appliedHistorySessionIdRef.current = chatId;

    // API 返回倒序（最新在前），UI 展示通常需要正序（最早在前）
    const chronological = [...historyData.messages].reverse();
    chat.setMessages(chronological);
    setAppliedHistorySessionId(chatId);
    setForceHistoryLoading(false);
    // 应用历史后，滚动到最底部显示最新消息
    setScrollToBottomToken((n) => n + 1);
  }, [historyData, chatId, chat.setMessages]);

  const newSession = () => {
    if (chat.status !== "ready") {
      chat.stop();
    }
    setForceHistoryLoading(true);
    // 立即清空，避免 UI 闪回旧消息
    chat.setMessages([]);
    appliedHistorySessionIdRef.current = null;
    setAppliedHistorySessionId(null);
    setChatId(generateId());
    // 新会话也滚动到底部（此时通常为空，属于安全操作）
    setScrollToBottomToken((n) => n + 1);
  };

  const selectSession = (sessionId: string) => {
    if (chat.status !== "ready") {
      chat.stop();
    }
    setForceHistoryLoading(true);
    // 立即清空，避免 UI 闪回旧消息
    chat.setMessages([]);
    appliedHistorySessionIdRef.current = null;
    setAppliedHistorySessionId(null);
    setChatId(sessionId);
    // 先触发一次滚动：避免短暂显示在顶部；历史加载后还会再触发一次
    setScrollToBottomToken((n) => n + 1);
  };

  return (
    <ChatContext.Provider
      value={{
        ...chat,
        isHistoryLoading,
        scrollToBottomToken,
        newSession,
        selectSession,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
