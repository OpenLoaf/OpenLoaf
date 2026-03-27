/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { CalendarEvent as UiCalendarEvent } from "@openloaf/ui/calendar/components/types";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import i18next from "i18next";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "@openloaf/ui/calendar/lib/configs/dayjs-config";
import { trpc } from "@/utils/trpc";
import {
  checkCalendarPermission,
  createSystemEvent,
  createSystemReminder,
  deleteSystemEvent,
  deleteSystemReminder,
  requestCalendarPermission,
  setCalendarSyncRange,
  subscribePermissionChanges,
  subscribeSystemCalendarChanges,
  syncSystemCalendars,
  updateSystemEvent,
  updateSystemReminder,
} from "@/lib/calendar/electron-calendar";

type CalendarPermissionState = OpenLoafCalendarPermissionState;
type CalendarRange = OpenLoafCalendarRange;
type CalendarEvent = UiCalendarEvent;
type CalendarKind = "event" | "reminder";
type CalendarSourceFilter = "all" | "local" | "system";

type CalendarSource = {
  id: string;
  provider: string;
  kind: "calendar" | "reminder";
  externalId?: string | null;
  title: string;
  color?: string | null;
  readOnly: boolean;
  isSubscribed: boolean;
};

type CalendarItemRecord = {
  id: string;
  sourceId: string;
  kind: CalendarKind;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  recurrenceRule?: unknown | null;
  completedAt?: string | null;
  externalId?: string | null;
  sourceUpdatedAt?: string | null;
  deletedAt?: string | null;
};

function isEventReadOnly(event: CalendarEvent): boolean {
  const meta = event.data as { readOnly?: boolean; isSubscribed?: boolean } | undefined;
  return meta?.readOnly === true || meta?.isSubscribed === true;
}

type CalendarPageStateParams = {
  toSystemEvent: (event: CalendarEvent) => OpenLoafCalendarEvent;
  getEventKind: (event: CalendarEvent) => CalendarKind;
  sourceFilter?: CalendarSourceFilter;
};

