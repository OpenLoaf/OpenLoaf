"use client";

import React, {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { generateId } from "ai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import {
  BROWSER_WINDOW_COMPONENT,
  BROWSER_WINDOW_PANEL_ID,
  useTabs,
  type ChatStatus,
} from "@/hooks/use-tabs";
import { useTabSnapshotSync } from "@/hooks/use-tab-snapshot-sync";
import { createChatTransport } from "@/lib/chat/transport";
import { handleChatDataPart } from "@/lib/chat/dataPart";
import { syncToolPartsFromMessages } from "@/lib/chat/toolParts";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { playNotificationSound } from "@/lib/notification-sound";
import type { TenasUIDataTypes } from "@tenas-ai/api/types/message";
import type { ImageGenerateOptions } from "@tenas-ai/api/types/image";
import type { CodexOptions } from "@/lib/chat/codex-options";
import type { ChatAttachmentInput, MaskedAttachmentInput } from "./chat-attachments";
import { createChatSessionId } from "@/lib/chat-session-id";

function handleOpenBrowserDataPart(input: { dataPart: any; fallbackTabId?: string }) {
  if (input.dataPart?.type !== "data-open-browser") return false;
  const data = input.dataPart?.data as TenasUIDataTypes["open-browser"] | undefined;
  if (!data) return true;

  const tabId = String(data.tabId || input.fallbackTabId || "");
  if (!tabId) return true;

  const viewKey = String(data.viewKey || "");
  const url = String(data.url || "");
  const title = typeof data.title === "string" ? data.title : undefined;

  // 每个 Tab 的 stack 中只保留一个 browser 面板，新的 url 作为子标签追加并激活。
  useTabs.getState().pushStackItem(
    tabId,
    {
      component: BROWSER_WINDOW_COMPONENT,
      id: BROWSER_WINDOW_PANEL_ID,
      sourceKey: BROWSER_WINDOW_PANEL_ID,
      params: { __customHeader: true, __open: { url, title, viewKey } },
    } as any,
    100,
  );

  return true;
}

type SubAgentDataPayload = {
  toolCallId?: string;
  name?: string;
  task?: string;
  delta?: string;
  output?: string;
  errorText?: string;
};

type SubAgentStreamState = {
  toolCallId: string;
  name?: string;
  task?: string;
  output: string;
  errorText?: string;
  state: "output-streaming" | "output-available" | "output-error";
};

