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

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ChevronDown, CircleDashed, Loader2, XCircle, Ban, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeTask } from "@openloaf/api/types/tools/runtimeTask";

// ---------------------------------------------------------------------------
// Status → visual mapping
// ---------------------------------------------------------------------------

type TaskVisualStatus =
  | "pending"
  | "ready"
  | "in_progress"
  | "completed"
  | "failed"
  | "aborted"
  | "timeout"
  | "interrupted";

function resolveVisualStatus(task: RuntimeTask, allTasks: RuntimeTask[]): TaskVisualStatus {
  if (task.status === "in_progress") return "in_progress";
  if (task.status === "completed") return "completed";
  if (task.status === "failed") {
    if (task.failReason === "abortedByUser") return "aborted";
    if (task.failReason === "timeout") return "timeout";
    if (task.failReason === "interrupted") return "interrupted";
    return "failed";
  }
  // pending: check if all blockedBy are completed → ready.
  if (task.blockedBy.length === 0) return "pending";
  const allDone = task.blockedBy.every((depId) => {
    const dep = allTasks.find((t) => t.id === depId);
    return dep && dep.status === "completed";
  });
  return allDone ? "ready" : "pending";
}

const DOT_CLASS: Record<TaskVisualStatus, string> = {
  pending: "bg-muted-foreground/30",
  ready: "bg-foreground/50",
  in_progress: "bg-primary animate-pulse",
  completed: "bg-foreground",
  failed: "bg-destructive",
  aborted: "bg-muted-foreground/60",
  timeout: "bg-orange-500",
  interrupted: "bg-yellow-500",
};

const ICON_MAP: Record<TaskVisualStatus, typeof CheckCircle2> = {
  pending: CircleDashed,
  ready: CircleDashed,
  in_progress: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  aborted: Ban,
  timeout: Clock,
  interrupted: Clock,
};

const ICON_CLASS: Record<TaskVisualStatus, string> = {
  pending: "text-muted-foreground",
  ready: "text-foreground/70",
  in_progress: "text-primary",
  completed: "text-foreground",
  failed: "text-destructive",
  aborted: "text-muted-foreground",
  timeout: "text-orange-500",
  interrupted: "text-yellow-600",
};

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

type TaskGroup = {
  ownerAgentId: string | null;
  displayName: string | null;
  typeName: string | null;
  tasks: RuntimeTask[];
};

function groupByOwner(tasks: RuntimeTask[]): TaskGroup[] {
  const byAgent = new Map<string, TaskGroup>();
  const noOwner: RuntimeTask[] = [];
  for (const t of tasks) {
    if (t.owner?.agentId) {
      const key = t.owner.agentId;
      let group = byAgent.get(key);
      if (!group) {
        group = {
          ownerAgentId: key,
          displayName: t.owner.displayName ?? null,
          typeName: t.owner.name ?? null,
          tasks: [],
        };
        byAgent.set(key, group);
      }
      group.tasks.push(t);
    } else {
      noOwner.push(t);
    }
  }
  // Handle duplicate display names: add (1)(2) suffixes when multiple agents share a name.
  const nameCount = new Map<string, number>();
  for (const g of byAgent.values()) {
    const key = g.displayName ?? g.typeName ?? "";
    nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
  }
  const seenByName = new Map<string, number>();
  for (const g of byAgent.values()) {
    const key = g.displayName ?? g.typeName ?? "";
    if ((nameCount.get(key) ?? 0) > 1) {
      const idx = (seenByName.get(key) ?? 0) + 1;
      seenByName.set(key, idx);
      g.displayName = `${g.displayName ?? g.typeName ?? "Agent"} (${idx})`;
    }
  }
  const groups: TaskGroup[] = []
  if (noOwner.length > 0) {
    groups.push({ ownerAgentId: null, displayName: null, typeName: null, tasks: noOwner });
  }
  for (const g of byAgent.values()) groups.push(g);
  return groups;
}

// ---------------------------------------------------------------------------
// Single-group ProgressBar row (one per owner Agent or one for Master/ungrouped)
// ---------------------------------------------------------------------------

type ProgressBarRowProps = {
  group: TaskGroup;
  allTasks: RuntimeTask[];
  expandable: boolean;
  compactMode: boolean;
};

