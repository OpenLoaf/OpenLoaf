import { memo, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { useChatSessions, type ChatSessionListItem } from "@/hooks/use-chat-sessions";

interface ProjectHistoryProps {
  isLoading: boolean;
}

interface ProjectHistoryHeaderProps {
  isLoading: boolean;
  pageTitle: string;
}

/** Format date as day key for grouping. */
function buildDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Format date label for history header. */
function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

/** Format time label for session rows. */
function formatTimeLabel(value: string | Date): string {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Project history header. */
const ProjectHistoryHeader = memo(function ProjectHistoryHeader({
  isLoading,
  pageTitle,
}: ProjectHistoryHeaderProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-base font-semibold">历史</span>
      <span className="text-xs text-muted-foreground truncate">{pageTitle}</span>
    </div>
  );
});

/** Project history panel. */
const ProjectHistory = memo(function ProjectHistory({
  isLoading,
}: ProjectHistoryProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const { sessions, isLoading: isSessionsLoading } = useChatSessions();

  const { sessionsByDay, sessionDates } = useMemo(() => {
    const map = new Map<string, ChatSessionListItem[]>();
    const dates: Date[] = [];
    const seenKeys = new Set<string>();

    // 中文注释：按会话创建日期聚合，供日历标记与列表渲染。
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
        dates.push(new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate()));
      }
    }

    for (const list of map.values()) {
      list.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }

    return { sessionsByDay: map, sessionDates: dates };
  }, [sessions]);

  const activeDate = selectedDate ?? new Date();
  const activeDateKey = buildDateKey(activeDate);
  const activeSessions = sessionsByDay.get(activeDateKey) ?? [];

  if (isLoading) {
    return null;
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section>
          <Calendar
            mode="single"
            required
            selected={selectedDate}
            onSelect={setSelectedDate}
            modifiers={{ hasHistory: sessionDates }}
            modifiersClassNames={{
              hasHistory:
                "after:content-[''] after:mt-0.5 after:h-1 after:w-1 after:rounded-full after:bg-primary/70 after:mx-auto",
            }}
            className="w-full rounded-xl border border-border/60 bg-background/80 p-3"
          />
        </section>

        <section className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-foreground">历史列表</div>
            <div className="text-xs text-muted-foreground">
              {formatDateLabel(activeDate)} ·{" "}
              {isSessionsLoading ? "加载中…" : `${activeSessions.length} 项`}
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {isSessionsLoading ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-3 py-6 text-center text-sm text-muted-foreground">
                加载中…
              </div>
            ) : activeSessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-3 py-6 text-center text-sm text-muted-foreground">
                当天暂无历史
              </div>
            ) : (
              activeSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-2"
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
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatTimeLabel(session.createdAt)} 创建
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {formatTimeLabel(session.updatedAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border/60 bg-card/60 p-4">
        <div className="text-sm font-semibold text-foreground">当日总结</div>
        <div className="mt-4 flex-1" />
      </section>
    </div>
  );
});

export { ProjectHistoryHeader };
export default ProjectHistory;