function handleSubAgentDataPart(input: {
  dataPart: any;
  setSubAgentStreams?: React.Dispatch<React.SetStateAction<Record<string, SubAgentStreamState>>>;
}) {
  const type = input.dataPart?.type;
  if (
    type !== "data-sub-agent-start" &&
    type !== "data-sub-agent-delta" &&
    type !== "data-sub-agent-end" &&
    type !== "data-sub-agent-error"
  ) {
    return false;
  }

  const payload = input.dataPart?.data as SubAgentDataPayload | undefined;
  const toolCallId = typeof payload?.toolCallId === "string" ? payload?.toolCallId : "";
  if (!toolCallId) return true;

  const setSubAgentStreams = input.setSubAgentStreams;
  if (!setSubAgentStreams) return true;

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
  /** 流式输出节拍，用于触发消息列表在输出中持续贴底 */
  streamTick: number;
  /** 用于触发消息列表滚动到指定消息的信号（自增即可） */
  scrollToMessageToken: { messageId: string; token: number } | null;
  /** 是否正在加载/应用该 session 的历史消息 */
  isHistoryLoading: boolean;
  /** 创建新会话（清空消息并切换 id） */
  newSession: () => void;
  /** 切换到某个历史会话，并加载历史消息 */
  selectSession: (sessionId: string) => void;
  /** 更新单个消息的方法（仅更新本地 messages，MVP） */
  updateMessage: (id: string, updates: Partial<UIMessage>) => void;
  /** 当前聊天所属的 Tab ID */
  tabId?: string;
  /** 当前会话 ID（与 useChat 的 id 一致） */
  sessionId: string;
  /** 当前聊天绑定的 projectId（用于默认保存路径等场景） */
  projectId?: string;
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
  switchSibling: (
    messageId: string,
    direction: "prev" | "next",
    navOverride?: { prevSiblingId?: string | null; nextSiblingId?: string | null }
  ) => void;
  /** 重试 assistant：复用其 parent user 消息重新生成（不重复保存 user） */
  retryAssistantMessage: (assistantMessageId: string) => void;
  /** 编辑重发 user：在同 parent 下创建新的 sibling 分支 */
  resendUserMessage: (userMessageId: string, nextText: string, nextParts?: any[]) => void;
  /** 用户手动停止生成（通知服务端终止当前流） */
  stopGenerating: () => void;
  /** 子Agent流式输出缓存（key 为 toolCallId） */
  subAgentStreams: Record<string, SubAgentStreamState>;
  /** 处理 step 完成后的“思考中”提示 */
  stepThinking: boolean;
  /** Image generation options for the current chat session. */
  imageOptions?: ImageGenerateOptions;
  /** Update image generation options for the current chat session. */
  setImageOptions: React.Dispatch<React.SetStateAction<ImageGenerateOptions | undefined>>;
  /** Codex options for the current chat session. */
  codexOptions?: CodexOptions;
  /** Update Codex options for the current chat session. */
  setCodexOptions: React.Dispatch<React.SetStateAction<CodexOptions | undefined>>;
  /** Add image attachments to the chat input. */
  addAttachments?: (files: FileList | ChatAttachmentInput[]) => void;
  /** Add a masked attachment to the chat input. */
  addMaskedAttachment?: (input: MaskedAttachmentInput) => void;
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
 * Optional chat context hook.
 */
export function useOptionalChatContext() {
  return useContext(ChatContext);
}

/**
 * Chat provider component.
 * Provides chat state and actions to children.
 */
type ChatProviderProps = {
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

export default function ChatProvider({
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
}: ChatProviderProps) {
  const [scrollToBottomToken, setScrollToBottomToken] = React.useState(0);
  const [streamTick, setStreamTick] = React.useState(0);
  const [scrollToMessageToken, setScrollToMessageToken] = React.useState<{
    messageId: string;
    token: number;
  } | null>(null);
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
  const [subAgentStreams, setSubAgentStreams] = React.useState<
    Record<string, SubAgentStreamState>
  >({});
  const [stepThinking, setStepThinking] = React.useState(false);
  const upsertToolPart = useTabs((s) => s.upsertToolPart);
  const clearToolPartsForTab = useTabs((s) => s.clearToolPartsForTab);
  const setTabChatStatus = useTabs((s) => s.setTabChatStatus);
  const queryClient = useQueryClient();
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

  React.useEffect(() => {
    if (tabId) {
      clearToolPartsForTab(tabId);
    }
  }, [tabId, clearToolPartsForTab]);

  const paramsRef = React.useRef<Record<string, unknown> | undefined>(params);
  const tabIdRef = React.useRef<string | null | undefined>(tabId);
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
    chatModelIdRef.current = typeof chatModelId === "string" ? chatModelId.trim() || null : null;
  }, [chatModelId]);

  React.useEffect(() => {
    // 中文注释：仅允许 local/cloud，其他值视为未传。
    chatModelSourceRef.current =
      typeof chatModelSource === "string" ? chatModelSource.trim() || null : null;
  }, [chatModelSource]);

  const upsertToolPartMerged = React.useCallback(
    (key: string, next: Partial<Parameters<typeof upsertToolPart>[2]>) => {
      if (!tabId) return;
      const current = useTabs.getState().toolPartsByTabId[tabId]?.[key];
      upsertToolPart(tabId, key, { ...current, ...next } as any);
    },
    [tabId, upsertToolPart]
  );

  const transport = React.useMemo(() => {
    return createChatTransport({ paramsRef, tabIdRef, chatModelIdRef, chatModelSourceRef });
  }, []);

  const refreshBranchMeta = React.useCallback(
    async (startMessageId: string) => {
      const data = await queryClient.fetchQuery(
        trpc.chat.getChatView.queryOptions({
          sessionId,
          anchor: { messageId: startMessageId, strategy: "self" },
          window: { limit: 50 },
          include: { messages: false, siblingNav: true },
        })
      );
      setLeafMessageId(data.leafMessageId ?? null);
      setBranchMessageIds(data.branchMessageIds ?? []);
      setSiblingNav(data.siblingNav ?? {});
    },
    [queryClient, sessionId]
  );

  const onFinish = React.useCallback(
    ({ message }: { message: UIMessage }) => {
      // 关键：切换 session 后，旧请求的 onFinish 可能晚到；必须忽略，避免污染新会话的 leafMessageId。
      if (sessionIdRef.current !== sessionId) return;
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
            ((m as any)?.parentMessageId === undefined || (m as any)?.parentMessageId === null)
              ? { ...(m as any), parentMessageId: parentUserMessageId }
              : m
          )
        );
      }

      // 关键：retry/resend 的 sibling 信息必须等 SSE 完全结束后再刷新（否则 DB 还没落库）
      if (needsBranchMetaRefreshRef.current) {
        needsBranchMetaRefreshRef.current = false;
        void refreshBranchMeta(assistantId);
      }
    },
    [refreshBranchMeta, sessionId]
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
        if (handleOpenBrowserDataPart({ dataPart, fallbackTabId: tabId })) return;
        if (handleStepThinkingDataPart({ dataPart, setStepThinking })) return;
        if (handleSubAgentDataPart({ dataPart, setSubAgentStreams })) return;
        handleChatDataPart({ dataPart, tabId, upsertToolPartMerged });
        setStreamTick((prev) => prev + 1);
      },
    }),
    [sessionId, tabId, transport, upsertToolPartMerged, onFinish, setSubAgentStreams, setStepThinking]
  );

  const chat = useChat(chatConfig);
  const { basic } = useBasicConfig();
  const prevStatusRef = React.useRef(chat.status);
  setMessagesRef.current = chat.setMessages;

  React.useEffect(() => {
    const previousStatus = prevStatusRef.current;
    const wasStreaming =
      previousStatus === "submitted" || previousStatus === "streaming";
    const isStreaming = chat.status === "submitted" || chat.status === "streaming";
    prevStatusRef.current = chat.status;
    if (!basic.modelSoundEnabled) return;
    if (!wasStreaming && isStreaming) {
      playNotificationSound("model-start");
      return;
    }
    if (wasStreaming && !isStreaming) {
      playNotificationSound("model-end");
    }
  }, [basic.modelSoundEnabled, chat.status]);

  useTabSnapshotSync({
    enabled: chat.status !== "ready",
    sessionId,
    tabId,
  });

  React.useEffect(() => {
    if (!tabId) return;
    // 把每个 Tab 的 chat.status 写入 zustand，Header Tabs 可以据此渲染“流式生成中”的彩虹边框提示。
    setTabChatStatus(tabId, chat.status as ChatStatus);
    return () => {
      setTabChatStatus(tabId, null);
    };
  }, [tabId, chat.status, setTabChatStatus]);

  // 中文注释：仅在显式需要时才拉取历史，避免新会话多余请求。
  const shouldLoadHistory = Boolean(loadHistory);

  /** Stop streaming and reset local state before switching sessions. */
  const stopAndResetSession = React.useCallback(
    (clearTools: boolean) => {
      // 中文注释：切换会话前必须停止流式并清空本地状态，避免脏数据串流。
      chat.stop();
      chat.setMessages([]);
      setStreamTick(0);
      pendingUserMessageIdRef.current = null;
      needsBranchMetaRefreshRef.current = false;
      setLeafMessageId(null);
      setBranchMessageIds([]);
      setSiblingNav({});
      setSubAgentStreams({});
      setStepThinking(false);
      if (clearTools && tabId) clearToolPartsForTab(tabId);
    },
    [chat.stop, chat.setMessages, tabId, clearToolPartsForTab]
  );

  React.useLayoutEffect(() => {
    // 关键：sessionId 可能由外部状态直接切换（不一定走 newSession/selectSession）。
    // 必须在浏览器可交互前完成清理，否则首条消息会错误复用旧 leaf 作为 parentMessageId。
    stopAndResetSession(true);
  }, [sessionId, stopAndResetSession]);

  // 使用 tRPC 拉取“当前视图”（主链消息 + sibling 导航）
  const branchQuery = useQuery(
    {
      ...trpc.chat.getChatView.queryOptions({ sessionId, window: { limit: 50 } }),
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

    // 关键：历史接口已按时间正序返回（最早在前），可直接渲染
    if (chat.messages.length === 0) {
      const messages = (data.messages ?? []) as UIMessage[];
      chat.setMessages(messages);
      if (tabId) {
        clearToolPartsForTab(tabId);
        syncToolPartsFromMessages({ tabId, messages });
      }
      // 应用历史后，滚动到最底部显示最新消息
      setScrollToBottomToken((n) => n + 1);
    }
    setLeafMessageId(data.leafMessageId ?? null);
    setBranchMessageIds(data.branchMessageIds ?? []);
    setSiblingNav(data.siblingNav ?? {});
  }, [branchQuery.data, chat.messages.length, chat.setMessages, tabId, clearToolPartsForTab]);

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
    // 新会话也滚动到底部（此时通常为空，属于安全操作）
    setScrollToBottomToken((n) => n + 1);
  }, [stopAndResetSession, onSessionChange]);

  const selectSession = React.useCallback(
    (nextSessionId: string) => {
      // 中文注释：立即清空，避免 UI 闪回旧消息。
      stopAndResetSession(true);
      onSessionChange?.(nextSessionId, { loadHistory: true });
      // 先触发一次滚动：避免短暂显示在顶部；历史加载后还会再触发一次
      setScrollToBottomToken((n) => n + 1);
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
  }, [chat.messages?.length, leafMessageId]);

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

      pendingUserMessageIdRef.current = String(nextMessage.id);

      const result = (chat.sendMessage as any)(nextMessage, options);
      // 关键：在下一帧触发滚动，确保 user 消息已渲染进 DOM，避免 pinned 被误判为 false，
      // 从而导致流式输出期间不再自动跟随。
      requestAnimationFrame(() => setScrollToBottomToken((n) => n + 1));
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
        })
      );
      // 关键：切分支时，用服务端返回的“当前链快照”覆盖本地 messages（避免前端拼接导致重复渲染）
      const messages = (data?.messages ?? []) as UIMessage[];
      chat.setMessages(messages);
      if (tabId) {
        clearToolPartsForTab(tabId);
        syncToolPartsFromMessages({ tabId, messages });
      }
      setLeafMessageId(data?.leafMessageId ?? null);
      setBranchMessageIds(data?.branchMessageIds ?? []);
      setSiblingNav(data?.siblingNav ?? {});
      // 关键：切分支是“浏览历史/对比内容”的交互，不应强制滚动到底部（否则会打断阅读）。
      // 若用户本来就在底部，useChatScroll 的 pinned/ResizeObserver 机制会自然维持贴底体验。
      // 但切到更短分支时，浏览器可能会把 scrollTop clamp 到新最大值，看起来像“跳到底部”。
      // 这里用一个 token 通知 MessageList 定位到目标 sibling 节点，并抑制一次“贴底跟随”。
      setScrollToMessageToken((prev) => ({
        messageId: String(targetId),
        token: (prev?.token ?? 0) + 1,
      }));
    },
    [
      siblingNav,
      chat.stop,
      chat.setMessages,
      queryClient,
      sessionId,
      tabId,
      clearToolPartsForTab,
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
        syncToolPartsFromMessages({ tabId, messages: slicedMessages });
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
      setScrollToBottomToken((n) => n + 1);
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
          syncToolPartsFromMessages({ tabId, messages: slicedMessages });
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
    ]
  );

  const stopGenerating = React.useCallback(() => {
    // 中文注释：使用 AI SDK 内置中断，直接终止当前请求。
    chat.stop();
  }, [chat]);

  return (
    <ChatContext.Provider
      value={{
        ...chat,
        sendMessage,
        input,
        setInput,
        isHistoryLoading,
        scrollToBottomToken,
        streamTick,
        scrollToMessageToken,
        newSession,
        selectSession,
        updateMessage,
        tabId,
        sessionId,
        projectId,
        leafMessageId,
        branchMessageIds,
        siblingNav,
        switchSibling,
        retryAssistantMessage,
        resendUserMessage,
        stopGenerating,
        subAgentStreams,
        stepThinking,
        imageOptions,
        setImageOptions,
        codexOptions,
        setCodexOptions,
        addAttachments,
        addMaskedAttachment,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