function ProgressBarRow({ group, allTasks, expandable, compactMode }: ProgressBarRowProps) {
  const { t: tAi } = useTranslation("ai");
  const [expanded, setExpanded] = useState(false);
  const tasks = group.tasks;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const inProgress = tasks.find((t) => t.status === "in_progress");
  const allDone = tasks.every((t) => t.status === "completed" || t.status === "failed");
  const hasActive = !allDone;

  // Active text: inProgress.activeForm > inProgress.subject > "全部完成" or group name.
  const activeText = inProgress
    ? (inProgress.activeForm ?? inProgress.subject)
    : allDone
      ? tAi("runtimeTask.allDone", "All done")
      : group.displayName ?? group.typeName ?? tAi("runtimeTask.master", "Main");

  const headerContent = (
    <>
      {group.displayName || group.typeName ? (
        <span className="shrink-0 font-medium text-foreground text-[10px]">
          {group.displayName ?? group.typeName}
        </span>
      ) : null}
      {!compactMode ? (
        <div className="flex items-center gap-0.5">
          {tasks.map((task) => {
            const vs = resolveVisualStatus(task, allTasks);
            return (
              <div
                key={`d-${task.id}`}
                className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASS[vs])}
                title={task.subject}
              />
            );
          })}
        </div>
      ) : null}
      <span className="shrink-0 tabular-nums font-medium text-foreground">
        {completed + failed}/{tasks.length}
      </span>
      {compactMode ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {Math.round(((completed + failed) / tasks.length) * 100)}%
        </span>
      ) : null}
      {/* Plain-text rendering — React escapes by default (XSS defense). */}
      <span className="min-w-0 truncate">{activeText}</span>
      {failed > 0 && !inProgress ? (
        <span className="shrink-0 rounded-full bg-destructive/10 text-destructive px-1.5 py-0.5 text-[10px] font-medium">
          {tAi("runtimeTask.failedBadge", "{{count}} failed", { count: failed })}
        </span>
      ) : null}
    </>
  );

  return (
    <div className="relative overflow-hidden rounded-lg border border-border/40 bg-muted/20">
      {/* Shimmer overlay when any task is active. */}
      {hasActive ? (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 w-[50%] dark:hidden"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.02) 25%, rgba(0,0,0,0.05) 50%, rgba(0,0,0,0.02) 75%, transparent 100%)",
              transform: "skewX(-20deg)",
              animation: "task-shimmer 2s linear infinite",
            }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 w-[50%] hidden dark:block"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%, transparent 100%)",
              transform: "skewX(-20deg)",
              animation: "task-shimmer 2s linear infinite",
            }}
          />
          <style>{`@keyframes task-shimmer { 0% { left: -50%; } 100% { left: 100%; } }`}</style>
        </>
      ) : null}

      {expandable ? (
        <button
          type="button"
          className="relative flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {headerContent}
          <ChevronDown
            className={cn(
              "ml-auto h-3 w-3 shrink-0 transition-transform duration-150",
              expanded && "rotate-180",
            )}
          />
        </button>
      ) : (
        <div className="relative flex w-full items-center gap-2 px-2.5 py-1 text-xs text-muted-foreground leading-none">
          {headerContent}
        </div>
      )}

      {expandable && expanded ? (
        <div className="border-t border-border/30 px-3 py-1.5 space-y-0.5">
          {tasks.map((task) => {
            const vs = resolveVisualStatus(task, allTasks);
            const Icon = ICON_MAP[vs];
            const waitingFor = vs === "pending" && task.blockedBy.length > 0
              ? task.blockedBy.map((id) => {
                  const dep = allTasks.find((d) => d.id === id);
                  return dep?.subject ?? `#${id}`;
                }).join(", ")
              : null;
            const lineText = task.activeForm ?? task.subject;
            return (
              <div key={`s-${task.id}`} className="flex items-center gap-2 py-0.5 text-xs">
                <Icon
                  className={cn(
                    "h-3 w-3 shrink-0",
                    ICON_CLASS[vs],
                    vs === "in_progress" && "animate-spin",
                  )}
                />
                <span
                  className={cn(
                    "min-w-0 truncate",
                    vs === "completed" && "text-muted-foreground line-through",
                    vs === "failed" && "text-destructive",
                    vs === "aborted" && "text-muted-foreground",
                    vs === "timeout" && "text-orange-500",
                    vs === "in_progress" && "text-foreground font-medium",
                    (vs === "pending" || vs === "ready") && "text-muted-foreground",
                  )}
                >
                  {lineText}
                  {waitingFor ? (
                    <span className="ml-1 text-[10px] text-muted-foreground/70">
                      ({tAi("runtimeTask.waitingFor", "waiting on {{names}}", { names: waitingFor })})
                    </span>
                  ) : null}
                  {vs === "ready" ? (
                    <span className="ml-1 text-[10px] text-foreground/60">
                      ({tAi("runtimeTask.ready", "ready")})
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })}
          <div className="pt-1 text-[10px] text-muted-foreground/60 italic">
            {tAi("runtimeTask.aiSelfReport", "AI self-reported")}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main TaskProgressBar (session-scoped, multi-agent grouped)
// ---------------------------------------------------------------------------

type TaskProgressBarProps = {
  tasks: RuntimeTask[];
  className?: string;
};

export default function TaskProgressBar({ tasks, className }: TaskProgressBarProps) {
  // React's render batching + the container's shallow-compare subscription already
  // prevent excessive renders; no manual throttling needed.
  const groups = useMemo(() => groupByOwner(tasks), [tasks]);
  const compactMode = tasks.length > 16;

  if (tasks.length === 0) return null;

  return (
    <div className={cn("mx-6 flex flex-col gap-1", className)}>
      {groups.map((group) => (
        <ProgressBarRow
          key={group.ownerAgentId ?? "__unowned__"}
          group={group}
          allTasks={tasks}
          expandable={true}
          compactMode={compactMode}
        />
      ))}
    </div>
  );
}
