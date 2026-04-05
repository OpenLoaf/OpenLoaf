/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Runtime Task System — session-scoped task tracking with multi-agent support
// ---------------------------------------------------------------------------

/** Hard limits to prevent resource exhaustion. */
export const RUNTIME_TASK_LIMITS = {
  MAX_TASKS_PER_SESSION: 100,
  MAX_SUBJECT_LEN: 200,
  MAX_DESCRIPTION_LEN: 8192,
  MAX_ACTIVE_FORM_LEN: 200,
  MAX_METADATA_BYTES: 4096,
  MAX_DEPENDENCY_DEPTH: 10,
  DEFAULT_TASK_TIMEOUT_MS: 600_000,
  MAX_BLOCKED_BY: 20,
} as const;

/** Allowed metadata keys (whitelist). */
export const RUNTIME_TASK_METADATA_KEYS = [
  "tag",
  "note",
  "parent",
  "url",
  "step",
  "category",
] as const;

export type RuntimeTaskMetadataKey = (typeof RUNTIME_TASK_METADATA_KEYS)[number];

/** Task status. */
export const runtimeTaskStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);
export type RuntimeTaskStatus = z.infer<typeof runtimeTaskStatusSchema>;

/** Task failure reason (system-assigned, never by AI). */
export const runtimeTaskFailReasonSchema = z.enum([
  "timeout",
  "interrupted",
  "abortedByUser",
  "agentFailed",
  "depFailed",
]);
export type RuntimeTaskFailReason = z.infer<typeof runtimeTaskFailReasonSchema>;

/** Owner descriptor (server-injected, never AI-provided). */
export const runtimeTaskOwnerSchema = z.object({
  agentId: z.string(),
  name: z.string(),
  displayName: z.string().optional(),
});
export type RuntimeTaskOwner = z.infer<typeof runtimeTaskOwnerSchema>;

