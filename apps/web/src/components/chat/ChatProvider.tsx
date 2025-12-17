"use client";

import React, {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport, generateId } from "ai";
import { skipToken, useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useTabs } from "@/hooks/use-tabs";

const CLIENT_STREAM_CLIENT_ID_STORAGE_KEY = "teatime:chat:sse-client-id";
const CLIENT_CONTEXT_PART_TYPE = "data-client-context";
const UI_EVENT_PART_TYPE = "data-ui-event";

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

  const syncToolPartsFromMessages = React.useCallback(
    (messages: UIMessage[]) => {
      if (!tabId) return;
      for (const message of messages) {
        const messageId = typeof message.id === "string" ? message.id : "m";
        const parts = (message as any).parts ?? [];
        for (let index = 0; index < parts.length; index += 1) {
          const part = parts[index];
          const type = typeof part?.type === "string" ? part.type : "";
          const isTool = type === "dynamic-tool" || type.startsWith("tool-");
          if (!isTool) continue;
          const toolKey = String(part.toolCallId ?? `${messageId}:${index}`);
          upsertToolPartMerged(toolKey, {
            type,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            title: part.title,
            state: part.state,
            input: part.input,
            output: part.output,
            errorText: part.errorText,
          });
        }
      }
    },
    [tabId, upsertToolPartMerged]
  );

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

        const { tabs, activeTabId } = useTabs.getState();
        const activeTab = tabs.find((tab) => tab.id === activeTabId);

        const rawLastMessage = messages[messages.length - 1] as any;
        const lastMessage = {
          ...rawLastMessage,
          // 关键：通过 data part 把当前 tab 传给后端（服务端可用于 agent 路由/权限/工具）
          parts: [
            ...(Array.isArray(rawLastMessage?.parts) ? rawLastMessage.parts : []),
            {
              type: CLIENT_CONTEXT_PART_TYPE,
              data: { activeTab: activeTab ?? null },
            },
          ],
        } as any;

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
      onData: (dataPart: any) => {
        // MVP：只处理后端通过 Streaming Custom Data 推来的 UI 事件
        if (dataPart?.type === UI_EVENT_PART_TYPE) {
          const event = dataPart?.data;
          if (event?.kind === "push-stack-item" && event?.tabId && event?.item) {
            useTabs.getState().pushStackItem(event.tabId, event.item);
          }
          return;
        }

        if (!tabId) return;
        switch (dataPart?.type) {
          case "tool-input-start": {
            upsertToolPartMerged(String(dataPart.toolCallId), {
              type: dataPart.dynamic ? "dynamic-tool" : `tool-${dataPart.toolName}`,
              toolCallId: dataPart.toolCallId,
              toolName: dataPart.toolName,
              title: dataPart.title,
              state: "input-streaming",
            });
            break;
          }
          case "tool-input-available": {
            upsertToolPartMerged(String(dataPart.toolCallId), {
              type: dataPart.dynamic ? "dynamic-tool" : `tool-${dataPart.toolName}`,
              toolCallId: dataPart.toolCallId,
              toolName: dataPart.toolName,
              title: dataPart.title,
              state: "input-available",
              input: dataPart.input,
            });
            break;
          }
          case "tool-approval-request": {
            upsertToolPartMerged(String(dataPart.toolCallId), {
              state: "approval-requested",
            });
            break;
          }
          case "tool-output-available": {
            upsertToolPartMerged(String(dataPart.toolCallId), {
              state: "output-available",
              output: dataPart.output,
            });
            break;
          }
          case "tool-output-error": {
            upsertToolPartMerged(String(dataPart.toolCallId), {
              state: "output-error",
              errorText: dataPart.errorText,
            });
            break;
          }
          case "tool-output-denied": {
            upsertToolPartMerged(String(dataPart.toolCallId), {
              state: "output-denied",
            });
            break;
          }
          case "tool-input-error": {
            upsertToolPartMerged(String(dataPart.toolCallId), {
              type: dataPart.dynamic ? "dynamic-tool" : `tool-${dataPart.toolName}`,
              toolCallId: dataPart.toolCallId,
              toolName: dataPart.toolName,
              title: dataPart.title,
              state: "output-error",
              input: dataPart.input,
              errorText: dataPart.errorText,
            });
            break;
          }
          default:
            break;
        }
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
      syncToolPartsFromMessages(chronological);
    }
    // 应用历史后，滚动到最底部显示最新消息
    setScrollToBottomToken((n) => n + 1);
  }, [historyQuery.data, chat.setMessages, syncToolPartsFromMessages]);

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
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
