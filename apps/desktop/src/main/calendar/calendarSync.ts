import type { Logger } from "../logging/startupLogger";

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

type CalendarFailure = { ok: false; reason: string; code?: string };

/** Narrow calendar results to failure payloads. */
function isCalendarFailure<T>(result: CalendarResult<T>): result is CalendarFailure {
  return result.ok === false;
}

type CalendarService = {
  listCalendars: () => Promise<CalendarResult<CalendarItem[]>>;
  listReminders: () => Promise<CalendarResult<CalendarItem[]>>;
  getEvents: (range: CalendarRange) => Promise<CalendarResult<CalendarEvent[]>>;
  getReminders: (range: CalendarRange) => Promise<CalendarResult<CalendarEvent[]>>;
};

type SyncRange = { start: string; end: string };
type SyncContext = { workspaceId: string; viewRange?: SyncRange };

type SyncSourcePayload = {
  kind: "calendar" | "reminder";
  externalId?: string | null;
  title: string;
  color?: string | null;
  readOnly?: boolean;
  isSubscribed?: boolean;
};

type SyncItemPayload = {
  externalId?: string | null;
  calendarId?: string | null;
  kind: "event" | "reminder";
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  recurrenceRule?: unknown | null;
  completed?: boolean;
  sourceUpdatedAt?: string | null;
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function resolveSyncRange(viewRange?: SyncRange) {
  const now = new Date();
  const defaultStart = startOfDay(addDays(now, -90));
  const defaultEnd = endOfDay(addDays(now, 365));
  const viewStart = viewRange?.start ? new Date(viewRange.start) : null;
  const viewEnd = viewRange?.end ? new Date(viewRange.end) : null;
  const start = viewStart && viewStart < defaultStart ? viewStart : defaultStart;
  const end = viewEnd && viewEnd > defaultEnd ? viewEnd : defaultEnd;
  return { start: start.toISOString(), end: end.toISOString() };
}

async function postTrpc<T>(input: {
  serverUrl: string;
  path: string;
  payload: unknown;
}): Promise<T> {
  const res = await fetch(`${input.serverUrl}/trpc/${input.path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: input.payload }),
  });
  const data = (await res.json()) as {
    error?: { message?: string };
    result?: { data?: { json?: T } };
  };
  if (data.error) {
    throw new Error(data.error.message ?? "tRPC request failed");
  }
  return (data.result?.data?.json ?? null) as T;
}

function resolveProvider() {
  if (process.platform === "darwin") return "macos";
  if (process.platform === "win32") return "windows";
  return null;
}

export function createCalendarSync(args: { log: Logger; calendarService: CalendarService }) {
  let lastContext: SyncContext | null = null;
  let timer: NodeJS.Timeout | null = null;
  let syncing = false;

  const setSyncContext = (context: SyncContext) => {
    lastContext = context;
  };

  const syncNow = async (override?: SyncContext) => {
    if (syncing) return;
    const context = override ?? lastContext;
    if (!context?.workspaceId) return;
    const provider = resolveProvider();
    if (!provider) return;
    const serverUrl = process.env.TENAS_SERVER_URL ?? "";
    if (!serverUrl) {
      args.log("[calendar-sync] missing server url");
      return;
    }

    syncing = true;
    try {
      const range = resolveSyncRange(context.viewRange);
      const [calendarResult, reminderResult, eventsResult, remindersResult] =
        await Promise.all(
          [
            args.calendarService.listCalendars(),
            args.calendarService.listReminders(),
            args.calendarService.getEvents(range),
            args.calendarService.getReminders(range),
          ] as const,
        );

      if (isCalendarFailure(calendarResult)) {
        args.log(`[calendar-sync] listCalendars failed: ${calendarResult.reason}`);
        return;
      }
      if (isCalendarFailure(eventsResult)) {
        args.log(`[calendar-sync] getEvents failed: ${eventsResult.reason}`);
        return;
      }

      const sources: SyncSourcePayload[] = [];
      for (const item of calendarResult.data) {
        sources.push({
          kind: "calendar",
          externalId: item.id,
          title: item.title,
          color: item.color ?? null,
          readOnly: item.readOnly,
          isSubscribed: item.isSubscribed,
        });
      }
      if (reminderResult.ok) {
        for (const item of reminderResult.data) {
          sources.push({
            kind: "reminder",
            externalId: item.id,
            title: item.title,
            color: item.color ?? null,
            readOnly: item.readOnly,
            isSubscribed: item.isSubscribed,
          });
        }
      }

      const items: SyncItemPayload[] = [];
      for (const event of eventsResult.data) {
        items.push({
          externalId: event.id,
          calendarId: event.calendarId ?? null,
          kind: "event",
          title: event.title,
          description: event.description ?? null,
          location: event.location ?? null,
          startAt: event.start,
          endAt: event.end,
          allDay: Boolean(event.allDay),
          recurrenceRule: event.recurrence ?? null,
          completed: Boolean(event.completed),
        });
      }
      if (remindersResult.ok) {
        for (const event of remindersResult.data) {
          items.push({
            externalId: event.id,
            calendarId: event.calendarId ?? null,
            kind: "reminder",
            title: event.title,
            description: event.description ?? null,
            location: event.location ?? null,
            startAt: event.start,
            endAt: event.end,
            allDay: Boolean(event.allDay),
            recurrenceRule: event.recurrence ?? null,
            completed: Boolean(event.completed),
          });
        }
      }

      await postTrpc({
        serverUrl,
        path: "calendar.syncFromSystem",
        payload: {
          workspaceId: context.workspaceId,
          provider,
          range,
          sources,
          items,
        },
      });
    } catch (error) {
      args.log(`[calendar-sync] failed: ${String(error)}`);
    } finally {
      syncing = false;
    }
  };

  const startTimer = () => {
    if (timer) return;
    // 逻辑：每分钟触发一次系统日历同步。
    timer = setInterval(() => {
      void syncNow();
    }, 60_000);
  };

  const stopTimer = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  };

  return {
    setSyncContext,
    syncNow,
    startTimer,
    stopTimer,
  };
}
