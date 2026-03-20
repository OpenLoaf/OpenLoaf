/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { app } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Logger } from "../logging/startupLogger";

type CalendarPermissionState = "granted" | "denied" | "prompt" | "unsupported";
type CalendarRange = { start: string; end: string };
type CalendarItem = {
  id: string;
  title: string;
  color?: string;
  readOnly?: boolean;
  isSubscribed?: boolean;
};
type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  description?: string;
  location?: string;
  color?: string;
  calendarId?: string;
  recurrence?: string;
  completed?: boolean;
};
type CalendarResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; code?: string };

type WatchSession = {
  process: ChildProcessWithoutNullStreams;
};

/** 一次性命令的超时时间（毫秒）。超时后强制 kill 进程。 */
const INVOKE_TIMEOUT_MS = 30_000;
/** SIGTERM 后等待进程退出的宽限期（毫秒）。超时后发 SIGKILL。 */
const KILL_GRACE_MS = 3_000;

/** Resolve the calendar helper path for the current environment. */
function resolveCalendarHelperPath(): string | null {
  const platform = process.platform;
  let relativeDir: string;
  let binaryName: string;

  if (platform === "darwin") {
    relativeDir = "macos";
    binaryName = "openloaf-calendar";
  } else if (platform === "win32") {
    relativeDir = "windows";
    binaryName = "openloaf-calendar.exe";
  } else {
    return null;
  }
  // 逻辑：生产环境从 resources 读取，开发环境从 apps/desktop/resources 读取。
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "calendar", relativeDir, binaryName);
  }
  const devRoot = path.resolve(__dirname, "../..");
  return path.join(devRoot, "resources", "calendar", relativeDir, binaryName);
}

/** 强制杀死子进程（先 SIGKILL，忽略错误）。 */
function forceKill(child: ChildProcessWithoutNullStreams): void {
  try {
    child.kill("SIGKILL");
  } catch {
    // 进程可能已退出，忽略。
  }
}

