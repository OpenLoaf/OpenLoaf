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

import type { IlamyCalendarProps } from "@openloaf/ui/calendar";
import { IlamyCalendar } from "@openloaf/ui/calendar";
import styles from "./Calendar.module.css";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import dayjs from "@openloaf/ui/calendar/lib/configs/dayjs-config";
import { Button } from "@openloaf/ui/button";
import { Download } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@openloaf/ui/calendar/components/ui/dialog";
import { EventForm, type EventFormProps } from "@openloaf/ui/calendar/components/event-form/event-form";
import type { CalendarEvent as UiCalendarEvent } from "@openloaf/ui/calendar/components/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/calendar/components/ui/select";
import { Switch } from "@openloaf/ui/switch";
import "dayjs/locale/zh-cn";
import "dayjs/locale/en";
import "dayjs/locale/ja";
import "dayjs/locale/ko";
import "dayjs/locale/fr";
import "dayjs/locale/de";
import "dayjs/locale/es";
import { CALENDAR_LOCALE_BY_LANGUAGE, CALENDAR_TRANSLATIONS, type LanguageId } from "./calendar-i18n";
import { CalendarFilterPanel } from "./calendar-filter-panel";
import { useCalendarPageState } from "./use-calendar-page-state";
import { useCalendarTasks } from "./use-calendar-tasks";
import { useProjects } from "@/hooks/use-projects";
import { buildProjectHierarchyIndex } from "@/lib/project-tree";
import { toast } from "sonner";
import { isElectronEnv } from "@/utils/is-electron-env";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@openloaf/ui/alert-dialog";

type SystemCalendarEvent = OpenLoafCalendarEvent;
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
type CalendarEvent = UiCalendarEvent;

/** Convert system event payload into calendar UI event. */
function toCalendarEvent(
  event: CalendarItemRecord,
  calendarColorMap: Map<string, string>,
  calendarAccessMap: Map<string, { readOnly: boolean; isSubscribed: boolean }>,
  sourceMap: Map<string, CalendarSource>,
  kind: CalendarKind
): CalendarEvent {
  const backgroundColor = calendarColorMap.get(event.sourceId);
  const textColor = backgroundColor ? getReadableTextColor(backgroundColor) : undefined;
  const access = calendarAccessMap.get(event.sourceId);
  const source = sourceMap.get(event.sourceId);
  const start = dayjs(event.startAt);
  let end = dayjs(event.endAt);
  let isAllDay = event.allDay;
  if (kind === "reminder") {
    const endInvalid = end.isSame(start) || end.isBefore(start);
    if (endInvalid) {
      // 逻辑：提醒事项没有有效结束时间时按当天处理，避免被渲染成跨天块。
      end = start.endOf("day");
      isAllDay = true;
    }
  }
  return {
    id: event.id,
    title: event.title,
    start,
    end,
    allDay: isAllDay,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    color: textColor,
    backgroundColor,
    data: {
      calendarId: event.sourceId,
      recurrence:
        typeof event.recurrenceRule === "string" ? event.recurrenceRule : undefined,
      source: "db",
      kind,
      completed: Boolean(event.completedAt),
      completedAt: event.completedAt ?? null,
      externalId: event.externalId ?? undefined,
      sourceExternalId: source?.externalId ?? undefined,
      provider: source?.provider ?? undefined,
      readOnly: access?.readOnly ?? false,
      isSubscribed: access?.isSubscribed ?? false,
    },
  };
}

/** Convert calendar UI event into system event payload. */
function toSystemEvent(event: CalendarEvent): SystemCalendarEvent {
  const meta = event.data as {
    sourceExternalId?: string;
    externalId?: string;
    recurrence?: string;
    completed?: boolean;
    kind?: CalendarKind;
  } | undefined;
  const calendarId = meta?.sourceExternalId?.trim();
  const externalId = meta?.externalId?.trim();
  const recurrence = meta?.recurrence?.trim();
  const isReminder = meta?.kind === "reminder";
  let start = event.start;
  let end = event.end;
  if (isReminder && event.allDay) {
    // 逻辑：提醒事项的全天日期用本地日期字符串作为锚点，避免时区换算导致的日期回退。
    const localStart = dayjs(event.start).local();
    const dateLabel = localStart.format("YYYY-MM-DD");
    const anchor = dayjs(`${dateLabel}T12:00:00`);
    start = anchor;
    end = anchor.add(1, "day");
  }
  return {
    id: externalId || String(event.id),
    title: event.title,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: event.allDay,
    description: event.description,
    location: event.location,
    color: undefined,
    calendarId: calendarId || undefined,
    recurrence: recurrence || undefined,
    completed: meta?.completed,
  };
}

