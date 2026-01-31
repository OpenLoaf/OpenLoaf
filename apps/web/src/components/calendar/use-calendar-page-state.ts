import type { IlamyCalendarProps } from "@tenas-ai/ui/calendar";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "@tenas-ai/ui/calendar/lib/configs/dayjs-config";
import {
  createSystemEvent,
  createSystemReminder,
  deleteSystemEvent,
  deleteSystemReminder,
  getSystemEvents,
  getSystemReminderLists,
  getSystemReminders,
  getSystemCalendars,
  requestCalendarPermission,
  subscribeSystemCalendarChanges,
  updateSystemEvent,
  updateSystemReminder,
} from "@/lib/calendar/electron-calendar";

type CalendarPermissionState = TenasCalendarPermissionState;
type CalendarRange = TenasCalendarRange;
type SystemCalendarEvent = TenasCalendarEvent;
type SystemCalendarItem = TenasCalendarItem;
type CalendarEvent = NonNullable<IlamyCalendarProps["events"]>[number];
type CalendarKind = "event" | "reminder";

type CalendarPageStateParams = {
  toSystemEvent: (event: CalendarEvent) => SystemCalendarEvent;
  getEventKind: (event: CalendarEvent) => CalendarKind;
};

type CalendarPageStateResult = {
  systemEvents: SystemCalendarEvent[];
  systemReminders: SystemCalendarEvent[];
  calendars: SystemCalendarItem[];
  reminderLists: SystemCalendarItem[];
  selectedCalendarIds: Set<string>;
  selectedReminderListIds: Set<string>;
  permissionState: CalendarPermissionState;
  errorMessage: string | null;
  isLoading: boolean;
  activeRange: CalendarRange;
  selectedCalendarIdList: string[];
  selectedReminderListIdList: string[];
  handleRequestPermission: () => Promise<void>;
  handleDateChange: (date: dayjs.Dayjs) => void;
  handleEventAdd: (event: CalendarEvent) => void;
  handleEventUpdate: (event: CalendarEvent) => void;
  handleEventDelete: (event: CalendarEvent) => void;
  handleToggleCalendar: (calendarId: string) => void;
  handleSelectAllCalendars: () => void;
  handleClearCalendars: () => void;
  setSelectedReminderListIds: Dispatch<SetStateAction<Set<string>>>;
  toggleReminderCompleted: (event: CalendarEvent) => Promise<void>;
};

function buildDefaultRange(): CalendarRange {
  const start = dayjs().startOf("month").startOf("week");
  const end = dayjs().endOf("month").endOf("week");
  return { start: start.toISOString(), end: end.toISOString() };
}

function buildRangeFromDate(baseDate: dayjs.Dayjs): CalendarRange {
  const start = baseDate.startOf("month").startOf("week");
  const end = baseDate.endOf("month").endOf("week");
  return { start: start.toISOString(), end: end.toISOString() };
}

function playReminderSound() {
  if (typeof window === "undefined") return;
  try {
    const audioContext = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 820;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.08);
    oscillator.onended = () => {
      audioContext.close().catch(() => null);
    };
  } catch {
    // 逻辑：提示音失败时忽略，避免打断交互。
  }
}