/** Create a system calendar service bound to Electron main process. */
export function createCalendarService(args: { log: Logger }) {
  /** 跟踪所有活跃的一次性子进程，用于 destroy() 时统一清理。 */
  const activeChildren = new Set<ChildProcessWithoutNullStreams>();

  /** Invoke the calendar helper with one-shot JSON request/response. */
  function invokeCalendarHelper<T>(
    action: string,
    payload: unknown,
  ): Promise<CalendarResult<T>> {
    const helperPath = resolveCalendarHelperPath();
    if (!helperPath || !fs.existsSync(helperPath)) {
      return Promise.resolve({
        ok: false,
        reason: "日历组件未构建，请先生成原生日历 helper。",
        code: "helper_missing",
      });
    }

    return new Promise((resolve) => {
      const spawnArgs = [action, JSON.stringify(payload ?? {})];
      if (action === "update-reminder" || action === "create-reminder") {
        args.log(`[calendar] ${action} payload: ${JSON.stringify(payload ?? {})}`);
      }
      const child = spawn(helperPath, spawnArgs, { stdio: ["ignore", "pipe", "pipe"] });
      activeChildren.add(child);
      let stdout = "";
      let stderr = "";
      let settled = false;

      const settle = (result: CalendarResult<T>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        activeChildren.delete(child);
        resolve(result);
      };

      // 超时保护：防止 Swift 二进制挂住导致进程泄漏。
      const timer = setTimeout(() => {
        if (settled) return;
        args.log(`[calendar] ${action} timed out after ${INVOKE_TIMEOUT_MS}ms, killing process`);
        forceKill(child);
        settle({ ok: false, reason: "日历操作超时。", code: "timeout" });
      }, INVOKE_TIMEOUT_MS);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        args.log(`[calendar] helper spawn error: ${String(error)}`);
        settle({ ok: false, reason: "日历组件启动失败。", code: "helper_spawn_error" });
      });

      child.on("close", (code) => {
        if (stderr.trim()) {
          args.log(`[calendar] ${action} stderr: ${stderr.trim()}`);
        }
        if (code !== 0) {
          const reason = stderr.trim() || `helper exited with code ${code ?? 0}`;
          settle({ ok: false, reason, code: "helper_failed" });
          return;
        }
        const raw = stdout.trim();
        if (!raw) {
          settle({ ok: false, reason: "日历组件未返回数据。", code: "empty_response" });
          return;
        }
        try {
          const parsed = JSON.parse(raw) as CalendarResult<T>;
          settle(parsed);
        } catch (error) {
          args.log(`[calendar] helper parse error: ${String(error)}`);
          settle({ ok: false, reason: "日历数据解析失败。", code: "parse_error" });
        }
      });
    });
  }

  /** Active renderer listeners for calendar change events. */
  const listeners = new Set<Electron.WebContents>();
  /** Active watch session with helper process. */
  let watchSession: WatchSession | null = null;
  /** 标记 watch 正在关闭中，防止重复启动。 */
  let watchStopping = false;

  /** 清理已销毁的 webContents 引用。 */
  const pruneDestroyedListeners = () => {
    for (const wc of listeners) {
      if (wc.isDestroyed()) listeners.delete(wc);
    }
  };

  /** Emit a change event to subscribed renderers. */
  const emitChange = () => {
    for (const webContents of listeners) {
      if (webContents.isDestroyed()) {
        listeners.delete(webContents);
        continue;
      }
      webContents.send("openloaf:calendar:changed", { source: "system" });
    }
  };

  /** Start helper watch process if not running. */
  const startWatch = () => {
    if (watchSession || watchStopping) return;
    const helperPath = resolveCalendarHelperPath();
    if (!helperPath || !fs.existsSync(helperPath)) {
      return;
    }
    const child = spawn(helperPath, ["watch"], { stdio: ["ignore", "pipe", "pipe"] });
    watchSession = { process: child };

    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const payload = JSON.parse(trimmed) as { type?: string };
          if (payload.type === "changed") {
            emitChange();
          }
        } catch {
          // 逻辑：忽略无法解析的输出，避免影响主进程稳定性。
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      args.log(`[calendar] watch stderr: ${chunk.toString().trim()}`);
    });

    child.on("exit", () => {
      watchSession = null;
      watchStopping = false;
    });
  };

  /** 关闭 watch 进程。先 SIGTERM，宽限期后 SIGKILL。 */
  const killWatch = () => {
    if (!watchSession) return;
    const session = watchSession;
    watchStopping = true;
    try {
      session.process.kill("SIGTERM");
    } catch {
      // 进程可能已退出。
    }
    // 宽限期后强制 SIGKILL，防止 SIGTERM 被忽略导致孤儿进程。
    const killTimer = setTimeout(() => {
      if (watchSession === session) {
        args.log("[calendar] watch process did not exit after SIGTERM, sending SIGKILL");
        forceKill(session.process);
      }
    }, KILL_GRACE_MS);
    // exit 事件触发时取消 SIGKILL 定时器。
    session.process.once("exit", () => clearTimeout(killTimer));
  };

  /** Stop watch process when no listeners remain. */
  const stopWatchIfIdle = () => {
    pruneDestroyedListeners();
    if (listeners.size > 0) return;
    killWatch();
  };

  /** Request system permission. */
  const requestPermission = async (): Promise<CalendarResult<CalendarPermissionState>> =>
    invokeCalendarHelper<CalendarPermissionState>("permission", {});

  /** Fetch available calendars. */
  const listCalendars = async (): Promise<CalendarResult<CalendarItem[]>> =>
    invokeCalendarHelper<CalendarItem[]>("list-calendars", {});

  /** Fetch available reminder lists. */
  const listReminders = async (): Promise<CalendarResult<CalendarItem[]>> =>
    invokeCalendarHelper<CalendarItem[]>("list-reminders", {});

  /** Fetch events in time range. */
  const getEvents = async (range: CalendarRange): Promise<CalendarResult<CalendarEvent[]>> =>
    invokeCalendarHelper<CalendarEvent[]>("get-events", range);

  /** Fetch reminders in time range. */
  const getReminders = async (range: CalendarRange): Promise<CalendarResult<CalendarEvent[]>> =>
    invokeCalendarHelper<CalendarEvent[]>("get-reminders", range);

  /** Create a new system event. */
  const createEvent = async (
    payload: Omit<CalendarEvent, "id">
  ): Promise<CalendarResult<CalendarEvent>> =>
    invokeCalendarHelper<CalendarEvent>("create-event", payload);

  /** Create a new reminder item. */
  const createReminder = async (
    payload: Omit<CalendarEvent, "id">
  ): Promise<CalendarResult<CalendarEvent>> =>
    invokeCalendarHelper<CalendarEvent>("create-reminder", payload);

  /** Update an existing system event. */
  const updateEvent = async (payload: CalendarEvent): Promise<CalendarResult<CalendarEvent>> =>
    invokeCalendarHelper<CalendarEvent>("update-event", payload);

  /** Update an existing reminder item. */
  const updateReminder = async (payload: CalendarEvent): Promise<CalendarResult<CalendarEvent>> =>
    invokeCalendarHelper<CalendarEvent>("update-reminder", payload);

  /** Delete an existing system event. */
  const deleteEvent = async (payload: { id: string }): Promise<CalendarResult<{ id: string }>> =>
    invokeCalendarHelper<{ id: string }>("delete-event", payload);

  /** Delete an existing reminder item. */
  const deleteReminder = async (
    payload: { id: string }
  ): Promise<CalendarResult<{ id: string }>> =>
    invokeCalendarHelper<{ id: string }>("delete-reminder", payload);

  /** Start watching calendar changes for a renderer. */
  const startWatching = (webContents: Electron.WebContents): CalendarResult<{ ok: true }> => {
    if (webContents.isDestroyed()) {
      return { ok: false, reason: "目标窗口已关闭。", code: "webcontents_destroyed" };
    }
    listeners.add(webContents);
    // 当 webContents 销毁时自动移除，防止泄漏。
    webContents.once("destroyed", () => {
      listeners.delete(webContents);
      stopWatchIfIdle();
    });
    startWatch();
    return { ok: true, data: { ok: true } };
  };

  /** Stop watching calendar changes for a renderer. */
  const stopWatching = (webContents: Electron.WebContents): CalendarResult<{ ok: true }> => {
    listeners.delete(webContents);
    stopWatchIfIdle();
    return { ok: true, data: { ok: true } };
  };

  /** 销毁所有日历子进程。在应用退出时调用。 */
  const destroy = () => {
    // 杀掉 watch 进程。
    killWatch();
    // 杀掉所有一次性子进程。
    for (const child of activeChildren) {
      forceKill(child);
    }
    activeChildren.clear();
    listeners.clear();
  };

  return {
    requestPermission,
    listCalendars,
    listReminders,
    getEvents,
    getReminders,
    createEvent,
    createReminder,
    updateEvent,
    updateReminder,
    deleteEvent,
    deleteReminder,
    startWatching,
    stopWatching,
    destroy,
  };
}
