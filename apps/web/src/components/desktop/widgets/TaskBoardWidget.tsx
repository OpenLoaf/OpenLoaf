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

import * as React from "react";
import { KanbanSquare } from "lucide-react";
import { useQuery, skipToken } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";

type TaskSummary = {
  id: string;
  name: string;
  status: string;
  priority?: string;
  reviewType?: string;
};

const STATUS_DOT: Record<string, string> = {
  running: "bg-blue-500",
  review: "bg-amber-500",
  todo: "bg-slate-400",
  done: "bg-green-500",
  cancelled: "bg-red-400",
};

/** Compact task board widget for desktop. */
export default function TaskBoardWidget() {
  const { t } = useTranslation('desktop');
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const activeTabId = useTabs((s) => s.activeTabId);

  const { data: tasks, isLoading } = useQuery(
    trpc.scheduledTask.list.queryOptions(
      workspaceId ? { workspaceId } : skipToken,
      { refetchInterval: 60_000 },
    ),
  );

  const allTasks = (tasks ?? []) as TaskSummary[];

  const counts = React.useMemo(() => {
    const c = { todo: 0, running: 0, review: 0, done: 0 };
    for (const task of allTasks) {
      if (task.status in c) c[task.status as keyof typeof c]++;
    }
    return c;
  }, [allTasks]);

  const activeTasks = React.useMemo(
    () => allTasks.filter((task) => task.status === "running" || task.status === "review" || task.status === "todo"),
    [allTasks],
  );

  const priorityLabel = React.useMemo(() => ({
    urgent: t('taskBoard.priorityUrgent'),
    high: t('taskBoard.priorityHigh'),
    medium: t('taskBoard.priorityMedium'),
    low: t('taskBoard.priorityLow'),
  }), [t]);

  /** Open task board page in stack panel. */
  const handleOpenTaskBoard = React.useCallback(() => {
    if (!activeTabId) {
      toast.error(t('content.noTab'));
      return;
    }
    useTabRuntime.getState().pushStackItem(activeTabId, {
      id: "scheduled-tasks-page",
      sourceKey: "scheduled-tasks-page",
      component: "scheduled-tasks-page",
      title: t('catalog.task-board'),
    });
  }, [activeTabId]);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KanbanSquare className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold text-foreground">{t('catalog.task-board')}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
            {counts.running} {t('taskBoard.statusRunning')}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            {counts.review} {t('taskBoard.statusReview')}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-400">
            {counts.todo} {t('taskBoard.statusTodo')}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
            {counts.done} {t('taskBoard.statusDone')}
          </span>
        </div>
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1 text-sm show-scrollbar">
        {!workspaceId ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
            {t('content.noWorkspace')}
          </div>
        ) : isLoading ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
            {t('taskBoard.loading')}
          </div>
        ) : activeTasks.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
            <div>{t('taskBoard.noActiveTasks')}</div>
            <button
              type="button"
              onClick={handleOpenTaskBoard}
              className="text-xs text-[var(--brand)] hover:underline"
            >
              {t('taskBoard.openTaskBoard')}
            </button>
          </div>
        ) : (
          activeTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={handleOpenTaskBoard}
              className="w-full rounded-lg border border-transparent px-2 py-2 text-left transition hover:border-border/50 hover:bg-muted/40"
            >
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[task.status] ?? "bg-slate-400")} />
                <span className="line-clamp-1 flex-1 text-sm text-foreground">{task.name}</span>
                {task.priority && task.priority !== "medium" ? (
                  <span className={cn(
                    "shrink-0 text-[10px] font-medium",
                    task.priority === "urgent" ? "text-red-500" : task.priority === "high" ? "text-orange-500" : "text-slate-400",
                  )}>
                    {priorityLabel[task.priority as keyof typeof priorityLabel] ?? task.priority}
                  </span>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
