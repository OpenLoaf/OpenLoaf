"use client";

import React, { createContext, useContext, type ReactNode } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

/**
 * 聊天上下文类型
 * 包含聊天所需的所有状态和方法
 */
interface ChatContextType {
  /** 消息列表 */
  messages: UIMessage[];
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
  /** 添加工具结果的方法 */
  addToolResult: ReturnType<typeof useChat>["addToolResult"];
  /** 添加工具输出的方法 */
  addToolOutput: ReturnType<typeof useChat>["addToolOutput"];
  /** 添加工具批准响应的方法 */
  addToolApprovalResponse: ReturnType<
    typeof useChat
  >["addToolApprovalResponse"];
  /** 错误信息 */
  error: ReturnType<typeof useChat>["error"];
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
  const chat = useChat({
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

  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}
