/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { CalendarDays, MessageCircle } from "lucide-react";
import { zhCN } from "date-fns/locale";
import { Calendar } from "@openloaf/ui/date-picker";
import { Button } from "@openloaf/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import { cn } from "@/lib/utils";
import { useTabs } from "@/hooks/use-tabs";
import { useChatSessions } from "@/hooks/use-chat-sessions";

/** Build date key for grouping chat sessions. */
function buildDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Format date label for the header. */
function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

/** Chat history list widget (list-only). */
const ChatHistoryWidget = memo(function ChatHistoryWidget() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const activeTabId = useTabs((s) => s.activeTabId);
  const activeTab = useTabs((s) =>
    s.activeTabId ? s.getTabById(s.activeTabId) : undefined
  );
  const setTabChatSession = useTabs((s) => s.setTabChatSession);
  const activeChatSessionId = activeTab?.chatSessionId;
  const { sessions, isLoading } = useChatSessions({ tabId: activeTabId ?? undefined });

  const { sessionsByDay, sessionDates } = useMemo(() => {
    const map = new Map<string, typeof sessions>();
    const dates: Date[] = [];
    const seenKeys = new Set<string>();

    // 中文注释：按会话创建日期聚合，供日期筛选与列表渲染。
    for (const session of sessions) {
      const createdAt = new Date(session.createdAt);
      const key = buildDateKey(createdAt);
      const list = map.get(key);
      if (list) {
        list.push(session);
      } else {
        map.set(key, [session]);
      }
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        dates.push(
          new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate())
        );
      }
    }

    for (const list of map.values()) {
      list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    return { sessionsByDay: map, sessionDates: dates };
  }, [sessions]);

  const activeDate = selectedDate ?? new Date();
  const activeDateKey = buildDateKey(activeDate);
  const activeSessions = sessionsByDay.get(activeDateKey) ?? [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  /** Switch chat session for the active tab. */
  const handleSessionSelect = useCallback(
    (sessionId: string) => {
      if (!activeTabId) return;
      if (activeChatSessionId === sessionId) return;
      // 中文注释：点击历史会话后切换右侧聊天并加载历史记录。
      setTabChatSession(activeTabId, sessionId, {
        loadHistory: true,
        replaceCurrent: true,
      });
    },
    [activeChatSessionId, activeTabId, setTabChatSession]
  );

  return (
    <div className="h-full w-full">
      <section className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-foreground">历史列表</div>
            <div className="text-xs text-muted-foreground">
              {isLoading ? "加载中…" : `${activeSessions.length} 项`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1.5 rounded-full px-2 text-xs"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDateLabel(activeDate)}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar
                  mode="single"
                  required
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={{ after: today }}
                  locale={zhCN}
                  modifiers={{ hasHistory: sessionDates }}
                  modifiersClassNames={{
                    hasHistory:
                      "after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-amber-400/80 dark:after:bg-amber-300/90 after:pointer-events-none after:z-10",
                  }}
                  className="w-full rounded-xl border border-border/60 bg-background p-3"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="mt-3 flex-1 space-y-2 overflow-auto show-scrollbar">
          {isLoading ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-3 py-6 text-center text-sm text-muted-foreground">
              加载中…
            </div>
          ) : activeSessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-3 py-6 text-center text-sm text-muted-foreground">
              当天暂无历史
            </div>
          ) : (
            activeSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                aria-pressed={activeChatSessionId === session.id}
                onClick={() => handleSessionSelect(session.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2 text-left transition-colors",
                  activeChatSessionId === session.id
                    ? "border-primary/40 bg-primary/10"
                    : "bg-background/80 hover:bg-accent/40"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                      <MessageCircle className="h-4 w-4" />
                    </div>
                    <div className="truncate text-sm font-medium text-foreground">
                      {session.title.trim() || "未命名会话"}
                    </div>
                    {session.isPin ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        置顶
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
});

export default ChatHistoryWidget;
