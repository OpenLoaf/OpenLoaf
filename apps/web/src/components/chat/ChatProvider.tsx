"use client";

import React, {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { generateId } from "ai";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
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
  /** 当前分支的叶子节点（消息树） */
  leafMessageId: string | null;
  /** 当前分支链上的 messageId（用于判断哪些消息可切换 sibling） */
  branchMessageIds: string[];
  /** messageId -> sibling 导航信息 */
  siblingNav: Record<
    string,
    {
      parentMessageId: string | null;
      prevSiblingId: string | null;
      nextSiblingId: string | null;
      siblingIndex: number;
      siblingTotal: number;
    }
  >;
  /** 切换到同父的前一个/后一个分支节点 */
  switchSibling: (messageId: string, direction: "prev" | "next") => void;
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
  const [leafMessageId, setLeafMessageId] = React.useState<string | null>(null);
  const [branchMessageIds, setBranchMessageIds] = React.useState<string[]>([]);
  const [siblingNav, setSiblingNav] = React.useState<
    Record<
      string,
      {
        parentMessageId: string | null;
        prevSiblingId: string | null;
        nextSiblingId: string | null;
        siblingIndex: number;
        siblingTotal: number;
      }
    >
  >({});
  const [branchStart, setBranchStart] = React.useState<{
    startMessageId?: string;
    resolveToLatestLeaf?: boolean;
  }>({});
  const upsertToolPart = useTabs((s) => s.upsertToolPart);
  const clearToolPartsForTab = useTabs((s) => s.clearToolPartsForTab);
  const queryClient = useQueryClient();

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

  // 使用 tRPC 拉取“当前分支链”（消息树）
  const branchQuery = useQuery(
    trpc.chat.getChatBranch.queryOptions(
      shouldLoadHistory
        ? {
            sessionId,
            take: 50,
            ...(branchStart.startMessageId ? { startMessageId: branchStart.startMessageId } : {}),
            ...(branchStart.resolveToLatestLeaf ? { resolveToLatestLeaf: true } : {}),
          }
        : skipToken
    )
  );

  const isHistoryLoading =
    shouldLoadHistory && (branchQuery.isLoading || branchQuery.isFetching);

  React.useEffect(() => {
    const data = branchQuery.data;
    if (!data) return;

    // 关键：API 已按正序返回（最早在前），可直接渲染
    // - 首次加载：写入 messages
    // - 后续刷新（例如重试/分支切换）：只更新分支元信息（siblingNav 等），避免覆盖流式消息内容
    if (chat.messages.length === 0) {
      const messages = (data.messages ?? []).filter((msg): msg is UIMessage => msg.role !== "tool");
      chat.setMessages(messages);
      syncToolPartsFromMessages({ tabId, messages });
      // 应用历史后，滚动到最底部显示最新消息
      setScrollToBottomToken((n) => n + 1);
    }
    setLeafMessageId(data.leafMessageId ?? null);
    setBranchMessageIds(data.branchMessageIds ?? []);
    setSiblingNav(data.siblingNav ?? {});
  }, [branchQuery.data, chat.setMessages, tabId]);

  // 关键：流式生成完成后，把 leafMessageId 移动到最新的“主 assistant”（排除 subAgent）
  React.useEffect(() => {
    const last = chat.messages[chat.messages.length - 1] as any;
    if (!last) return;
    if (last.role !== "assistant") return;
    if (last?.metadata?.agent?.kind === "sub") return;
    setLeafMessageId(String(last.id));
  }, [chat.messages]);

  const fetchBranchMeta = React.useCallback(
    async ({
      startMessageId,
      resolveToLatestLeaf,
    }: {
      startMessageId: string;
      resolveToLatestLeaf?: boolean;
    }) => {
      // 关键：只拉取分支链/导航信息；不覆盖当前流式 messages
      const data = await queryClient.fetchQuery(
        trpc.chat.getChatBranch.queryOptions({
          sessionId,
          take: 50,
          startMessageId,
          ...(resolveToLatestLeaf ? { resolveToLatestLeaf: true } : {}),
        })
      );
      setLeafMessageId(data.leafMessageId ?? null);
      setBranchMessageIds(data.branchMessageIds ?? []);
      setSiblingNav(data.siblingNav ?? {});
      // 关键：把当前“选中的 leaf”写入分支查询 key，避免后续 refetch 又回到默认分支
      setBranchStart(
        data.leafMessageId
          ? { startMessageId: data.leafMessageId }
          : { startMessageId }
      );
    },
    [queryClient, sessionId]
  );

  const lastRefreshedLeafRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    // 关键：重试/生成结束后，需要刷新 siblingNav，否则 “< idx/total >” 要 F5 才会出现
    if (chat.status !== "ready") return;
    if (!leafMessageId) return;
    if (lastRefreshedLeafRef.current === leafMessageId) return;
    lastRefreshedLeafRef.current = leafMessageId;
    fetchBranchMeta({ startMessageId: leafMessageId }).catch(() => {
      // ignore（MVP：不打断主流程）
    });
  }, [chat.status, leafMessageId, fetchBranchMeta]);

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
    setLeafMessageId(null);
    setBranchMessageIds([]);
    setSiblingNav({});
    setBranchStart({});
    lastRefreshedLeafRef.current = null;
    onSessionChange?.(generateId(), { loadHistory: false });
    // 新会话也滚动到底部（此时通常为空，属于安全操作）
    setScrollToBottomToken((n) => n + 1);
  }, [chat.stop, chat.setMessages, onSessionChange]);

  const selectSession = React.useCallback(
    (nextSessionId: string) => {
      chat.stop();
      // 立即清空，避免 UI 闪回旧消息
      chat.setMessages([]);
      setLeafMessageId(null);
      setBranchMessageIds([]);
      setSiblingNav({});
      setBranchStart({});
      lastRefreshedLeafRef.current = null;
      onSessionChange?.(nextSessionId, { loadHistory: true });
      // 先触发一次滚动：避免短暂显示在顶部；历史加载后还会再触发一次
      setScrollToBottomToken((n) => n + 1);
    },
    [chat.stop, chat.setMessages, onSessionChange]
  );

  const [input, setInput] = React.useState("");

  // 发送消息后立即滚动到底部（即使 AI 还没开始返回内容）
  const sendMessage = React.useCallback(
    (...args: Parameters<typeof chat.sendMessage>) => {
      setScrollToBottomToken((n) => n + 1);
      const [message, options] = args as any[];
      if (!message) return (chat.sendMessage as any)(message, options);

      // 关键：parentMessageId 是消息树的核心字段，必须挂在 UIMessage 顶层（不放 metadata）
      const explicitParentMessageId =
        typeof message?.parentMessageId === "string" || message?.parentMessageId === null
          ? message.parentMessageId
          : undefined;
      // 关键：explicitParentMessageId 允许为 null（根节点），不能被 leafMessageId 覆盖
      const parentMessageId =
        explicitParentMessageId !== undefined ? explicitParentMessageId : leafMessageId ?? null;
      const nextMessage =
        message && typeof message === "object" && "text" in message
          ? { parts: [{ type: "text", text: String((message as any).text ?? "") }], parentMessageId }
          : { ...(message ?? {}), parentMessageId };

      return (chat.sendMessage as any)(nextMessage, options);
    },
    [chat.sendMessage, leafMessageId]
  );

  const switchSibling = React.useCallback(
    async (messageId: string, direction: "prev" | "next") => {
      const nav = siblingNav?.[messageId];
      if (!nav) return;
      const targetId = direction === "prev" ? nav.prevSiblingId : nav.nextSiblingId;
      if (!targetId) return;

      chat.stop();

      // 关键：左右切换只刷新该节点“往下”的最新叶子链，不清空整个消息列表
      const currentBranchIndex = branchMessageIds.indexOf(messageId);
      const prefixChainIds =
        currentBranchIndex >= 0 ? branchMessageIds.slice(0, currentBranchIndex) : [];

      const data = await queryClient.fetchQuery(
        trpc.chat.getChatBranch.queryOptions({
          sessionId,
          take: 50,
          startMessageId: targetId,
          resolveToLatestLeaf: true,
        })
      );

      const newBranchIds = data.branchMessageIds ?? [];
      const targetIndexInNew = newBranchIds.indexOf(targetId);
      const keepPrefixCount = targetIndexInNew >= 0 ? targetIndexInNew : prefixChainIds.length;
      const keepPrefixIds = prefixChainIds.slice(0, keepPrefixCount);
      const suffixChainIds = newBranchIds.slice(keepPrefixCount);

      const keepPrefixSet = new Set(keepPrefixIds);
      const suffixSet = new Set(suffixChainIds);

      const currentMessages = chat.messages as any[];
      const prefixMessages = currentMessages.filter((m: any) => {
        const id = String(m?.id ?? "");
        const pid =
          (m as any)?.parentMessageId ??
          (m as any)?.metadata?.parentMessageId;
        return keepPrefixSet.has(id) || (typeof pid === "string" && keepPrefixSet.has(pid));
      });

      const incomingMessages = (data.messages ?? []).filter((m: any) => m?.role !== "tool");
      const suffixMessages = incomingMessages.filter((m: any) => {
        const id = String(m?.id ?? "");
        const pid =
          (m as any)?.parentMessageId ??
          (m as any)?.metadata?.parentMessageId;
        return suffixSet.has(id) || (typeof pid === "string" && suffixSet.has(pid));
      });

      const nextMessages = [...prefixMessages, ...suffixMessages] as UIMessage[];
      chat.setMessages(nextMessages);

      // 关键：同步 tool parts，避免残留旧分支的 tool 卡片
      if (tabId) {
        clearToolPartsForTab(tabId);
        syncToolPartsFromMessages({ tabId, messages: nextMessages });
      }

      setLeafMessageId(data.leafMessageId ?? null);
      setBranchMessageIds(newBranchIds);
      setSiblingNav(data.siblingNav ?? {});
      setBranchStart(data.leafMessageId ? { startMessageId: data.leafMessageId } : {});
      setScrollToBottomToken((n) => n + 1);
    },
    [
      siblingNav,
      branchMessageIds,
      chat.stop,
      chat.messages,
      chat.setMessages,
      queryClient,
      sessionId,
      tabId,
      clearToolPartsForTab,
    ]
  );

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
        sendMessage,
        input,
        setInput,
        isHistoryLoading,
        scrollToBottomToken,
        newSession,
        selectSession,
        updateMessage,
        tabId,
        sessionId,
        leafMessageId,
        branchMessageIds,
        siblingNav,
        switchSibling,
        stopGenerating,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
