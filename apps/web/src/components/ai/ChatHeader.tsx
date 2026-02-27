/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client"

import { cn } from "@/lib/utils";
import { Bug, BrushCleaning, History, X } from "lucide-react";
import SessionList from "@/components/ai/session/SessionList";
import * as React from "react";
import { useChatActions, useChatSession, useChatState } from "./context";
import { useMutation } from "@tanstack/react-query";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useTabView } from "@/hooks/use-tab-view";
import { invalidateChatSessions, useChatSessions } from "@/hooks/use-chat-sessions";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { toast } from "sonner";
import { MessageAction, MessageActions } from "@/components/ai-elements/message";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";

interface ChatHeaderProps {
  className?: string;
  onNewSession?: () => void;
  onCloseSession?: () => void;
  /** Icon color palette for header action buttons. */
  iconPalette?: "default" | "email";
}

const CHAT_HEADER_EMAIL_ICON_CLASS = {
  debug: "text-[#9334e6] dark:text-violet-300",
  clear: "text-[#d93025] dark:text-rose-300",
  history: "text-[#1a73e8] dark:text-sky-300",
  close: "text-[#5f6368] dark:text-slate-300",
} as const;

export default function ChatHeader({
  className,
  onNewSession,
  onCloseSession,
  iconPalette = "default",
}: ChatHeaderProps) {
  const { sessionId: activeSessionId, tabId, leafMessageId: activeLeafMessageId } = useChatSession();
  const { newSession, selectSession } = useChatActions();
  const { messages } = useChatState();
  const [historyOpen, setHistoryOpen] = React.useState(false);
  /** Preface button loading state. */
  const [prefaceLoading, setPrefaceLoading] = React.useState(false);
  const menuLockRef = React.useRef(false);
  const { sessions, refetch: refetchSessions } = useChatSessions({ tabId });
  const setTabTitle = useTabs((s) => s.setTabTitle);
  const pushStackItem = useTabRuntime((s) => s.pushStackItem);
  const { basic } = useBasicConfig();
  const tabView = useTabView(tabId);
  /** Resolve icon tone classes for header actions. */
  const resolveActionIconClass = React.useCallback(
    (action: keyof typeof CHAT_HEADER_EMAIL_ICON_CLASS) =>
      iconPalette === "email" ? CHAT_HEADER_EMAIL_ICON_CLASS[action] : "",
    [iconPalette]
  );

  const activeSession = React.useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [sessions, activeSessionId]
  );
  const sessionTitle = String(activeSession?.title ?? "").trim();
  const sessionIndex = React.useMemo(() => {
    const ids =
      Array.isArray(tabView?.chatSessionIds) && tabView.chatSessionIds.length > 0
        ? tabView.chatSessionIds
        : tabView?.chatSessionId
          ? [tabView.chatSessionId]
          : [];
    if (!activeSessionId) return null;
    const idx = ids.indexOf(activeSessionId);
    return idx >= 0 ? idx + 1 : null;
  }, [activeSessionId, tabView?.chatSessionId, tabView?.chatSessionIds]);
  const showSessionIndex = (tabView?.chatSessionIds?.length ?? 0) > 1;
  /** Resolve request leaf id from active branch leaf first, then fallback to latest user message. */
  const requestLeafMessageId = React.useMemo(() => {
    const activeLeafId =
      typeof activeLeafMessageId === "string" ? activeLeafMessageId.trim() : "";
    if (activeLeafId) return activeLeafId;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== "user") continue;
      const id = typeof message.id === "string" ? message.id.trim() : "";
      if (id) return id;
    }
    return undefined;
  }, [activeLeafMessageId, messages]);

  // 逻辑：仅在存在历史消息时显示 Preface 查看按钮。
  const showPrefaceButton = Boolean(basic.chatPrefaceEnabled) && messages.length > 0;

  const syncHistoryTitleToTabTitle = useMutation({
    ...(trpc.chatsession.updateManyChatSession.mutationOptions() as any),
    onSuccess: () => {
      // 中文注释：仅刷新会话列表，避免触发无关请求。
      invalidateChatSessions(queryClient);
    },
  });

  const handleMenuOpenChange = (open: boolean) => {
    menuLockRef.current = open;
    if (open) setHistoryOpen(true);
  };

  /**
   * Open the current session preface in a markdown stack panel.
   */
  const handleViewPreface = React.useCallback(async () => {
    if (!tabId) {
      toast.error("未找到当前标签页");
      return;
    }
    if (!activeSessionId) {
      toast.error("未找到当前会话");
      return;
    }
    if (prefaceLoading) return;

    setPrefaceLoading(true);
    try {
      const res = await trpcClient.chat.getSessionPreface.query({
        sessionId: activeSessionId,
        leafMessageId: requestLeafMessageId,
      });
      const content = typeof res?.content === "string" ? res.content : "";
      const jsonlPath = typeof res?.jsonlPath === "string" ? res.jsonlPath : "";
      // 逻辑：解析 system.json 原始字符串，提取 instructions 和 tools。
      let systemInstructions = "";
      let systemTools: Record<string, any> = {};
      if (typeof res?.systemJsonRaw === "string" && res.systemJsonRaw.trim()) {
        try {
          const parsed = JSON.parse(res.systemJsonRaw);
          if (typeof parsed.instructions === "string") systemInstructions = parsed.instructions;
          if (parsed.tools && typeof parsed.tools === "object") systemTools = parsed.tools;
        } catch { /* ignore parse errors */ }
      }
      const panelKey = `preface:${activeSessionId}`;
      // 逻辑：使用 ai-debug-viewer 组件，按 Accordion 分区展示调试信息。
      pushStackItem(tabId, {
        id: panelKey,
        sourceKey: panelKey,
        component: "ai-debug-viewer",
        title: "AI调试",
        params: {
          prefaceContent: content,
          systemInstructions,
          systemTools,
          sessionId: activeSessionId,
          jsonlPath: jsonlPath || undefined,
          __customHeader: true,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取调试信息失败";
      toast.error(message);
    } finally {
      setPrefaceLoading(false);
    }
  }, [activeSessionId, prefaceLoading, pushStackItem, requestLeafMessageId, tabId]);

  return (
    <div
      className={cn(
        "grid w-full min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center p-1 pl-2",
        className
      )}
    >
      <div className="min-w-0 w-full truncate pr-2 text-left text-sm font-medium">
        {showSessionIndex && sessionIndex ? (
          <span className="mr-1 text-[11px] text-muted-foreground/70 tabular-nums">
            #{sessionIndex}
          </span>
        ) : null}
        {sessionTitle.length > 0 ? sessionTitle : null}
      </div>
      <MessageActions className="min-w-0 justify-end gap-0">
        {showPrefaceButton ? (
          <MessageAction
            aria-label="View Debug Context"
            onClick={handleViewPreface}
            disabled={prefaceLoading}
            className={resolveActionIconClass("debug")}
            tooltip="查看上下文调试信息"
            label="查看上下文调试信息"
          >
            <Bug size={20} />
          </MessageAction>
        ) : null}
        {messages.length > 0 && (
          <MessageAction
            aria-label="清理会话"
            className={resolveActionIconClass("clear")}
            onClick={() => {
              setHistoryOpen(false);
              menuLockRef.current = false;
              newSession();
            }}
            tooltip="清理会话"
            label="清理会话"
          >
            <BrushCleaning size={20} />
          </MessageAction>
        )}
        <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
          <PopoverTrigger asChild>
            <MessageAction
              aria-label="History"
              className={resolveActionIconClass("history")}
              onClick={() => {
                // 中文注释：点击历史按钮立即刷新会话列表，确保拿到最新数据。
                void refetchSessions();
              }}
              tooltip="历史会话"
              label="历史会话"
            >
              <History size={20} />
            </MessageAction>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="end"
            className="flex w-64 max-h-[min(80svh,var(--radix-popover-content-available-height))] flex-col overflow-hidden p-2"
            onInteractOutside={(e) => {
              if (menuLockRef.current) e.preventDefault();
            }}
          >
            <SessionList
              tabId={tabId}
              activeSessionId={activeSessionId}
              onMenuOpenChange={handleMenuOpenChange}
              onSelect={(session) => {
                // 选中历史会话后：关闭弹层 + 切换会话并加载历史
                setHistoryOpen(false);
                menuLockRef.current = false;
                const hasTabBase = Boolean(tabView?.base);
                const tabTitle = String(tabView?.title ?? "").trim();
                const selectedSessionMeta = sessions.find((item) => item.id === session.id);
                const isSelectedUserRename = Boolean(selectedSessionMeta?.isUserRename);
                // 无左侧 base 的 tab：如果历史会话还没被用户重命名/仍是默认标题，则用当前 tab title 覆盖它
                if (
                  !hasTabBase &&
                  tabTitle.length > 0 &&
                  !isSelectedUserRename &&
                  (session.name.trim().length === 0 || session.name.trim() === "新对话")
                ) {
                  syncHistoryTitleToTabTitle.mutate({
                    where: { id: session.id, isUserRename: false },
                    data: { title: tabTitle },
                  } as any);
                }
                if (tabId && !hasTabBase) {
                  const nextTitle = session.name.trim();
                  if (nextTitle) setTabTitle(tabId, nextTitle);
                }
                selectSession(session.id);
              }}
            />
          </PopoverContent>
        </Popover>
        {onCloseSession && (
          <MessageAction
            aria-label="关闭会话"
            className={resolveActionIconClass("close")}
            onClick={onCloseSession}
            tooltip="关闭会话"
            label="关闭会话"
          >
            <X size={20} />
          </MessageAction>
        )}
      </MessageActions>
    </div>
  );
}
