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

/** Invoke the calendar helper with one-shot JSON request/response. */
function invokeCalendarHelper<T>(
  action: string,
  payload: unknown,
  log: Logger
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
    const args = [action, JSON.stringify(payload ?? {})];
    if (action === "update-reminder" || action === "create-reminder") {
      log(`[calendar] ${action} payload: ${JSON.stringify(payload ?? {})}`);
    }
    const child = spawn(helperPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      log(`[calendar] helper spawn error: ${String(error)}`);
      resolve({ ok: false, reason: "日历组件启动失败。", code: "helper_spawn_error" });
    });

    child.on("close", (code) => {
      if (stderr.trim()) {
        log(`[calendar] ${action} stderr: ${stderr.trim()}`);
      }
      if (code !== 0) {
        const reason = stderr.trim() || `helper exited with code ${code ?? 0}`;
        resolve({ ok: false, reason, code: "helper_failed" });
        return;
      }
      const raw = stdout.trim();
      if (!raw) {
        resolve({ ok: false, reason: "日历组件未返回数据。", code: "empty_response" });
        return;
      }
      try {
        const parsed = JSON.parse(raw) as CalendarResult<T>;
        resolve(parsed);
      } catch (error) {
        log(`[calendar] helper parse error: ${String(error)}`);
        resolve({ ok: false, reason: "日历数据解析失败。", code: "parse_error" });
      }
    });
  });
}

/** Create a system calendar service bound to Electron main process. */
export function createCalendarService(args: { log: Logger }) {
  /** Active renderer listeners for calendar change events. */
  const listeners = new Set<Electron.WebContents>();
  /** Active watch session with helper process. */
  let watchSession: WatchSession | null = null;

  /** Emit a change event to subscribed renderers. */
  const emitChange = () => {
    for (const webContents of listeners) {
      if (webContents.isDestroyed()) continue;
      webContents.send("openloaf:calendar:changed", { source: "system" });
    }
  };

  /** Start helper watch process if not running. */
  const startWatch = () => {
    if (watchSession) return;
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
    });
  };

  /** Stop watch process when no listeners remain. */
  const stopWatchIfIdle = () => {
    if (listeners.size > 0) return;
    if (!watchSession) return;
    try {
      watchSession.process.kill("SIGTERM");
    } catch {
      // 逻辑：退出失败时忽略，避免阻断后续流程。
    }
    watchSession = null;
  };

  /** Request system permission. */
  const requestPermission = async (): Promise<CalendarResult<CalendarPermissionState>> =>
    invokeCalendarHelper<CalendarPermissionState>("permission", {}, args.log);

  /** Fetch available calendars. */
  const listCalendars = async (): Promise<CalendarResult<CalendarItem[]>> =>
    invokeCalendarHelper<CalendarItem[]>("list-calendars", {}, args.log);

  /** Fetch available reminder lists. */
  const listReminders = async (): Promise<CalendarResult<CalendarItem[]>> =>
    invokeCalendarHelper<CalendarItem[]>("list-reminders", {}, args.log);

  /** Fetch events in time range. */
  const getEvents = async (range: CalendarRange): Promise<CalendarResult<CalendarEvent[]>> =>
    invokeCalendarHelper<CalendarEvent[]>("get-events", range, args.log);

  /** Fetch reminders in time range. */
  const getReminders = async (range: CalendarRange): Promise<CalendarResult<CalendarEvent[]>> =>
    invokeCalendarHelper<CalendarEvent[]>("get-reminders", range, args.log);

  /** Create a new system event. */
  const createEvent = async (
    payload: Omit<CalendarEvent, "id">
  ): Promise<CalendarResult<CalendarEvent>> =>
    invokeCalendarHelper<CalendarEvent>("create-event", payload, args.log);

  /** Create a new reminder item. */
  const createReminder = async (
    payload: Omit<CalendarEvent, "id">
  ): Promise<CalendarResult<CalendarEvent>> =>
    invokeCalendarHelper<CalendarEvent>("create-reminder", payload, args.log);

  /** Update an existing system event. */
  const updateEvent = async (payload: CalendarEvent): Promise<CalendarResult<CalendarEvent>> =>
    invokeCalendarHelper<CalendarEvent>("update-event", payload, args.log);

  /** Update an existing reminder item. */
  const updateReminder = async (payload: CalendarEvent): Promise<CalendarResult<CalendarEvent>> =>
    invokeCalendarHelper<CalendarEvent>("update-reminder", payload, args.log);

  /** Delete an existing system event. */
  const deleteEvent = async (payload: { id: string }): Promise<CalendarResult<{ id: string }>> =>
    invokeCalendarHelper<{ id: string }>("delete-event", payload, args.log);

  /** Delete an existing reminder item. */
  const deleteReminder = async (
    payload: { id: string }
  ): Promise<CalendarResult<{ id: string }>> =>
    invokeCalendarHelper<{ id: string }>("delete-reminder", payload, args.log);
  /** Start watching calendar changes for a renderer. */
  const startWatching = (webContents: Electron.WebContents): CalendarResult<{ ok: true }> => {
    if (webContents.isDestroyed()) {
      return { ok: false, reason: "目标窗口已关闭。", code: "webcontents_destroyed" };
    }
    listeners.add(webContents);
    startWatch();
    return { ok: true, data: { ok: true } };
  };

  /** Stop watching calendar changes for a renderer. */
  const stopWatching = (webContents: Electron.WebContents): CalendarResult<{ ok: true }> => {
    listeners.delete(webContents);
    stopWatchIfIdle();
    return { ok: true, data: { ok: true } };
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
  };
}