export function useCalendarPageState({
  toSystemEvent,
  getEventKind,
}: CalendarPageStateParams): CalendarPageStateResult {
  const [systemEvents, setSystemEvents] = useState<SystemCalendarEvent[]>([]);
  const [systemReminders, setSystemReminders] = useState<SystemCalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<SystemCalendarItem[]>([]);
  const [reminderLists, setReminderLists] = useState<SystemCalendarItem[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<Set<string>>(new Set());
  const [selectedReminderListIds, setSelectedReminderListIds] = useState<Set<string>>(new Set());
  const [permissionState, setPermissionState] = useState<CalendarPermissionState>("prompt");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeRange, setActiveRange] = useState<CalendarRange>(() => buildDefaultRange());
  const pendingRangeRef = useRef<CalendarRange | null>(null);
  const rangeUpdateScheduledRef = useRef(false);

  const selectedCalendarIdList = useMemo(() => Array.from(selectedCalendarIds), [selectedCalendarIds]);
  const selectedReminderListIdList = useMemo(
    () => Array.from(selectedReminderListIds),
    [selectedReminderListIds]
  );

  const refreshEvents = useCallback(async (range: CalendarRange) => {
    setIsLoading(true);
    const result = await getSystemEvents(range);
    if (result.ok) {
      setSystemEvents(result.data);
      setErrorMessage(null);
    } else {
      setErrorMessage(result.reason);
    }
    setIsLoading(false);
  }, []);

  const refreshCalendars = useCallback(async () => {
    const result = await getSystemCalendars();
    if (result.ok) {
      setCalendars(result.data);
      setSelectedCalendarIds((prev) => {
        if (prev.size === 0) {
          return new Set(result.data.map((item) => item.id));
        }
        const next = new Set<string>();
        for (const item of result.data) {
          if (prev.has(item.id)) next.add(item.id);
        }
        if (next.size === 0 && result.data.length > 0) {
          return new Set(result.data.map((item) => item.id));
        }
        return next;
      });
      setErrorMessage(null);
    } else {
      setErrorMessage(result.reason);
    }
  }, []);

  const refreshReminderLists = useCallback(async () => {
    const result = await getSystemReminderLists();
    if (result.ok) {
      setReminderLists(result.data);
      setSelectedReminderListIds((prev) => {
        if (prev.size === 0) {
          return new Set(result.data.map((item) => item.id));
        }
        const next = new Set<string>();
        for (const item of result.data) {
          if (prev.has(item.id)) next.add(item.id);
        }
        if (next.size === 0 && result.data.length > 0) {
          return new Set(result.data.map((item) => item.id));
        }
        return next;
      });
      setErrorMessage(null);
    } else if (result.code !== "unsupported") {
      setErrorMessage(result.reason);
    }
  }, []);

  const refreshReminders = useCallback(async (range: CalendarRange) => {
    const result = await getSystemReminders(range);
    if (result.ok) {
      setSystemReminders(result.data);
      setErrorMessage(null);
    } else if (result.code !== "unsupported") {
      setErrorMessage(result.reason);
    }
  }, []);

  const handleRequestPermission = useCallback(async () => {
    setIsLoading(true);
    const result = await requestCalendarPermission();
    if (!result.ok) {
      setPermissionState("unsupported");
      setErrorMessage(result.reason);
      setIsLoading(false);
      return;
    }
    setPermissionState(result.data);
    if (result.data === "granted") {
      await refreshCalendars();
      await refreshReminderLists();
      await refreshEvents(activeRange);
      await refreshReminders(activeRange);
    } else {
      setErrorMessage("未授权系统日历访问权限。");
    }
    setIsLoading(false);
  }, [activeRange, refreshCalendars, refreshEvents, refreshReminderLists, refreshReminders]);

  useEffect(() => {
    void handleRequestPermission();
  }, [handleRequestPermission]);

  useEffect(() => {
    if (permissionState !== "granted") return;
    return subscribeSystemCalendarChanges(() => {
      void refreshCalendars();
      void refreshReminderLists();
      void refreshEvents(activeRange);
      void refreshReminders(activeRange);
    });
  }, [activeRange, permissionState, refreshCalendars, refreshEvents, refreshReminderLists, refreshReminders]);

  const handleDateChange = useCallback((date: dayjs.Dayjs) => {
    const range = buildRangeFromDate(date);
    pendingRangeRef.current = range;
    if (rangeUpdateScheduledRef.current) return;
    rangeUpdateScheduledRef.current = true;
    queueMicrotask(() => {
      rangeUpdateScheduledRef.current = false;
      const nextRange = pendingRangeRef.current;
      if (!nextRange) return;
      setActiveRange(nextRange);
      if (permissionState === "granted") {
        void refreshEvents(nextRange);
        void refreshReminders(nextRange);
      }
    });
  }, [permissionState, refreshEvents, refreshReminders]);

  const handleEventAdd = useCallback((event: CalendarEvent) => {
    if (permissionState !== "granted") return;
    void (async () => {
      const kind = getEventKind(event);
      const payload = toSystemEvent(event);
      const fallbackCalendarId =
        kind === "reminder"
          ? selectedReminderListIdList[0] ?? reminderLists[0]?.id
          : selectedCalendarIdList[0] ?? calendars[0]?.id;
      const result =
        kind === "reminder"
          ? await createSystemReminder({
              title: payload.title,
              start: payload.start,
              end: payload.end,
              allDay: payload.allDay,
              description: payload.description,
              location: payload.location,
              color: payload.color,
              calendarId: payload.calendarId ?? fallbackCalendarId,
              recurrence: payload.recurrence,
            })
          : await createSystemEvent({
              title: payload.title,
              start: payload.start,
              end: payload.end,
              allDay: payload.allDay,
              description: payload.description,
              location: payload.location,
              color: payload.color,
              calendarId: payload.calendarId ?? fallbackCalendarId,
              recurrence: payload.recurrence,
            });
      if (result.ok) {
        if (kind === "reminder") {
          setSystemReminders((prev) => [...prev, result.data]);
        } else {
          setSystemEvents((prev) => [...prev, result.data]);
        }
      } else {
        setErrorMessage(result.reason);
        // 逻辑：写入失败时刷新回系统状态，避免 UI 与系统不一致。
        await refreshEvents(activeRange);
        await refreshReminders(activeRange);
      }
    })();
  }, [activeRange, calendars, getEventKind, permissionState, refreshEvents, refreshReminders, reminderLists, selectedCalendarIdList, selectedReminderListIdList, toSystemEvent]);

  const toggleReminderCompleted = useCallback(async (event: CalendarEvent) => {
    const payload = toSystemEvent(event);
    const currentCompleted = (event.data as { completed?: boolean } | undefined)?.completed === true;
    const result = await updateSystemReminder({ ...payload, completed: !currentCompleted });
    if (result.ok) {
      setSystemReminders((prev) =>
        prev.map((item) => (item.id === result.data.id ? result.data : item))
      );
      playReminderSound();
    } else {
      setErrorMessage(result.reason);
      await refreshReminders(activeRange);
    }
  }, [activeRange, refreshReminders, toSystemEvent]);

  const handleEventUpdate = useCallback((event: CalendarEvent) => {
    if (permissionState !== "granted") return;
    void (async () => {
      const kind = getEventKind(event);
      if (kind === "reminder") {
        // 逻辑：输出拖拽更新时的日期信息，排查提醒事项日期回退。
        console.info("[calendar] update-reminder", {
          id: event.id,
          start: event.start.toISOString(),
          end: event.end.toISOString(),
          allDay: event.allDay,
          calendarId: (event.data as { calendarId?: string } | undefined)?.calendarId,
        });
      }
      const result =
        kind === "reminder"
          ? await updateSystemReminder(toSystemEvent(event))
          : await updateSystemEvent(toSystemEvent(event));
      if (result.ok) {
        if (kind === "reminder") {
          setSystemReminders((prev) => {
            const nextEvents = prev.some((item) => item.id === event.id)
              ? prev.map((item) => (item.id === event.id ? result.data : item))
              : [...prev, result.data];
            return nextEvents;
          });
        } else {
          setSystemEvents((prev) => {
            const nextEvents = prev.some((item) => item.id === event.id)
              ? prev.map((item) => (item.id === event.id ? result.data : item))
              : [...prev, result.data];
            return nextEvents;
          });
        }
      } else {
        setErrorMessage(result.reason);
        // 逻辑：更新失败时刷新回系统状态。
        await refreshEvents(activeRange);
        await refreshReminders(activeRange);
      }
    })();
  }, [activeRange, getEventKind, permissionState, refreshEvents, refreshReminders, toSystemEvent]);

  const handleEventDelete = useCallback((event: CalendarEvent) => {
    if (permissionState !== "granted") return;
    void (async () => {
      const kind = getEventKind(event);
      const result =
        kind === "reminder"
          ? await deleteSystemReminder({ id: String(event.id) })
          : await deleteSystemEvent({ id: String(event.id) });
      if (result.ok) {
        if (kind === "reminder") {
          setSystemReminders((prev) => prev.filter((item) => item.id !== event.id));
        } else {
          setSystemEvents((prev) => prev.filter((item) => item.id !== event.id));
        }
      } else {
        setErrorMessage(result.reason);
        // 逻辑：删除失败时刷新回系统状态。
        await refreshEvents(activeRange);
        await refreshReminders(activeRange);
      }
    })();
  }, [activeRange, getEventKind, permissionState, refreshEvents, refreshReminders]);

  const handleToggleCalendar = useCallback((calendarId: string) => {
    setSelectedCalendarIds((prev) => {
      const next = new Set(prev);
      if (next.has(calendarId)) {
        next.delete(calendarId);
      } else {
        next.add(calendarId);
      }
      return next;
    });
  }, []);

  const handleSelectAllCalendars = useCallback(() => {
    setSelectedCalendarIds(new Set(calendars.map((item) => item.id)));
  }, [calendars]);

  const handleClearCalendars = useCallback(() => {
    setSelectedCalendarIds(new Set());
  }, []);

  return {
    systemEvents,
    systemReminders,
    calendars,
    reminderLists,
    selectedCalendarIds,
    selectedReminderListIds,
    permissionState,
    errorMessage,
    isLoading,
    activeRange,
    selectedCalendarIdList,
    selectedReminderListIdList,
    handleRequestPermission,
    handleDateChange,
    handleEventAdd,
    handleEventUpdate,
    handleEventDelete,
    handleToggleCalendar,
    handleSelectAllCalendars,
    handleClearCalendars,
    setSelectedReminderListIds,
    toggleReminderCompleted,
  };
}
