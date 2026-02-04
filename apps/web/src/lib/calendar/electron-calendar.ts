import { isElectronEnv } from "@/utils/is-electron-env";

type CalendarPermissionState = TenasCalendarPermissionState;
type CalendarRange = TenasCalendarRange;
type CalendarItem = TenasCalendarItem;
type CalendarEvent = TenasCalendarEvent;
type CalendarResult<T> = TenasCalendarResult<T>;

/** Resolve calendar API from Electron preload. */
function getCalendarApi() {
  if (typeof window === "undefined") return null;
  return window.tenasElectron?.calendar ?? null;
}

/** Request system calendar permission. */
export async function requestCalendarPermission(): Promise<CalendarResult<CalendarPermissionState>> {
  if (!isElectronEnv() || !getCalendarApi()?.requestPermission) {
    return { ok: false, reason: "当前仅支持桌面端日历。", code: "unsupported" };
  }
  return await getCalendarApi()!.requestPermission();
}

/** List system calendars. */
export async function getSystemCalendars(): Promise<CalendarResult<CalendarItem[]>> {
  if (!isElectronEnv() || !getCalendarApi()?.getCalendars) {
    return { ok: false, reason: "当前仅支持桌面端日历。", code: "unsupported" };
  }
  return await getCalendarApi()!.getCalendars();
}

/** List system reminder lists. */
export async function getSystemReminderLists(): Promise<CalendarResult<CalendarItem[]>> {
  if (!isElectronEnv() || !getCalendarApi()?.getReminderLists) {
    return { ok: false, reason: "当前仅支持桌面端提醒事项。", code: "unsupported" };
  }
  return await getCalendarApi()!.getReminderLists!();
}

/** Fetch events within a time range. */
export async function getSystemEvents(
  range: CalendarRange
): Promise<CalendarResult<CalendarEvent[]>> {
  if (!isElectronEnv() || !getCalendarApi()?.getEvents) {
    return { ok: false, reason: "当前仅支持桌面端日历。", code: "unsupported" };
  }
  return await getCalendarApi()!.getEvents(range);
}

/** Fetch reminders within a time range. */
export async function getSystemReminders(
  range: CalendarRange
): Promise<CalendarResult<CalendarEvent[]>> {
  if (!isElectronEnv() || !getCalendarApi()?.getReminders) {
    return { ok: false, reason: "当前仅支持桌面端提醒事项。", code: "unsupported" };
  }
  return await getCalendarApi()!.getReminders!(range);
}

/** Create a new system calendar event. */
export async function createSystemEvent(
  payload: Omit<CalendarEvent, "id">
): Promise<CalendarResult<CalendarEvent>> {
  if (!isElectronEnv() || !getCalendarApi()?.createEvent) {
    return { ok: false, reason: "当前仅支持桌面端日历。", code: "unsupported" };
  }
  return await getCalendarApi()!.createEvent(payload);
}

/** Create a new reminder item. */
export async function createSystemReminder(
  payload: Omit<CalendarEvent, "id">
): Promise<CalendarResult<CalendarEvent>> {
  if (!isElectronEnv() || !getCalendarApi()?.createReminder) {
    return { ok: false, reason: "当前仅支持桌面端提醒事项。", code: "unsupported" };
  }
  return await getCalendarApi()!.createReminder!(payload);
}

/** Update a system calendar event. */
export async function updateSystemEvent(
  payload: CalendarEvent
): Promise<CalendarResult<CalendarEvent>> {
  if (!isElectronEnv() || !getCalendarApi()?.updateEvent) {
    return { ok: false, reason: "当前仅支持桌面端日历。", code: "unsupported" };
  }
  return await getCalendarApi()!.updateEvent(payload);
}

/** Update a reminder item. */
export async function updateSystemReminder(
  payload: CalendarEvent
): Promise<CalendarResult<CalendarEvent>> {
  if (!isElectronEnv() || !getCalendarApi()?.updateReminder) {
    return { ok: false, reason: "当前仅支持桌面端提醒事项。", code: "unsupported" };
  }
  return await getCalendarApi()!.updateReminder!(payload);
}

/** Delete a system calendar event. */
export async function deleteSystemEvent(
  payload: { id: string }
): Promise<CalendarResult<{ id: string }>> {
  if (!isElectronEnv() || !getCalendarApi()?.deleteEvent) {
    return { ok: false, reason: "当前仅支持桌面端日历。", code: "unsupported" };
  }
  return await getCalendarApi()!.deleteEvent(payload);
}

/** Delete a reminder item. */
export async function deleteSystemReminder(
  payload: { id: string }
): Promise<CalendarResult<{ id: string }>> {
  if (!isElectronEnv() || !getCalendarApi()?.deleteReminder) {
    return { ok: false, reason: "当前仅支持桌面端提醒事项。", code: "unsupported" };
  }
  return await getCalendarApi()!.deleteReminder!(payload);
}

/** Subscribe to system calendar changes. */
export function subscribeSystemCalendarChanges(
  handler: (detail: { source: "system" }) => void
): () => void {
  if (!isElectronEnv() || !getCalendarApi()?.subscribeChanges) {
    return () => null;
  }
  return getCalendarApi()!.subscribeChanges(handler);
}

/** Update system calendar sync range. */
export async function setCalendarSyncRange(
  payload: { workspaceId: string; range?: CalendarRange }
): Promise<{ ok: true } | { ok: false; reason?: string }> {
  if (!isElectronEnv() || !getCalendarApi()?.setSyncRange) {
    return { ok: false, reason: "当前仅支持桌面端日历。" };
  }
  return await getCalendarApi()!.setSyncRange!(payload);
}

/** Trigger immediate system calendar sync. */
export async function syncSystemCalendars(
  payload: { workspaceId: string; range?: CalendarRange }
): Promise<{ ok: true } | { ok: false; reason?: string }> {
  if (!isElectronEnv() || !getCalendarApi()?.syncNow) {
    return { ok: false, reason: "当前仅支持桌面端日历。" };
  }
  return await getCalendarApi()!.syncNow!(payload);
}
