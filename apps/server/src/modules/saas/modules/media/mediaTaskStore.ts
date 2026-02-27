/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
export type MediaTaskContext = {
  /** Task id. */
  taskId: string;
  /** Result type hint. */
  resultType?: "image" | "video";
  /** Workspace id for storage. */
  workspaceId?: string;
  /** Project id for storage. */
  projectId?: string;
  /** Save directory path. */
  saveDir?: string;
  /** Source node id for tracing. */
  sourceNodeId?: string;
  /** Creation timestamp. */
  createdAt: number;
};

const TASK_TTL_MS = 2 * 60 * 60 * 1000;
const taskStore = new Map<string, MediaTaskContext>();

/** Remember task context for later polling. */
export function rememberMediaTask(ctx: MediaTaskContext) {
  taskStore.set(ctx.taskId, ctx);
}

/** Get task context by id with ttl check. */
export function getMediaTaskContext(taskId: string): MediaTaskContext | null {
  const ctx = taskStore.get(taskId) ?? null;
  if (!ctx) return null;
  if (Date.now() - ctx.createdAt > TASK_TTL_MS) {
    // 逻辑：过期记录直接清理，避免内存泄露。
    taskStore.delete(taskId);
    return null;
  }
  return ctx;
}

/** Clear task context by id. */
export function clearMediaTask(taskId: string) {
  taskStore.delete(taskId);
}
