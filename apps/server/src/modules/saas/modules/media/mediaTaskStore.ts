/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getProjectRootPath } from "@openloaf/api/services/vfsService";

export type MediaTaskContext = {
  /** Task id. */
  taskId: string;
  /** Result type hint. */
  resultType?: "image" | "video" | "audio";
  /** Project id for storage. */
  projectId?: string;
  /** Save directory path (relative to project root, e.g. .openloaf/boards/xxx/asset). */
  saveDir?: string;
  /** Source node id for tracing. */
  sourceNodeId?: string;
  /** Creation timestamp. */
  createdAt: number;
};

const TASK_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_TASKS = 50;
const taskStore = new Map<string, MediaTaskContext>();

// ---------------------------------------------------------------------------
// Board-scoped persistence helpers
// ---------------------------------------------------------------------------

/** Read JSON file safely with a fallback. */
function readJsonSafely<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

/** Write JSON file atomically. */
function writeJsonAtomic(filePath: string, payload: unknown): void {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
  renameSync(tmpPath, filePath);
}

/**
 * Resolve the absolute path of tasks.json for a board.
 * saveDir is like ".openloaf/boards/board_xxx/asset", board dir is its parent.
 * Returns null if projectId or saveDir is missing/invalid.
 */
function resolveBoardTasksPath(ctx: { projectId?: string; saveDir?: string }): string | null {
  const projectId = ctx.projectId?.trim();
  const saveDir = ctx.saveDir?.trim();
  if (!projectId || !saveDir) return null;
  const rootPath = getProjectRootPath(projectId);
  if (!rootPath) return null;
  // saveDir = ".openloaf/boards/board_xxx/asset" → board dir = parent
  const boardDir = path.dirname(saveDir);
  if (!boardDir || boardDir === ".") return null;
  return path.join(path.resolve(rootPath), boardDir, "tasks.json");
}

/** Persist all tasks belonging to a specific board tasks.json path. */
function persistToBoard(tasksPath: string): void {
  // 逻辑：只写入属于同一画布目录的任务。
  const boardDir = path.dirname(tasksPath);
  const entries = Array.from(taskStore.values()).filter((ctx) => {
    const ctxTasksPath = resolveBoardTasksPath(ctx);
    return ctxTasksPath && path.dirname(ctxTasksPath) === boardDir;
  });
  if (entries.length === 0) {
    // 逻辑：无任务时删除 tasks.json，保持画布目录干净。
    try {
      if (existsSync(tasksPath)) {
        unlinkSync(tasksPath);
      }
    } catch {
      // ignore
    }
    return;
  }
  writeJsonAtomic(tasksPath, entries);
}

/**
 * Load tasks from a board's tasks.json into memory.
 * Called lazily when polling finds a miss in the in-memory store.
 */
export function loadBoardTasks(projectId: string, saveDir: string): void {
  const tasksPath = resolveBoardTasksPath({ projectId, saveDir });
  if (!tasksPath) return;
  const entries = readJsonSafely<MediaTaskContext[]>(tasksPath, []);
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.taskId) continue;
    if (taskStore.has(entry.taskId)) continue;
    if (now - entry.createdAt > TASK_TTL_MS) continue;
    taskStore.set(entry.taskId, entry);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Remember task context for later polling. */
export function rememberMediaTask(ctx: MediaTaskContext) {
  // 逻辑：超出上限时清理最旧的条目。
  if (taskStore.size >= MAX_TASKS) {
    let oldestKey: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;
    for (const [key, val] of taskStore) {
      if (val.createdAt < oldestTime) {
        oldestTime = val.createdAt;
        oldestKey = key;
      }
    }
    if (oldestKey) taskStore.delete(oldestKey);
  }
  taskStore.set(ctx.taskId, ctx);
  const tasksPath = resolveBoardTasksPath(ctx);
  if (tasksPath) persistToBoard(tasksPath);
}

/** Get task context by id with ttl check. */
export function getMediaTaskContext(taskId: string): MediaTaskContext | null {
  const ctx = taskStore.get(taskId) ?? null;
  if (!ctx) return null;
  if (Date.now() - ctx.createdAt > TASK_TTL_MS) {
    // 逻辑：过期记录直接清理，避免内存泄露。
    taskStore.delete(taskId);
    const tasksPath = resolveBoardTasksPath(ctx);
    if (tasksPath) persistToBoard(tasksPath);
    return null;
  }
  return ctx;
}

/** Clear task context by id. */
export function clearMediaTask(taskId: string) {
  const ctx = taskStore.get(taskId);
  if (ctx) {
    taskStore.delete(taskId);
    const tasksPath = resolveBoardTasksPath(ctx);
    if (tasksPath) persistToBoard(tasksPath);
  }
}
