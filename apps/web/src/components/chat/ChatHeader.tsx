"use client"

import { cn } from "@/lib/utils";
import { Bug, BrushCleaning, History, X } from "lucide-react";
import { Button } from "@tenas-ai/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@tenas-ai/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tenas-ai/ui/tooltip";
import SessionList from "@/components/chat/session/SessionList";
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

interface ChatHeaderProps {
  className?: string;
  onNewSession?: () => void;
  onCloseSession?: () => void;
}

export default function ChatHeader({
  className,
  onNewSession,
  onCloseSession,
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
  /** Resolve request leaf id from the latest user message in current branch. */
  const requestLeafMessageId = React.useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== "user") continue;
      const id = typeof message.id === "string" ? message.id.trim() : "";
      if (id) return id;
    }
    const fallback = typeof activeLeafMessageId === "string" ? activeLeafMessageId.trim() : "";
    return fallback || undefined;
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
      if (content.trim().length === 0) {
        toast.message("暂无 Preface");
        return;
      }
      const panelKey = `preface:${activeSessionId}`;
      // 逻辑：按会话复用同一 stack，避免重复堆叠。
      pushStackItem(tabId, {
        id: panelKey,
        sourceKey: panelKey,
        component: "markdown-viewer",
        title: "Chat Preface",
        params: {
          name: "Chat Preface",
          ext: "md",
          content,
          __customHeader: true,
          __chatHistorySessionId: activeSessionId,
          __chatHistoryJsonlPath: jsonlPath || undefined,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取 Preface 失败";
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
      <div className="min-w-0 flex items-center justify-end gap-0">
        {showPrefaceButton ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="View Debug Context"
                onClick={handleViewPreface}
                disabled={prefaceLoading}
              >
                <Bug size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              查看上下文调试信息
            </TooltipContent>
          </Tooltip>
        ) : null}
        {messages.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="清理会话"
                onClick={() => {
                  setHistoryOpen(false);
                  menuLockRef.current = false;
                  newSession();
                }}
              >
                <BrushCleaning size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              清理会话
            </TooltipContent>
          </Tooltip>
        )}
        <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="History"
                  onClick={() => {
                    // 中文注释：点击历史按钮立即刷新会话列表，确保拿到最新数据。
                    void refetchSessions();
                  }}
                >
                  <History size={20} />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              历史会话
            </TooltipContent>
          </Tooltip>
          <PopoverContent
            align="end"
            className="flex w-64 max-h-[min(80svh,var(--radix-popover-content-available-height))] flex-col overflow-hidden p-2"
            collisionPadding={12}
            sideOffset={6}
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="关闭会话"
                onClick={onCloseSession}
              >
                <X size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              关闭会话
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