/** Resolve event kind from UI payload. */
function getEventKind(event: CalendarEvent): CalendarKind {
  const meta = event.data as { kind?: CalendarKind } | undefined;
  return meta?.kind === "reminder" ? "reminder" : "event";
}

/** Pick a readable text color for a given background hex color. */
function getReadableTextColor(background: string): string {
  const hex = background.replace("#", "");
  if (hex.length !== 6) return "#111827";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#ffffff";
}

/** Build calendar color map with fallback palette for missing colors. */
function buildCalendarColorMap(calendars: CalendarSource[]): Map<string, string> {
  const palette = ["#60A5FA", "#34D399", "#FBBF24", "#F87171", "#A78BFA", "#F472B6"];
  const map = new Map<string, string>();
  calendars.forEach((item, index) => {
    map.set(item.id, item.color ?? palette[index % palette.length]);
  });
  return map;
}

/** Build calendar access map to mark read-only and subscribed calendars. */
function buildCalendarAccessMap(
  calendars: CalendarSource[]
): Map<string, { readOnly: boolean; isSubscribed: boolean }> {
  const map = new Map<string, { readOnly: boolean; isSubscribed: boolean }>();
  calendars.forEach((item) => {
    const isSubscribed = item.isSubscribed === true;
    const readOnly = item.readOnly === true || isSubscribed;
    map.set(item.id, { readOnly, isSubscribed });
  });
  return map;
}

