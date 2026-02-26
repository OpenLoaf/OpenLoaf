/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nexport type RunDailySummaryInput = {
  /** Project id. */
  projectId: string;
  /** Target date key (YYYY-MM-DD). */
  dateKey: string;
  /** Trigger source. */
  triggeredBy: "manual" | "external";
};

export type SummaryTaskStatusInput = {
  /** Task id. */
  taskId: string;
};

export type SummaryTaskListInput = {
  /** Optional project id. */
  projectId?: string;
  /** Optional workspace id. */
  workspaceId?: string;
};

export type SummaryRuntime = {
  /** Run daily summary for a project. */
  runDailySummary: (input: RunDailySummaryInput) => Promise<{ taskId: string }>;
  /** Run daily summary for all projects in a workspace. */
  runDailySummaryForWorkspace: (input: {
    workspaceId: string;
    dateKey: string;
    triggeredBy: "manual" | "external";
  }) => Promise<{ taskIds: string[] }>;
  /** Get task status by id. */
  getTaskStatus: (
    input: SummaryTaskStatusInput,
  ) => Promise<{ taskId: string; status: string; metadata?: Record<string, unknown> } | null>;
  /** List task statuses. */
  listTaskStatus: (
    input: SummaryTaskListInput,
  ) => Promise<Array<{ taskId: string; status: string; metadata?: Record<string, unknown> }>>;
};

let runtime: SummaryRuntime | null = null;

/** Register summary runtime implementation. */
export function setSummaryRuntime(next: SummaryRuntime): void {
  runtime = next;
}

/** Require summary runtime to be registered. */
export function requireSummaryRuntime(): SummaryRuntime {
  if (!runtime) {
    throw new Error("Summary runtime not registered.");
  }
  return runtime;
}
