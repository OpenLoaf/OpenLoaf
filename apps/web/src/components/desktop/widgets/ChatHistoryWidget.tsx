/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, MessageCircle } from "lucide-react";
import { zhCN } from "date-fns/locale";
import { Calendar } from "@openloaf/ui/date-picker";
import { Button } from "@openloaf/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import { cn } from "@/lib/utils";
import { useAppView } from "@/hooks/use-app-view";
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
  const { t } = useTranslation('desktop');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const activeChatSessionId = useAppView((s) => s.chatSessionId);
  const setChatSession = useAppView((s) => s.setChatSession);
  const { sessions, isLoading } = useChatSessions();

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
      if (activeChatSessionId === sessionId) return;
      // 中文注释：点击历史会话后切换右侧聊天并加载历史记录。
      setChatSession(sessionId, true);
    },
    [activeChatSessionId, setChatSession]
  );

  return (
    <div className="h-full w-full">
      <section className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-foreground">{t('chatHistory.title')}</div>
            <div className="text-xs text-muted-foreground">
              {isLoading ? t('chatHistory.loading') : t('chatHistory.count', { count: activeSessions.length })}
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
                      "after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-ol-amber/80 dark:after:bg-ol-amber/90 after:pointer-events-none after:z-10",
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
              {t('chatHistory.loading')}
            </div>
          ) : activeSessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-3 py-6 text-center text-sm text-muted-foreground">
              {t('chatHistory.noHistory')}
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
                      {session.title.trim() || t('chatHistory.unnamed')}
                    </div>
                    {session.isPin ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {t('chatHistory.pinned')}
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
