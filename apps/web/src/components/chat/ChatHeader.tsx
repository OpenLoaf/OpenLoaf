"use client"

import { cn } from "@/lib/utils";
import { PlusCircle, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import SessionList from "@/components/chat/session/SessionList";
import * as React from "react";
import { useChatContext } from "./ChatProvider";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import { useTabs } from "@/hooks/use-tabs";

interface ChatHeaderProps {
  className?: string;
  loadHistory?: boolean;
  resourceUri?: string;
}

export default function ChatHeader({ className, loadHistory, resourceUri }: ChatHeaderProps) {
  const { id: activeSessionId, newSession, selectSession, messages, tabId } =
    useChatContext();
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const menuLockRef = React.useRef(false);
  const tab = useTabs((s) => (tabId ? s.tabs.find((t) => t.id === tabId) : undefined));
  const setTabTitle = useTabs((s) => s.setTabTitle);

  const sessionTitleQuery = useQuery({
    ...(trpc.chatsession.findUniqueChatSession.queryOptions({
      where: { id: activeSessionId },
      select: { title: true, isUserRename: true },
    } as any) as any),
    enabled: Boolean(activeSessionId && loadHistory),
  });

  const sessionTitle = String((sessionTitleQuery.data as any)?.title ?? "").trim();
  const isUserRename = Boolean((sessionTitleQuery.data as any)?.isUserRename);

  const tabTitle = String(tab?.title ?? "").trim();
  const hasTabBase = Boolean(tab?.base);

  const syncHistoryTitleToTabTitle = useMutation({
    ...(trpc.chatsession.updateManyChatSession.mutationOptions() as any),
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  const handleMenuOpenChange = (open: boolean) => {
    menuLockRef.current = open;
    if (open) setHistoryOpen(true);
  };

  // Chat-only tab：让 Tab 标题跟随 chatSession.title（避免一直显示默认 “AI Chat”）
  React.useEffect(() => {
    if (!tabId) return;
    if (hasTabBase) return;
    if (!loadHistory) return;
    if (sessionTitle.length === 0) return;
    if (tabTitle === sessionTitle) return;
    setTabTitle(tabId, sessionTitle);
  }, [tabId, hasTabBase, loadHistory, sessionTitle, tabTitle, setTabTitle]);

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
      <div className="min-w-0 flex items-center justify-end gap-1">
        {messages.length > 0 && (
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
        )}
        <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="History"
            >
              <History size={20} />
            </Button>
          </PopoverTrigger>
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
              activeSessionId={activeSessionId}
              resourceUri={resourceUri}
              onMenuOpenChange={handleMenuOpenChange}
              onSelect={(session) => {
                // 选中历史会话后：关闭弹层 + 切换会话并加载历史
                setHistoryOpen(false);
                menuLockRef.current = false;
                // 无左侧 base 的 tab：如果历史会话还没被用户重命名/仍是默认标题，则用当前 tab title 覆盖它
                if (
                  !hasTabBase &&
                  tabTitle.length > 0 &&
                  !isUserRename &&
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