/** Render calendar event form with system calendar selection. */
function SystemEventFormDialog({
  props,
  calendars,
  reminderLists,
  uiLanguage,
  translations,
  defaultCalendarId,
}: {
  props: EventFormProps;
  calendars: CalendarSource[];
  reminderLists: CalendarSource[];
  uiLanguage: LanguageId;
  translations: IlamyCalendarProps["translations"];
  defaultCalendarId: string;
}) {
  const { t } = useTranslation('calendar');
  const initialKind = (props.selectedEvent?.data as { kind?: CalendarKind } | undefined)?.kind;
  const [eventKind, setEventKind] = useState<CalendarKind>(initialKind ?? "event");
  const [reminderTimeEnabled, setReminderTimeEnabled] = useState(
    props.selectedEvent?.allDay === false && initialKind === "reminder"
  );
  const [calendarId, setCalendarId] = useState(defaultCalendarId);

  useEffect(() => {
    setCalendarId(defaultCalendarId);
  }, [defaultCalendarId]);

  useEffect(() => {
    if (initialKind) {
      setEventKind(initialKind);
    }
  }, [initialKind]);

  useEffect(() => {
    if (eventKind !== "reminder") {
      setReminderTimeEnabled(false);
      return;
    }
    if (props.selectedEvent?.id) {
      setReminderTimeEnabled(props.selectedEvent.allDay === false);
    }
  }, [eventKind, props.selectedEvent]);

  const handleAdd = (event: CalendarEvent) => {
    const nextEvent = {
      ...event,
      data: { ...(event.data ?? {}), calendarId, kind: eventKind },
    };
    props.onAdd?.(nextEvent);
  };

  const handleUpdate = (event: CalendarEvent) => {
    const nextEvent = {
      ...event,
      data: { ...(event.data ?? {}), calendarId, kind: eventKind },
    };
    props.onUpdate?.(nextEvent);
  };

  const listSource = eventKind === "reminder" ? reminderLists : calendars;
  const listDefaultId = listSource[0]?.id ?? "";

  useEffect(() => {
    if (!calendarId && listDefaultId) {
      setCalendarId(listDefaultId);
    }
  }, [calendarId, listDefaultId]);

  useEffect(() => {
    if (props.selectedEvent?.id) return;
    if (eventKind === "reminder" && reminderLists.length > 0) {
      setCalendarId(reminderLists[0].id);
    }
    if (eventKind === "event" && calendars.length > 0) {
      setCalendarId(calendars[0].id);
    }
  }, [calendars, eventKind, props.selectedEvent?.id, reminderLists]);

  return (
    <Dialog onOpenChange={props.onClose} open={Boolean(props.open)}>
      <DialogContent className="flex min-h-0 flex-col w-[90vw] max-w-[520px] max-h-[90vh] p-4 sm:p-6 overflow-hidden gap-3">
        <DialogHeader className="shrink-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-base sm:text-lg">
                {props.selectedEvent?.id ? translations?.editEvent : translations?.createEvent}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                {props.selectedEvent?.id
                  ? translations?.editEventDetails
                  : translations?.addNewEvent}
              </DialogDescription>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-3xl border border-border bg-background/70 px-3 py-2 sm:justify-end">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('reminderToggleLabel')}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t('reminderToggleDesc')}
                </span>
              </div>
              <Switch
                checked={eventKind === "reminder"}
                onCheckedChange={(checked) => setEventKind(checked ? "reminder" : "event")}
              />
            </div>
          </div>
        </DialogHeader>
        <div className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t(eventKind === "reminder" ? "reminderListLabel" : "calendarTypeLabel")}
          </span>
          <Select value={calendarId} onValueChange={setCalendarId} disabled={listSource.length === 0}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('selectCalendar')} />
            </SelectTrigger>
            <SelectContent>
              {listSource.map((calendar) => (
                <SelectItem key={calendar.id} value={calendar.id}>
                  {calendar.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <EventForm
          selectedEvent={props.selectedEvent}
          onClose={props.onClose}
          onAdd={handleAdd}
          onUpdate={handleUpdate}
          onDelete={props.onDelete}
          eventType={eventKind}
          reminderTimeEnabled={reminderTimeEnabled}
          onReminderTimeEnabledChange={setReminderTimeEnabled}
        />
      </DialogContent>
    </Dialog>
  );
}

export default function CalendarPage({
  panelKey: _panelKey,
  tabId: _tabId,
  compact = false,
  initialView,
  hideViewControls,
  hideNewEventButton,
  headerTrailingSlot,
}: {
  panelKey: string;
  tabId: string;
  /** Whether to render the calendar in compact mode. */
  compact?: boolean;
  /** Initial calendar view mode. */
  initialView?: 'day' | 'week' | 'month';
  /** Whether to hide the view controls (day/week/month tabs) in the header. */
  hideViewControls?: boolean;
  /** Whether to hide the new event button in the header. */
  hideNewEventButton?: boolean;
  /** Optional trailing slot rendered after view controls in the header (replaces default new event button area). */
  headerTrailingSlot?: React.ReactNode;
}) {
  const { t } = useTranslation('calendar');
  const { basic } = useBasicConfig();
  const uiLanguageRaw = basic.uiLanguage;
  // 逻辑：未知语言回退到 zh-CN。
  const uiLanguage: LanguageId =
    uiLanguageRaw === "zh-CN" ||
    uiLanguageRaw === "en-US" ||
    uiLanguageRaw === "ja-JP" ||
    uiLanguageRaw === "ko-KR" ||
    uiLanguageRaw === "fr-FR" ||
    uiLanguageRaw === "de-DE" ||
    uiLanguageRaw === "es-ES"
      ? uiLanguageRaw
      : "zh-CN";
  const calendarLocale = CALENDAR_LOCALE_BY_LANGUAGE[uiLanguage];
  const calendarTranslations = CALENDAR_TRANSLATIONS[uiLanguage];
  const { data: projectTree = [] } = useProjects();
  const projectHierarchy = useMemo(
    () => buildProjectHierarchyIndex(projectTree),
    [projectTree]
  );
  const projectIdList = useMemo(
    () => Array.from(projectHierarchy.projectById.keys()),
    [projectHierarchy]
  );
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    () => new Set()
  );
  const projectSelectionInitializedRef = useRef(false);
  const [sourceFilter, setSourceFilter] = useState<CalendarSourceFilter>("all");
  const [showTasks, setShowTasks] = useState(true);
  // 逻辑：桌面嵌入版隐藏侧边栏，保留日历主体。
  const showSidebar = !compact;
  // 逻辑：主页面底部 Dock 存在时，为日历主体预留安全边距，避免底部边框被遮挡。
  const calendarBodySafeMarginClassName = compact ? "" : "mb-14";
  // 逻辑：紧凑模式下缩小事件样式，提升小组件可读性。
  const eventPaddingClassName = compact ? "px-0.5" : "px-1";
  const eventTextClassName = compact ? "text-[9px] sm:text-[10px]" : "text-[10px] sm:text-xs";
  const reminderGapClassName = compact ? "gap-0.5" : "gap-1";
  const reminderDotClassName = compact ? "h-1 w-1" : "h-2 w-2";

  useEffect(() => {
    if (projectSelectionInitializedRef.current) return;
    if (projectIdList.length === 0) return;
    // 逻辑：首次载入项目时默认全选，避免空筛选。
    setSelectedProjectIds(new Set(projectIdList));
    projectSelectionInitializedRef.current = true;
  }, [projectIdList]);

  const {
    systemEvents,
    systemReminders,
    calendars,
    reminderLists,
    selectedCalendarIds,
    selectedReminderListIds,
    permissionState,
    eventPermission,
    reminderPermission,
    isLoading,
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
  } = useCalendarPageState({ toSystemEvent, getEventKind, sourceFilter });

  const { taskEvents, taskCount } = useCalendarTasks({
    selectedProjectIds,
    showTasks,
  });

  const handleToggleTasks = useCallback(() => {
    setShowTasks((prev) => !prev);
  }, []);

  const handleSelectAllProjects = useCallback(() => {
    setSelectedProjectIds(new Set(projectIdList));
  }, [projectIdList]);

  const handleClearProjects = useCallback(() => {
    setSelectedProjectIds(new Set());
  }, []);

  const handleToggleProject = useCallback(
    (projectId: string) => {
      const descendants = projectHierarchy.descendantsById.get(projectId);
      const targetIds = [projectId, ...(descendants ? Array.from(descendants) : [])];
      setSelectedProjectIds((prev) => {
        const next = new Set(prev);
        const shouldSelect = targetIds.some((id) => !next.has(id));
        if (shouldSelect) {
          targetIds.forEach((id) => next.add(id));
        } else {
          targetIds.forEach((id) => next.delete(id));
        }
        return next;
      });
    },
    [projectHierarchy]
  );

  const calendarColorMap = useMemo(() => buildCalendarColorMap(calendars), [calendars]);

  const reminderColorMap = useMemo(() => buildCalendarColorMap(reminderLists), [reminderLists]);
  const calendarAccessMap = useMemo(() => buildCalendarAccessMap(calendars), [calendars]);
  const reminderAccessMap = useMemo(() => buildCalendarAccessMap(reminderLists), [reminderLists]);
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
  const sourceMap = useMemo(() => {
    const map = new Map<string, CalendarSource>();
    calendars.forEach((source) => map.set(source.id, source));
    reminderLists.forEach((source) => map.set(source.id, source));
    return map;
  }, [calendars, reminderLists]);

  const visibleEvents = useMemo(() => {
    const eventResults = systemEvents.map((event) =>
      toCalendarEvent(event, calendarColorMap, calendarAccessMap, sourceMap, "event")
    );

    const reminderResults = [...systemReminders]
      .sort((a, b) => {
        const aCompleted = Boolean(a.completedAt);
        const bCompleted = Boolean(b.completedAt);
        if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
        return a.startAt.localeCompare(b.startAt);
      })
      .map((reminder) =>
        toCalendarEvent(reminder, reminderColorMap, reminderAccessMap, sourceMap, "reminder")
      );

    return [...eventResults, ...reminderResults, ...taskEvents];
  }, [
    calendarColorMap,
    calendarAccessMap,
    reminderColorMap,
    reminderAccessMap,
    systemEvents,
    systemReminders,
    sourceMap,
    taskEvents,
  ]);

  const handleSelectAllCalendarsFiltered = useCallback(() => {
    if (sourceFilter === "all") {
      handleSelectAllCalendars();
      return;
    }
    setSelectedCalendarIds((prev) => {
      const next = new Set(prev);
      filteredCalendars.forEach((calendar) => next.add(calendar.id));
      return next;
    });
  }, [filteredCalendars, handleSelectAllCalendars, setSelectedCalendarIds, sourceFilter]);

  const handleClearCalendarsFiltered = useCallback(() => {
    if (sourceFilter === "all") {
      handleClearCalendars();
      return;
    }
    setSelectedCalendarIds((prev) => {
      const next = new Set(prev);
      filteredCalendars.forEach((calendar) => next.delete(calendar.id));
      return next;
    });
  }, [filteredCalendars, handleClearCalendars, setSelectedCalendarIds, sourceFilter]);

  const handleSelectAllRemindersFiltered = useCallback(() => {
    if (sourceFilter === "all") {
      setSelectedReminderListIds(new Set(reminderLists.map((item) => item.id)));
      return;
    }
    setSelectedReminderListIds((prev) => {
      const next = new Set(prev);
      filteredReminderLists.forEach((list) => next.add(list.id));
      return next;
    });
  }, [filteredReminderLists, reminderLists, setSelectedReminderListIds, sourceFilter]);

  const handleClearRemindersFiltered = useCallback(() => {
    if (sourceFilter === "all") {
      setSelectedReminderListIds(new Set());
      return;
    }
    setSelectedReminderListIds((prev) => {
      const next = new Set(prev);
      filteredReminderLists.forEach((list) => next.delete(list.id));
      return next;
    });
  }, [filteredReminderLists, setSelectedReminderListIds, sourceFilter]);

  const handleEventClick = useCallback(() => null, []);
  const hasSystemCalendars = useMemo(
    () => calendars.some((source) => source.provider !== "local"),
    [calendars]
  );
  const hasSystemReminders = useMemo(
    () => reminderLists.some((source) => source.provider !== "local"),
    [reminderLists]
  );
  const hasSystemSources = hasSystemCalendars || hasSystemReminders;
  const shouldShowImportButton = eventPermission !== "granted" && eventPermission !== "unsupported";

  const [showPermissionDialog, setShowPermissionDialog] = useState(false);

  /** 引导用户前往系统设置授权日历权限。 */
  const openCalendarPrivacySettings = useCallback(() => {
    if (isElectronEnv()) {
      setShowPermissionDialog(true);
      window.openloafElectron?.openExternal?.(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars"
      );
    } else {
      toast.error(t('accessDenied'));
    }
  }, [t]);

  const handleImportCalendar = useCallback(async () => {
    try {
      const result = await handleRequestPermission();
      if (!result.ok) {
        // 超时或失败 → 直接引导用户去系统设置手动授权。
        // 常见原因：系统代理导致 EventKit 通信阻塞。
        openCalendarPrivacySettings();
        return;
      }
      if (result.data.event === "granted") {
        toast.success(t('authSuccess'));
        return;
      }
      // 用户在 macOS 弹窗中拒绝了授权。
      openCalendarPrivacySettings();
    } catch {
      openCalendarPrivacySettings();
    }
  }, [handleRequestPermission, openCalendarPrivacySettings, t]);

  const handleRelaunchApp = useCallback(async () => {
    if (window.openloafElectron?.relaunchApp) {
      await window.openloafElectron.relaunchApp();
    }
  }, []);

  return (
    <div className={`h-full w-full p-0 ${styles.calendarRoot}`}>
      <div className="h-full min-h-0 flex flex-col gap-3">
        <div className={`min-h-0 flex-1 ${calendarBodySafeMarginClassName}`}>
          <IlamyCalendar
            key={initialView}
            initialView={initialView}
            hideViewControls={hideViewControls}
            hideNewEventButton={hideNewEventButton}
            events={visibleEvents}
            headerClassName="justify-between"
            headerLeadingSlot={
              headerTrailingSlot ? headerTrailingSlot
              : shouldShowImportButton ? (
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-3xl px-3 py-1.5 text-xs font-medium bg-secondary text-muted-foreground hover:bg-accent shadow-none transition-colors duration-150 disabled:opacity-50"
                  onClick={handleImportCalendar}
                  disabled={isLoading}
                >
                  <Download className="h-3.5 w-3.5" />
                  {t('importCalendar')}
                </button>
              ) : undefined
            }
            locale={calendarLocale}
            translations={calendarTranslations}
            openEventOnCellDoubleClick
            disableEventClick={false}
            disableDragAndDrop={false}
            onDateChange={handleDateChange}
            onEventAdd={handleEventAdd}
            onEventUpdate={handleEventUpdate}
            onEventDelete={handleEventDelete}
            onEventClick={handleEventClick}
            openEventOnDoubleClick
            renderEvent={(event) => {
              const meta = event.data as {
                kind?: CalendarKind | 'task';
                completed?: boolean;
                readOnly?: boolean;
                isSubscribed?: boolean;
                status?: string;
              } | undefined;
              if (meta?.kind === "task") {
                return (
                  <div
                    className={`h-full w-full ${eventPaddingClassName} text-left overflow-clip relative rounded-3xl flex items-center ${reminderGapClassName}`}
                    style={{ backgroundColor: "transparent" }}
                  >
                    <span
                      className="inline-flex h-2 w-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: event.backgroundColor ?? "var(--ol-blue)" }}
                    />
                    <span className={`${eventTextClassName} font-semibold text-foreground truncate`}>
                      {event.title}
                    </span>
                  </div>
                );
              }
              if (meta?.kind !== "reminder") {
                return (
                  <div
                    className={`h-full w-full ${eventPaddingClassName} border-[1.5px] border-card text-left overflow-clip relative rounded-3xl flex items-center`}
                    style={{ backgroundColor: event.backgroundColor, color: event.color }}
                  >
                    <span className={`${eventTextClassName} font-semibold`}>
                      {event.title}
                    </span>
                  </div>
                );
              }
              const isCompleted = meta?.completed === true;
              const isReadOnly = meta?.readOnly === true || meta?.isSubscribed === true;
              return (
                <div
                  className={`h-full w-full ${eventPaddingClassName} text-left overflow-clip relative rounded-3xl flex items-center ${reminderGapClassName} ${
                    isCompleted ? "text-muted-foreground" : "text-foreground"
                  }`}
                  style={{
                    backgroundColor: "transparent",
                  }}
                >
                  <span
                    className={`inline-flex ${reminderDotClassName} items-center justify-center rounded-full border border-current cursor-default`}
                    style={{
                      color: event.backgroundColor ?? "rgb(59, 130, 246)",
                      opacity: isCompleted ? 0.65 : 1,
                    }}
                    role="button"
                    aria-disabled={isReadOnly}
                    aria-label={t('completeReminder')}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isReadOnly) return;
                      void toggleReminderCompleted(event);
                    }}
                  >
                    {isCompleted && (
                      <span className="h-1 w-1 rounded-full bg-current" />
                    )}
                  </span>
                  <span className={`${eventTextClassName} font-semibold`}>
                    {event.title}
                  </span>
                </div>
              );
            }}
            sidebar={
              showSidebar ? (
                <CalendarFilterPanel
                  calendars={filteredCalendars}
                  reminderLists={filteredReminderLists}
                  projects={projectTree}
                  projectIdList={projectIdList}
                  projectDescendantsById={projectHierarchy.descendantsById}
                  calendarColorMap={calendarColorMap}
                  reminderColorMap={reminderColorMap}
                  permissionState={permissionState}
                  sourceFilter={sourceFilter}
                  hasSystemCalendars={hasSystemCalendars}
                  hasSystemReminders={hasSystemReminders}
                  selectedCalendarIds={selectedCalendarIds}
                  selectedReminderListIds={selectedReminderListIds}
                  selectedProjectIds={selectedProjectIds}
                  showTasks={showTasks}
                  taskCount={taskCount}
                  onToggleTasks={handleToggleTasks}
                  className="h-full overflow-auto"
                  onSourceFilterChange={setSourceFilter}
                  onToggleCalendar={handleToggleCalendar}
                  onSelectAllCalendars={handleSelectAllCalendarsFiltered}
                  onClearCalendars={handleClearCalendarsFiltered}
                  onSelectAllReminders={handleSelectAllRemindersFiltered}
                  onClearReminders={handleClearRemindersFiltered}
                  onToggleReminder={(calendarId) =>
                    setSelectedReminderListIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(calendarId)) {
                        next.delete(calendarId);
                      } else {
                        next.add(calendarId);
                      }
                      return next;
                    })
                  }
                  onSelectAllProjects={handleSelectAllProjects}
                  onClearProjects={handleClearProjects}
                  onToggleProject={handleToggleProject}
                />
              ) : undefined
            }
            sidebarClassName={showSidebar ? "h-full" : "hidden"}
            renderEventForm={(props) => {
              const selectedMeta = props.selectedEvent?.data as { calendarId?: string; kind?: CalendarKind | 'task' } | undefined;
              if (selectedMeta?.kind === "task") {
                // Task events are read-only — close the form immediately
                props.onClose?.();
                return null;
              }
              const kind = selectedMeta?.kind === "reminder" ? "reminder" : "event";
              const fallbackId =
                kind === "reminder"
                  ? selectedReminderListIdList[0] ?? reminderLists[0]?.id
                  : selectedCalendarIdList[0] ?? calendars[0]?.id;
              const defaultCalendarId = selectedMeta?.calendarId ?? fallbackId ?? "";
              return (
                <SystemEventFormDialog
                  props={props}
                  calendars={calendars}
                  reminderLists={reminderLists}
                  uiLanguage={uiLanguage}
                  translations={calendarTranslations}
                  defaultCalendarId={defaultCalendarId}
                />
              );
            }}
          />
        </div>
      </div>

      <AlertDialog open={showPermissionDialog} onOpenChange={setShowPermissionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('permissionRequired')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('permissionDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('later')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRelaunchApp}
              className="bg-foreground text-white hover:bg-foreground/85"
            >
              {t('restart')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