type CalendarPageStateResult = {
  systemEvents: CalendarItemRecord[];
  systemReminders: CalendarItemRecord[];
  calendars: CalendarSource[];
  reminderLists: CalendarSource[];
  selectedCalendarIds: Set<string>;
  selectedReminderListIds: Set<string>;
  permissionState: CalendarPermissionState;
  eventPermission: CalendarPermissionState;
  reminderPermission: CalendarPermissionState;
  errorMessage: string | null;
  isLoading: boolean;
  activeRange: CalendarRange;
  selectedCalendarIdList: string[];
  selectedReminderListIdList: string[];
  handleRequestPermission: () => Promise<OpenLoafCalendarResult<{
    event: OpenLoafCalendarPermissionState;
    reminder: OpenLoafCalendarPermissionState;
  }>>;
  handleDateChange: (date: dayjs.Dayjs) => void;
  handleEventAdd: (event: CalendarEvent) => void;
  handleEventUpdate: (event: CalendarEvent) => void;
  handleEventDelete: (event: CalendarEvent) => void;
  handleToggleCalendar: (calendarId: string) => void;
  handleSelectAllCalendars: () => void;
  handleClearCalendars: () => void;
  setSelectedCalendarIds: Dispatch<SetStateAction<Set<string>>>;
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
  sourceFilter = "all",
}: CalendarPageStateParams): CalendarPageStateResult {
  const queryClient = useQueryClient();
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<Set<string>>(new Set());
  const [selectedReminderListIds, setSelectedReminderListIds] = useState<Set<string>>(
    new Set()
  );
  const [eventPermission, setEventPermission] = useState<CalendarPermissionState>("prompt");
  const [reminderPermission, setReminderPermission] = useState<CalendarPermissionState>("prompt");
  // Derived for backward compat — existing consumers use single `permissionState`.
  const permissionState = eventPermission;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeRange, setActiveRange] = useState<CalendarRange>(() => buildDefaultRange());
  const pendingRangeRef = useRef<CalendarRange | null>(null);
  const rangeUpdateScheduledRef = useRef(false);
  const initialSyncRef = useRef(false);
  const permissionCheckedRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const syncQueuedRef = useRef(false);
  const lastSyncAtRef = useRef(0);

  const sourcesQuery = useQuery(
    trpc.calendar.listSources.queryOptions(
      {},
    ),
  );

  const sources = (sourcesQuery.data ?? []) as CalendarSource[];
  const calendars = useMemo(
    () => sources.filter((source) => source.kind === "calendar"),
    [sources],
  );
  const reminderLists = useMemo(
    () => sources.filter((source) => source.kind === "reminder"),
    [sources],
  );
  const filteredCalendars = useMemo(() => {
    if (sourceFilter === "local") {
      return calendars.filter((source) => source.provider === "local");
    }
    if (sourceFilter === "system") {
      return calendars.filter((source) => source.provider !== "local");
    }
    return calendars;
  }, [calendars, sourceFilter]);
  const filteredReminderLists = useMemo(() => {
    if (sourceFilter === "local") {
      return reminderLists.filter((source) => source.provider === "local");
    }
    if (sourceFilter === "system") {
      return reminderLists.filter((source) => source.provider !== "local");
    }
    return reminderLists;
  }, [reminderLists, sourceFilter]);
  const allowedSourceIds = useMemo(() => {
    const ids = new Set<string>();
    filteredCalendars.forEach((source) => ids.add(source.id));
    filteredReminderLists.forEach((source) => ids.add(source.id));
    return ids;
  }, [filteredCalendars, filteredReminderLists]);

  const selectedCalendarIdList = useMemo(
    () => Array.from(selectedCalendarIds),
    [selectedCalendarIds],
  );
  const selectedReminderListIdList = useMemo(
    () => Array.from(selectedReminderListIds),
    [selectedReminderListIds],
  );

  const activeSourceIds = useMemo(
    () =>
      [...selectedCalendarIdList, ...selectedReminderListIdList].filter((id) =>
        allowedSourceIds.has(id)
      ),
    [allowedSourceIds, selectedCalendarIdList, selectedReminderListIdList],
  );

  const itemsQuery = useQuery(
    trpc.calendar.listItems.queryOptions(
      activeSourceIds.length > 0
        ? { range: activeRange, sourceIds: activeSourceIds }
        : skipToken,
    ),
  );

  const items = (itemsQuery.data ?? []) as CalendarItemRecord[];
  const systemEvents = useMemo(
    () => items.filter((item) => item.kind === "event"),
    [items],
  );
  const systemReminders = useMemo(
    () => items.filter((item) => item.kind === "reminder"),
    [items],
  );

  const isLoading = sourcesQuery.isLoading || itemsQuery.isLoading;

  useEffect(() => {
    if (sourcesQuery.error) {
      setErrorMessage(sourcesQuery.error.message ?? i18next.t('calendar:errLoadSources'));
    }
  }, [sourcesQuery.error]);

  useEffect(() => {
    if (itemsQuery.error) {
      setErrorMessage(itemsQuery.error.message ?? i18next.t('calendar:errLoadItems'));
    }
  }, [itemsQuery.error]);

  useEffect(() => {
    setSelectedCalendarIds((prev) => {
      if (calendars.length === 0) return new Set();
      if (prev.size === 0) {
        return new Set(calendars.map((item) => item.id));
      }
      const next = new Set<string>();
      for (const item of calendars) {
        if (prev.has(item.id)) next.add(item.id);
      }
      if (next.size === 0) {
        return new Set(calendars.map((item) => item.id));
      }
      return next;
    });
  }, [calendars]);

  useEffect(() => {
    setSelectedReminderListIds((prev) => {
      if (reminderLists.length === 0) return new Set();
      if (prev.size === 0) {
        return new Set(reminderLists.map((item) => item.id));
      }
      const next = new Set<string>();
      for (const item of reminderLists) {
        if (prev.has(item.id)) next.add(item.id);
      }
      if (next.size === 0) {
        return new Set(reminderLists.map((item) => item.id));
      }
      return next;
    });
  }, [reminderLists]);

  const triggerSync = useCallback(
    async (reason: "enter" | "permission" | "watch") => {
      if (reason !== "permission" && permissionState !== "granted") return;
      const now = Date.now();
      if (reason === "watch" && now - lastSyncAtRef.current < 1500) {
        // 逻辑：过滤过密的系统变更事件，避免同步风暴。
        return;
      }
      if (syncInFlightRef.current) {
        syncQueuedRef.current = true;
        return;
      }
      syncInFlightRef.current = true;
      try {
        const result = await syncSystemCalendars({ range: activeRange });
        if (!result.ok) return;
        lastSyncAtRef.current = Date.now();
        queryClient.invalidateQueries({
          queryKey: trpc.calendar.listSources.queryOptions({}).queryKey,
        });
        if (activeSourceIds.length > 0) {
          queryClient.invalidateQueries({
            queryKey: trpc.calendar.listItems.queryOptions({
              range: activeRange,
              sourceIds: activeSourceIds,
            }).queryKey,
          });
        }
      } finally {
        syncInFlightRef.current = false;
        if (syncQueuedRef.current) {
          syncQueuedRef.current = false;
          void triggerSync("watch");
        }
      }
    },
    [activeRange, activeSourceIds, permissionState, queryClient]
  );

  const triggerSyncRef = useRef(triggerSync);
  triggerSyncRef.current = triggerSync;

  const handleRequestPermission = useCallback(async (): Promise<
    OpenLoafCalendarResult<{ event: OpenLoafCalendarPermissionState; reminder: OpenLoafCalendarPermissionState }>
  > => {
    const result = await requestCalendarPermission();
    if (!result.ok) {
      setEventPermission("unsupported");
      setReminderPermission("unsupported");
      setErrorMessage(result.reason);
      return result;
    }
    setEventPermission(result.data.event);
    setReminderPermission(result.data.reminder);
    if (result.data.event !== "granted") {
      setErrorMessage(i18next.t('calendar:errUnauthorized'));
      return result;
    }
    setErrorMessage(null);
    await triggerSyncRef.current("permission");
    return result;
  }, []);

  useEffect(() => {
    if (permissionCheckedRef.current) return;
    permissionCheckedRef.current = true;
    void (async () => {
      const result = await checkCalendarPermission();
      if (result.ok) {
        setEventPermission(result.data.event);
        setReminderPermission(result.data.reminder);
      }
    })();
  }, []);

  useEffect(() => {
    // 逻辑：进入日历页面时触发一次同步。
    if (!initialSyncRef.current) {
      initialSyncRef.current = true;
      void triggerSync("enter");
    }
  }, [triggerSync]);

  useEffect(() => {
    void setCalendarSyncRange({ range: activeRange });
  }, [activeRange]);

  useEffect(() => {
    return subscribeSystemCalendarChanges(() => {
      void triggerSync("watch");
    });
  }, [triggerSync]);

  useEffect(() => {
    return subscribePermissionChanges((state) => {
      setEventPermission(state.event);
      setReminderPermission(state.reminder);
    });
  }, []);

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
    });
  }, []);

  const sourceById = useMemo(() => {
    const map = new Map<string, CalendarSource>();
    sources.forEach((source) => map.set(source.id, source));
    return map;
  }, [sources]);

  const createItemMutation = useMutation(
    trpc.calendar.createItem.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.calendar.listItems.queryOptions({
            range: activeRange,
            sourceIds: activeSourceIds,
          }).queryKey,
        });
      },
      onError: (error) => {
        setErrorMessage(error.message || i18next.t('calendar:errAddEvent'));
      },
    }),
  );

  const updateItemMutation = useMutation(
    trpc.calendar.updateItem.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.calendar.listItems.queryOptions({
            range: activeRange,
            sourceIds: activeSourceIds,
          }).queryKey,
        });
      },
      onError: (error) => {
        setErrorMessage(error.message || i18next.t('calendar:errUpdateEvent'));
      },
    }),
  );

  const deleteItemMutation = useMutation(
    trpc.calendar.deleteItem.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.calendar.listItems.queryOptions({
            range: activeRange,
            sourceIds: activeSourceIds,
          }).queryKey,
        });
      },
      onError: (error) => {
        setErrorMessage(error.message || i18next.t('calendar:errDeleteEvent'));
      },
    }),
  );

  const toggleReminderMutation = useMutation(
    trpc.calendar.toggleReminderCompleted.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.calendar.listItems.queryOptions({
            range: activeRange,
            sourceIds: activeSourceIds,
          }).queryKey,
        });
      },
      onError: (error) => {
        setErrorMessage(error.message || i18next.t('calendar:errUpdateReminder'));
      },
    }),
  );

  const buildBasePayload = useCallback(
    (event: CalendarEvent) => {
      const meta = event.data as {
        calendarId?: string;
        recurrence?: string;
        completed?: boolean;
        completedAt?: string | null;
        externalId?: string | null;
        sourceUpdatedAt?: string | null;
      } | undefined;
      const kind = getEventKind(event);
      return {
        sourceId: meta?.calendarId ?? "",
        kind,
        title: event.title,
        description: event.description ?? null,
        location: event.location ?? null,
        startAt: event.start.toISOString(),
        endAt: event.end.toISOString(),
        allDay: event.allDay ?? false,
        recurrenceRule: meta?.recurrence ?? null,
        completedAt: meta?.completedAt ?? (meta?.completed ? new Date().toISOString() : null),
        externalId: meta?.externalId ?? null,
        sourceUpdatedAt: meta?.sourceUpdatedAt ?? null,
      };
    },
    [getEventKind],
  );

  const handleEventAdd = useCallback((event: CalendarEvent) => {
    void (async () => {
      const meta = event.data as { calendarId?: string } | undefined;
      const sourceId = meta?.calendarId ?? "";
      if (!sourceId) return;
      const source = sourceById.get(sourceId);
      if (!source) return;
      if (source.readOnly || source.isSubscribed) return;

      const kind = getEventKind(event);
      if (source.provider !== "local") {
        const externalId = (event.data as { externalId?: string | null } | undefined)
          ?.externalId;
        if (!externalId) {
          setErrorMessage(i18next.t('calendar:errEventIdNotFound'));
          return;
        }
        const systemEvent = toSystemEvent({
          ...event,
          data: { ...(event.data ?? {}), sourceExternalId: source.externalId },
        });
        const { id: _id, ...createPayload } = systemEvent;
        const result =
          kind === "reminder"
            ? await createSystemReminder(createPayload)
            : await createSystemEvent(createPayload);
        if (!result.ok) {
          setErrorMessage(result.reason);
          return;
        }
        const itemPayload = {
          sourceId,
          kind,
          title: result.data.title,
          description: result.data.description ?? null,
          location: result.data.location ?? null,
          startAt: result.data.start,
          endAt: result.data.end,
          allDay: Boolean(result.data.allDay),
          recurrenceRule: result.data.recurrence ?? null,
          completedAt: result.data.completed ? new Date().toISOString() : null,
          externalId: result.data.id,
          sourceUpdatedAt: new Date().toISOString(),
        };
        try {
          await createItemMutation.mutateAsync({ item: itemPayload });
        } catch {
          // 逻辑：错误已由 mutation onError 处理。
        }
        return;
      }

      const payload = buildBasePayload(event);
      if (!payload.sourceId) return;
      try {
        await createItemMutation.mutateAsync({ item: payload });
      } catch {
        // 逻辑：错误已由 mutation onError 处理。
      }
    })();
  }, [buildBasePayload, createItemMutation, getEventKind, sourceById, toSystemEvent]);

  const handleEventUpdate = useCallback((event: CalendarEvent) => {
    if (isEventReadOnly(event)) return;
    void (async () => {
      const meta = event.data as { calendarId?: string } | undefined;
      const sourceId = meta?.calendarId ?? "";
      if (!sourceId) return;
      const source = sourceById.get(sourceId);
      if (!source) return;

      const kind = getEventKind(event);
      if (source.provider !== "local") {
        const systemEvent = toSystemEvent({
          ...event,
          data: { ...(event.data ?? {}), sourceExternalId: source.externalId },
        });
        const result =
          kind === "reminder"
            ? await updateSystemReminder(systemEvent)
            : await updateSystemEvent(systemEvent);
        if (!result.ok) {
          setErrorMessage(result.reason);
          return;
        }
        const itemPayload = {
          id: String(event.id),
          sourceId,
          kind,
          title: result.data.title,
          description: result.data.description ?? null,
          location: result.data.location ?? null,
          startAt: result.data.start,
          endAt: result.data.end,
          allDay: Boolean(result.data.allDay),
          recurrenceRule: result.data.recurrence ?? null,
          completedAt: result.data.completed ? new Date().toISOString() : null,
          externalId: result.data.id,
          sourceUpdatedAt: new Date().toISOString(),
          deletedAt: null,
        };
        try {
          await updateItemMutation.mutateAsync({ item: itemPayload });
        } catch {
          // 逻辑：错误已由 mutation onError 处理。
        }
        return;
      }

      const payload = buildBasePayload(event);
      try {
        await updateItemMutation.mutateAsync({
          item: { ...payload, id: String(event.id) },
        });
      } catch {
        // 逻辑：错误已由 mutation onError 处理。
      }
    })();
  }, [buildBasePayload, getEventKind, sourceById, toSystemEvent, updateItemMutation]);

  const handleEventDelete = useCallback((event: CalendarEvent) => {
    if (isEventReadOnly(event)) return;
    void (async () => {
      const meta = event.data as { calendarId?: string; externalId?: string | null } | undefined;
      const sourceId = meta?.calendarId ?? "";
      if (!sourceId) return;
      const source = sourceById.get(sourceId);
      if (!source) return;
      if (source.provider !== "local" && meta?.externalId) {
        const result =
          getEventKind(event) === "reminder"
            ? await deleteSystemReminder({ id: meta.externalId })
            : await deleteSystemEvent({ id: meta.externalId });
        if (!result.ok) {
          setErrorMessage(result.reason);
          return;
        }
      } else if (source.provider !== "local") {
        setErrorMessage(i18next.t('calendar:errEventIdNotFound'));
        return;
      }
      try {
        await deleteItemMutation.mutateAsync({ id: String(event.id) });
      } catch {
        // 逻辑：错误已由 mutation onError 处理。
      }
    })();
  }, [deleteItemMutation, getEventKind, sourceById]);

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

  const toggleReminderCompleted = useCallback(async (event: CalendarEvent) => {
    const meta = event.data as {
      calendarId?: string;
      externalId?: string | null;
      completed?: boolean;
    } | undefined;
    const currentCompleted = meta?.completed === true;
    const sourceId = meta?.calendarId ?? "";
    const source = sourceId ? sourceById.get(sourceId) : undefined;
    if (source && source.provider !== "local" && meta?.externalId) {
      const systemEvent = toSystemEvent({
        ...event,
        data: {
          ...(event.data ?? {}),
          sourceExternalId: source.externalId,
          completed: !currentCompleted,
        },
      });
      const result = await updateSystemReminder(systemEvent);
      if (!result.ok) {
        setErrorMessage(result.reason);
        return;
      }
    } else if (source && source.provider !== "local") {
      setErrorMessage(i18next.t('calendar:errEventIdNotFound'));
      return;
    }
    try {
      await toggleReminderMutation.mutateAsync({
        id: String(event.id),
        completed: !currentCompleted,
      });
    } catch {
      // 逻辑：错误已由 mutation onError 处理。
      return;
    }
    playReminderSound();
  }, [sourceById, toSystemEvent, toggleReminderMutation]);

  return {
    systemEvents,
    systemReminders,
    calendars,
    reminderLists,
    selectedCalendarIds,
    selectedReminderListIds,
    permissionState,
    eventPermission,
    reminderPermission,
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
    setSelectedCalendarIds,
    setSelectedReminderListIds,
    toggleReminderCompleted,
  };
}
