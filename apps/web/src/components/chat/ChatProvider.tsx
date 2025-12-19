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
  /** 重试 assistant：复用其 parent user 消息重新生成（不重复保存 user） */
  retryAssistantMessage: (assistantMessageId: string) => void;
  /** 编辑重发 user：在同 parent 下创建新的 sibling 分支 */
  resendUserMessage: (userMessageId: string, nextText: string) => void;
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

  function dedupeMessagesById(next: UIMessage[]) {
    const seen = new Set<string>();
    const out: UIMessage[] = [];
    for (const m of next) {
      const id = String((m as any)?.id ?? "");
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(m);
    }
    return out;
  }

  function getTopLevelParentMessageId(message: any): string | null | undefined {
    const pid =
      typeof message?.parentMessageId === "string" || message?.parentMessageId === null
        ? message.parentMessageId
        : undefined;
    if (pid !== undefined) return pid;
    const metaPid =
      typeof message?.metadata?.parentMessageId === "string" || message?.metadata?.parentMessageId === null
        ? message.metadata.parentMessageId
        : undefined;
    return metaPid;
  }

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

  const applyBranchSnapshot = React.useCallback(
    (data: any, { setMessages }: { setMessages: boolean }) => {
      const incoming = Array.isArray(data?.messages) ? (data.messages as any[]) : [];
      const visible = incoming.filter((m) => m?.role !== "tool") as UIMessage[];

      if (setMessages) {
        const nextMessages = dedupeMessagesById(visible);
        chat.setMessages(nextMessages);
        if (tabId) {
          clearToolPartsForTab(tabId);
          syncToolPartsFromMessages({ tabId, messages: nextMessages });
        }
      }

      setLeafMessageId(data?.leafMessageId ?? null);
      setBranchMessageIds(data?.branchMessageIds ?? []);
      setSiblingNav(data?.siblingNav ?? {});
      setBranchStart(data?.leafMessageId ? { startMessageId: data.leafMessageId } : {});
    },
    [chat.setMessages, tabId, clearToolPartsForTab]
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

      const data = await queryClient.fetchQuery(
        trpc.chat.getChatBranch.queryOptions({
          sessionId,
          take: 50,
          startMessageId: targetId,
          resolveToLatestLeaf: true,
        })
      );
      // 关键：切分支时，直接用服务端返回的“当前链快照”覆盖（避免前端拼接导致重复 key/重复渲染）
      applyBranchSnapshot(data, { setMessages: true });
      setScrollToBottomToken((n) => n + 1);
    },
    [
      siblingNav,
      chat.stop,
      applyBranchSnapshot,
      queryClient,
      sessionId,
    ]
  );

  const retryAssistantMessage = React.useCallback(
    async (assistantMessageId: string) => {
      const assistant = (chat.messages as any[]).find((m) => String(m?.id) === assistantMessageId);
      if (!assistant) return;

      // 关键：AI 重试 = 重发该 assistant 的 parent user 消息（但不重复保存 user 到 DB）
      const parentUserMessageId = getTopLevelParentMessageId(assistant);
      if (!parentUserMessageId) return;

      chat.stop();

      // 关键：先把 UI 切回到“parent user 为 leaf”的链快照，隐藏原有后续分支
      const base = await queryClient.fetchQuery(
        trpc.chat.getChatBranch.queryOptions({
          sessionId,
          take: 50,
          startMessageId: parentUserMessageId,
        })
      );
      applyBranchSnapshot(base, { setMessages: true });

      const userMsg = (base.messages as any[]).find(
        (m) => String(m?.id) === parentUserMessageId && m?.role === "user"
      );
      const userParentMessageId = getTopLevelParentMessageId(userMsg) ?? null;

      // 关键：使用 messageId 替换“同一条 user 消息”，触发新一轮生成，但服务端不再落库该 user
      await (chat.sendMessage as any)(
        {
          ...(userMsg ?? {}),
          id: parentUserMessageId,
          role: "user",
          parts: (userMsg as any)?.parts ?? [{ type: "text", text: "" }],
          parentMessageId: userParentMessageId,
          messageId: parentUserMessageId,
        },
        { body: { retry: true } }
      );
      setScrollToBottomToken((n) => n + 1);
    },
    [chat.stop, chat.messages, chat.sendMessage, queryClient, sessionId, applyBranchSnapshot]
  );

  const resendUserMessage = React.useCallback(
    async (userMessageId: string, nextText: string) => {
      const user = (chat.messages as any[]).find((m) => String(m?.id) === userMessageId);
      if (!user || user.role !== "user") return;
      const parentMessageId = getTopLevelParentMessageId(user) ?? null;

      chat.stop();

      // 关键：编辑重发会产生新 sibling 分支，先把 UI 切回到 parent 节点（隐藏旧分支的后续内容）
      if (parentMessageId) {
        const base = await queryClient.fetchQuery(
          trpc.chat.getChatBranch.queryOptions({
            sessionId,
            take: 50,
            startMessageId: parentMessageId,
          })
        );
        applyBranchSnapshot(base, { setMessages: true });
      } else {
        chat.setMessages([]);
        if (tabId) clearToolPartsForTab(tabId);
        setLeafMessageId(null);
        setBranchMessageIds([]);
        setSiblingNav({});
        setBranchStart({});
      }

      await (chat.sendMessage as any)({
        id: generateId(),
        role: "user",
        parts: [{ type: "text", text: nextText }],
        parentMessageId,
      });
      setScrollToBottomToken((n) => n + 1);
    },
    [
      chat.stop,
      chat.messages,
      chat.setMessages,
      chat.sendMessage,
      queryClient,
      sessionId,
      tabId,
      clearToolPartsForTab,
      applyBranchSnapshot,
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
        retryAssistantMessage,
        resendUserMessage,
        stopGenerating,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
