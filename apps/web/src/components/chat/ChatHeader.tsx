"use client"

import { cn } from "@/lib/utils";
import { Bug, PlusCircle, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import SessionList from "@/components/chat/session/SessionList";
import * as React from "react";
import { useChatContext } from "./ChatProvider";
import { useMutation } from "@tanstack/react-query";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";
import { useTabs } from "@/hooks/use-tabs";
import { invalidateChatSessions, useChatSessions } from "@/hooks/use-chat-sessions";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { toast } from "sonner";

interface ChatHeaderProps {
  className?: string;
}

export default function ChatHeader({ className }: ChatHeaderProps) {
  const { id: activeSessionId, newSession, selectSession, messages, tabId } =
    useChatContext();
  const [historyOpen, setHistoryOpen] = React.useState(false);
  /** Preface button loading state. */
  const [prefaceLoading, setPrefaceLoading] = React.useState(false);
  const menuLockRef = React.useRef(false);
  const { sessions, refetch: refetchSessions } = useChatSessions({ tabId });
  const tab = useTabs((s) => (tabId ? s.tabs.find((t) => t.id === tabId) : undefined));
  const setTabTitle = useTabs((s) => s.setTabTitle);
  const pushStackItem = useTabs((s) => s.pushStackItem);
  const { basic } = useBasicConfig();

  const activeSession = React.useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [sessions, activeSessionId]
  );
  const sessionTitle = String(activeSession?.title ?? "").trim();

  const tabTitle = String(tab?.title ?? "").trim();
  const hasTabBase = Boolean(tab?.base);
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
      });
      const content = typeof res?.content === "string" ? res.content : "";
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
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取 Preface 失败";
      toast.error(message);
    } finally {
      setPrefaceLoading(false);
    }
  }, [activeSessionId, prefaceLoading, pushStackItem, tabId]);

  // Chat-only tab：让 Tab 标题跟随 chatSession.title（避免一直显示默认 “AI Chat”）
  React.useEffect(() => {
    if (!tabId) return;
    if (hasTabBase) return;
    if (sessionTitle.length === 0) return;
    if (tabTitle === sessionTitle) return;
    setTabTitle(tabId, sessionTitle);
  }, [tabId, hasTabBase, sessionTitle, tabTitle, setTabTitle]);

  return (
    <div
      className={cn(
        "grid w-full min-w-0 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center px-2 py-0",
        className
      )}
    >
      <div className="min-w-0 text-lg font-semibold">AI助手</div>
      <div className="min-w-0 w-full truncate px-2 text-center text-sm font-medium">
        {sessionTitle.length > 0 ? sessionTitle : null}
      </div>
      <div className="min-w-0 flex items-center justify-end gap-0.5">
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
                aria-label="New Session"
                onClick={() => {
                  setHistoryOpen(false);
                  menuLockRef.current = false;
                  newSession();
                }}
              >
                <PlusCircle size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              新建对话
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
                selectSession(session.id);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