/** Runtime task (persisted fields only). */
export const runtimeTaskSchema = z.object({
  id: z.string(),
  subject: z.string().min(1).max(RUNTIME_TASK_LIMITS.MAX_SUBJECT_LEN),
  description: z.string().max(RUNTIME_TASK_LIMITS.MAX_DESCRIPTION_LEN).optional(),
  status: runtimeTaskStatusSchema,
  owner: runtimeTaskOwnerSchema.optional(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  failReason: runtimeTaskFailReasonSchema.optional(),
  blocks: z.array(z.string()).default([]),
  blockedBy: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
type PersistedRuntimeTask = z.infer<typeof runtimeTaskSchema>;

/** Runtime task with optional in-memory activeForm (attached when emitted over SSE). */
export type RuntimeTask = PersistedRuntimeTask & {
  activeForm?: string;
};

/** Persisted store structure for runtime_tasks.json. */
export const runtimeTaskStoreSchema = z
  .object({
    highWaterMark: z.number().int().min(0).default(0),
    seq: z.number().int().min(0).default(0),
    tasks: z.record(z.string(), runtimeTaskSchema).default({}),
  })
  .strict();
export type RuntimeTaskStore = z.infer<typeof runtimeTaskStoreSchema>;

/** activeForm live value (memory-only, not persisted). */
export type RuntimeTaskActiveForm = {
  taskId: string;
  text: string;
};

// ---------------------------------------------------------------------------
// AI Tool Definitions
// ---------------------------------------------------------------------------

/** TaskCreate tool — Master-only. */
export const taskCreateToolDef = {
  id: "TaskCreate",
  readonly: false,
  name: "创建任务",
  description: `Creates a Runtime Task to track the progress of a multi-step or large task. Shows a progress bar above the input box so the user can see what's happening.

When to call: Use when tracking progress of a multi-step or large task (estimated 3+ steps or >2 minutes of work).
When NOT to call: Simple Q&A, single-step operations.

Notes:
- Runtime Tasks are session-scoped (disappear when conversation ends).
- Use \`blockedBy\` to express dependencies (this task waits for others to complete).
- After creating tasks, call TaskUpdate to transition status to 'in_progress' when you start working.`,
  parameters: z.object({
    subject: z
      .string()
      .min(1)
      .max(RUNTIME_TASK_LIMITS.MAX_SUBJECT_LEN)
      .describe("Task title (imperative form, <=200 chars)"),
    description: z
      .string()
      .max(RUNTIME_TASK_LIMITS.MAX_DESCRIPTION_LEN)
      .optional()
      .describe("Detailed description (<=8KB)"),
    blockedBy: z
      .array(z.string())
      .max(RUNTIME_TASK_LIMITS.MAX_BLOCKED_BY)
      .optional()
      .describe(
        "Task IDs this task depends on. This task stays pending until all listed tasks complete.",
      ),
  }),
  component: null,
} as const;

export type TaskCreateArgs = z.infer<typeof taskCreateToolDef.parameters>;

/** TaskUpdate tool — Master-only. */
export const taskUpdateToolDef = {
  id: "TaskUpdate",
  readonly: false,
  name: "更新任务",
  description: `Updates a Runtime Task's status, \`activeForm\` (live "what I'm doing right now" text), or other fields. Call when a task's state changes (start/complete/fail) or its progress text needs updating.

State transitions allowed:
- pending → in_progress / failed / deleted
- in_progress → completed / failed
- completed/failed are terminal (cannot revert)

Notes:
- Call with status='in_progress' when starting a task. System auto-records startedAt.
- Call with status='completed' when finished. System auto-records completedAt and unlocks downstream tasks.
- Use activeForm for fine-grained progress ("Analyzing email 5 of 20") — updated in-memory, no disk write.
- When a task completes, the response will list unlockedTasks. Act on them next.`,
  parameters: z.object({
    taskId: z.string().describe("Task ID to update"),
    subject: z
      .string()
      .max(RUNTIME_TASK_LIMITS.MAX_SUBJECT_LEN)
      .optional()
      .describe("Update title"),
    description: z
      .string()
      .max(RUNTIME_TASK_LIMITS.MAX_DESCRIPTION_LEN)
      .optional()
      .describe("Update description"),
    activeForm: z
      .string()
      .max(RUNTIME_TASK_LIMITS.MAX_ACTIVE_FORM_LEN)
      .optional()
      .describe("Current operation description (e.g. 'Analyzing email 5/20')"),
    status: z
      .enum(["pending", "in_progress", "completed", "failed", "deleted"])
      .optional()
      .describe("Transition task status"),
    addBlockedBy: z
      .array(z.string())
      .optional()
      .describe("Add new blocking dependencies to this task"),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Merge metadata keys. Allowed keys: tag, note, parent, url, step, category",
      ),
  }),
  component: null,
} as const;

export type TaskUpdateArgs = z.infer<typeof taskUpdateToolDef.parameters>;

/** TaskRead tool — Master-only. */
export const taskReadToolDef = {
  id: "TaskRead",
  readonly: true,
  name: "查询任务",
  description: `Lists active Runtime Tasks or reads details of a single task. Call when you need to check task status or retrieve a specific task.

Defaults:
- When no taskId: returns pending + in_progress tasks (excludes completed/failed history).
- Pass includeAborted=true to see interrupted tasks from prior sessions.
- Default limit=20, use offset for pagination.

When to call:
- Before creating new tasks (avoid duplicates).
- After TaskUpdate reports unlockedTasks, to decide next action.
- To review progress before summarizing work to the user.`,
  parameters: z.object({
    taskId: z.string().optional().describe("Specific task ID (returns full detail)"),
    statusFilter: z
      .array(z.enum(["pending", "in_progress", "completed", "failed"]))
      .optional()
      .describe("Filter by statuses. Default: ['pending','in_progress']"),
    includeAborted: z
      .boolean()
      .optional()
      .describe("Include interrupted/aborted tasks. Default: false"),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (1-50, default 20)"),
    offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)"),
  }),
  component: null,
} as const;

export type TaskReadArgs = z.infer<typeof taskReadToolDef.parameters>;

// ---------------------------------------------------------------------------
// SSE Event Payload
// ---------------------------------------------------------------------------

export type RuntimeTaskSseEvent =
  | {
      seq: number;
      event: "created" | "updated";
      task: RuntimeTask;
      unlockedTasks?: string[];
    }
  | {
      seq: number;
      event: "deleted";
      taskId: string;
    }
  | {
      seq: number;
      event: "snapshot";
      snapshot: { tasks: RuntimeTask[]; seq: number };
    };
