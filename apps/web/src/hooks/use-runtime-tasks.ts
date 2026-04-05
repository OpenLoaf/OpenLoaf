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

import { create } from "zustand";
import type { RuntimeTask } from "@openloaf/api/types/tools/runtimeTask";

type SessionTaskState = {
  tasks: Record<string, RuntimeTask>;
  /** Last seen SSE sequence number for gap detection. */
  lastSeq: number;
  /** Pending queue: updated events arrived before their created counterpart. */
  pendingUpdates: Map<string, { task: RuntimeTask; receivedAt: number }>;
  /** Scheduled hide timeout (to allow new tasks to cancel the hide). */
  hideTimer?: ReturnType<typeof setTimeout>;
  /** Whether all tasks have terminated and the ProgressBar is about to hide. */
  hiding: boolean;
};

export type RuntimeTasksState = {
  bySession: Record<string, SessionTaskState>;
  /** Apply a single SSE runtime-task event. */
  applyEvent: (
    sessionId: string,
    event:
      | { seq: number; kind: "created"; task: RuntimeTask }
      | { seq: number; kind: "updated"; task: RuntimeTask }
      | { seq: number; kind: "deleted"; taskId: string }
      | { seq: number; kind: "snapshot"; tasks: RuntimeTask[] },
  ) => void;
  /** Get a merged view of tasks for a session (for rendering). */
  getTasks: (sessionId: string) => RuntimeTask[];
  /** Clear all state for a session. */
  clearSession: (sessionId: string) => void;
  /** Called after all tasks become terminal — schedules hide. */
  scheduleHide: (sessionId: string) => void;
  /** Cancel pending hide (when new tasks appear). */
  cancelHide: (sessionId: string) => void;
};

const HIDE_DELAY_MS = 1500;
const PENDING_TTL_MS = 5000;

function isTerminal(status: RuntimeTask["status"]): boolean {
  return status === "completed" || status === "failed";
}

function ensureSession(
  bySession: Record<string, SessionTaskState>,
  sessionId: string,
): SessionTaskState {
  const existing = bySession[sessionId];
  if (existing) return existing;
  const fresh: SessionTaskState = {
    tasks: {},
    lastSeq: 0,
    pendingUpdates: new Map(),
    hiding: false,
  };
  bySession[sessionId] = fresh;
  return fresh;
}

function allTerminated(tasks: Record<string, RuntimeTask>): boolean {
  const values = Object.values(tasks);
  if (values.length === 0) return false;
  return values.every((t) => isTerminal(t.status));
}

export const useRuntimeTasks = create<RuntimeTasksState>((set, get) => ({
  bySession: {},

  applyEvent: (sessionId, event) => {
    set((state) => {
      const next = { ...state.bySession };
      const session: SessionTaskState = {
        ...ensureSession(next, sessionId),
        tasks: { ...ensureSession(next, sessionId).tasks },
        pendingUpdates: new Map(ensureSession(next, sessionId).pendingUpdates),
      };
      next[sessionId] = session;

      // Snapshot: replace entire state.
      if (event.kind === "snapshot") {
        const newTasks: Record<string, RuntimeTask> = {};
        for (const t of event.tasks) newTasks[t.id] = t;
        session.tasks = newTasks;
        session.lastSeq = event.seq;
        session.pendingUpdates = new Map();
        return { bySession: next };
      }

      // Detect seq gap → request would be needed but we rely on next message's snapshot.
      // For now, log-only behavior; incoming snapshot events will resync.
      if (event.seq > session.lastSeq + 1 && session.lastSeq > 0) {
        // Gap detected; keep processing but note the drift.
        // (Next stream start will emit a snapshot.)
      }
      session.lastSeq = Math.max(session.lastSeq, event.seq);

      if (event.kind === "created") {
        session.tasks[event.task.id] = event.task;
        // Replay any pending updates for this task.
        const pending = session.pendingUpdates.get(event.task.id);
        if (pending) {
          session.tasks[event.task.id] = pending.task;
          session.pendingUpdates.delete(event.task.id);
        }
      } else if (event.kind === "updated") {
        if (session.tasks[event.task.id]) {
          session.tasks[event.task.id] = event.task;
        } else {
          // Task not yet created locally — queue update, expires after PENDING_TTL_MS.
          session.pendingUpdates.set(event.task.id, {
            task: event.task,
            receivedAt: Date.now(),
          });
        }
      } else if (event.kind === "deleted") {
        delete session.tasks[event.taskId];
        session.pendingUpdates.delete(event.taskId);
      }

      // Evict expired pending updates.
      const now = Date.now();
      for (const [id, entry] of session.pendingUpdates) {
        if (now - entry.receivedAt > PENDING_TTL_MS) {
          session.pendingUpdates.delete(id);
        }
      }

      return { bySession: next };
    });

    // Schedule hide if all terminated; cancel hide if new non-terminal tasks appeared.
    const sess = get().bySession[sessionId];
    if (!sess) return;
    if (allTerminated(sess.tasks)) {
      if (!sess.hiding) get().scheduleHide(sessionId);
    } else if (sess.hiding) {
      get().cancelHide(sessionId);
    }
  },

  getTasks: (sessionId) => {
    const sess = get().bySession[sessionId];
    if (!sess) return [];
    return Object.values(sess.tasks).sort((a, b) => {
      const na = Number.parseInt(a.id, 10);
      const nb = Number.parseInt(b.id, 10);
      return na - nb;
    });
  },

  clearSession: (sessionId) => {
    set((state) => {
      const next = { ...state.bySession };
      const sess = next[sessionId];
      if (sess?.hideTimer) clearTimeout(sess.hideTimer);
      delete next[sessionId];
      return { bySession: next };
    });
  },

  scheduleHide: (sessionId) => {
    set((state) => {
      const next = { ...state.bySession };
      const sess = next[sessionId];
      if (!sess) return state;
      if (sess.hideTimer) clearTimeout(sess.hideTimer);
      const timer = setTimeout(() => {
        set((s) => {
          const nn = { ...s.bySession };
          const ns = nn[sessionId];
          if (!ns) return s;
          nn[sessionId] = { ...ns, tasks: {}, hiding: false, hideTimer: undefined };
          return { bySession: nn };
        });
      }, HIDE_DELAY_MS);
      next[sessionId] = { ...sess, hiding: true, hideTimer: timer };
      return { bySession: next };
    });
  },

  cancelHide: (sessionId) => {
    set((state) => {
      const next = { ...state.bySession };
      const sess = next[sessionId];
      if (!sess) return state;
      if (sess.hideTimer) clearTimeout(sess.hideTimer);
      next[sessionId] = { ...sess, hiding: false, hideTimer: undefined };
      return { bySession: next };
    });
  },
}));
