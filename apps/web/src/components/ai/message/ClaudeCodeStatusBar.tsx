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
import { useChatRuntime } from "@/hooks/use-chat-runtime";
import type { ClaudeCodeRuntimeState } from "@/hooks/use-chat-runtime";
import { cn } from "@/lib/utils";
import ClaudeCodeUserQuestion from "./ClaudeCodeUserQuestion";

interface ClaudeCodeStatusBarProps {
  tabId: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** Format a unix timestamp to HH:MM. */
function formatResetTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ─── Sub-components ─────────────────────────────────────────────────────

/** Session init info: model, version, cwd. */
function InitInfo({ init }: { init: NonNullable<ClaudeCodeRuntimeState["init"]> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground/60">
      {init.model && (
        <span className="inline-flex items-center gap-1">
          <span className="text-muted-foreground/40">model</span>
          <span className="font-medium text-muted-foreground/80">{init.model}</span>
        </span>
      )}
      {init.claudeCodeVersion && (
        <span className="inline-flex items-center gap-1">
          <span className="text-muted-foreground/40">v{init.claudeCodeVersion}</span>
        </span>
      )}
      {init.cwd && (
        <span className="inline-flex items-center gap-1 truncate max-w-[200px]" title={init.cwd}>
          <span className="text-muted-foreground/40">cwd</span>
          <span className="truncate font-mono text-[11px]">{init.cwd}</span>
        </span>
      )}
      {init.tools.length > 0 && (
        <span className="text-muted-foreground/40">
          {init.tools.length} tools
        </span>
      )}
      {init.mcpServers.length > 0 && (
        <span className="text-muted-foreground/40">
          {init.mcpServers.length} MCP servers
        </span>
      )}
    </div>
  );
}

/** Rate limit warning/error banner. */
function RateLimitBanner({ rateLimit }: { rateLimit: NonNullable<ClaudeCodeRuntimeState["rateLimit"]> }) {
  if (rateLimit.status === "allowed") return null;
  const isRejected = rateLimit.status === "rejected";
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-3xl px-2 py-1 text-xs",
        isRejected
          ? "bg-destructive/10 text-destructive"
          : "bg-secondary text-foreground",
      )}
    >
      <span className="shrink-0">{isRejected ? "\u2715" : "\u26A0"}</span>
      <span>
        {isRejected
          ? `Rate limit exceeded${rateLimit.resetsAt ? `, resets at ${formatResetTime(rateLimit.resetsAt)}` : ""}`
          : `Rate limit warning (${rateLimit.utilization != null ? `${Math.round(rateLimit.utilization * 100)}%` : "high"} utilization)`}
      </span>
    </div>
  );
}

/** Context compacting indicator. */
function CompactingStatus() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/50" />
      <span>Compacting context...</span>
    </div>
  );
}

/** Active tool execution progress. */
function ToolProgressList({ toolProgress }: { toolProgress: Record<string, { toolName: string; elapsedSeconds: number }> }) {
  const entries = Object.entries(toolProgress);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {entries.map(([id, tool]) => (
        <span key={id} className="inline-flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 shrink-0 animate-spin rounded-full border border-primary/50 border-t-transparent" />
          <span className="font-medium">{tool.toolName}</span>
          <span className="tabular-nums text-muted-foreground/70">({tool.elapsedSeconds.toFixed(1)}s)</span>
        </span>
      ))}
    </div>
  );
}

/** Sub-agent / sub-task lifecycle list. */
function TaskList({ tasks }: { tasks: Record<string, { description: string; status: string; summary?: string }> }) {
  const entries = Object.entries(tasks);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      {entries.map(([id, task]) => {
        const isRunning = task.status === "running";
        const isDone = task.status === "completed";
        return (
          <span key={id} className="inline-flex items-center gap-1.5">
            {isRunning ? (
              <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-foreground/60" />
            ) : isDone ? (
              <span className="shrink-0 text-foreground">{"\u2713"}</span>
            ) : (
              <span className="shrink-0 text-destructive">{"\u2715"}</span>
            )}
            <span>Sub-agent: {task.description || "task"}</span>
            {task.summary && (
              <span className="text-muted-foreground/60 truncate max-w-[300px]" title={task.summary}>
                — {task.summary}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────

/**
 * Real-time status bar for Claude Code execution.
 *
 * Renders in priority order:
 * 1. Rate limit warning/error
 * 2. Context compacting indicator
 * 3. Init info (model, version, cwd)
 * 4. Tool execution progress
 * 5. Sub-task lifecycle
 * 6. Final result statistics
 */
export default React.memo(function ClaudeCodeStatusBar({ tabId }: ClaudeCodeStatusBarProps) {
  const ccRuntime = useChatRuntime(
    (state) => state.ccRuntimeByTabId[tabId],
  );

  if (!ccRuntime) return null;

  const { init, rateLimit, status, toolProgress, tasks, result, userQuestion } = ccRuntime;
  const hasToolProgress = Object.keys(toolProgress).length > 0;
  const hasTasks = Object.keys(tasks).length > 0;
  const isCompacting = status === "compacting";
  const hasRateLimitWarning = rateLimit && rateLimit.status !== "allowed";
  const hasUserQuestion = userQuestion && !userQuestion.answered;

  // 没有任何有意义的内容时不渲染
  if (!hasRateLimitWarning && !isCompacting && !init && !hasToolProgress && !hasTasks && !hasUserQuestion) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 py-1">
      {hasRateLimitWarning && rateLimit && <RateLimitBanner rateLimit={rateLimit} />}
      {isCompacting && <CompactingStatus />}
      {init && !result && <InitInfo init={init} />}
      {hasToolProgress && <ToolProgressList toolProgress={toolProgress} />}
      {hasTasks && <TaskList tasks={tasks} />}
      {hasUserQuestion && (
        <ClaudeCodeUserQuestion tabId={tabId} question={userQuestion} />
      )}
    </div>
  );
});
