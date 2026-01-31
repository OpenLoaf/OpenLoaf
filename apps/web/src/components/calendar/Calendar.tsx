"use client";

import type { IlamyCalendarProps } from "@tenas-ai/ui/calendar";
import { IlamyCalendar } from "@tenas-ai/ui/calendar";
import styles from "./Calendar.module.css";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "@tenas-ai/ui/calendar/lib/configs/dayjs-config";
import { Button } from "@tenas-ai/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@tenas-ai/ui/calendar/components/ui/dialog";
import { EventForm, type EventFormProps } from "@tenas-ai/ui/calendar/components/event-form/event-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tenas-ai/ui/calendar/components/ui/select";
import { Switch } from "@tenas-ai/ui/switch";
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
import { useProjects } from "@/hooks/use-projects";
import { buildProjectHierarchyIndex } from "@/lib/project-tree";
import { useWorkspace } from "@/components/workspace/workspaceContext";

type SystemCalendarEvent = TenasCalendarEvent;
type CalendarKind = "event" | "reminder";
type CalendarSourceFilter = "all" | "local" | "system";
type CalendarSource = {
  id: string;
  workspaceId: string;
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
  workspaceId: string;
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
type CalendarEvent = NonNullable<IlamyCalendarProps["events"]>[number];

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
            <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white/70 px-3 py-2 sm:justify-end">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-slate-700">
                  {uiLanguage === "zh-CN" ? "提醒事项" : "Reminder"}
                </span>
                <span className="text-[11px] text-slate-500">
                  {uiLanguage === "zh-CN" ? "关闭则为日历事件" : "Off for calendar event"}
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
          <span className="text-xs font-medium text-slate-700">
            {uiLanguage === "zh-CN"
              ? eventKind === "reminder"
                ? "提醒事项列表"
                : "日历类型"
              : "Calendar"}
          </span>
          <Select value={calendarId} onValueChange={setCalendarId} disabled={listSource.length === 0}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={uiLanguage === "zh-CN" ? "选择日历" : "Select calendar"} />
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
}: {
  panelKey: string;
  tabId: string;
}) {
  const { basic } = useBasicConfig();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
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
  } = useCalendarPageState({ workspaceId, toSystemEvent, getEventKind, sourceFilter });

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

    return [...eventResults, ...reminderResults];
  }, [
    calendarColorMap,
    calendarAccessMap,
    reminderColorMap,
    reminderAccessMap,
    systemEvents,
    systemReminders,
    sourceMap,
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
  const shouldShowImportButton = !hasSystemSources && permissionState !== "unsupported";

  return (
    <div className={`h-full w-full p-0 ${styles.calendarRoot}`}>
      <div className="h-full min-h-0 flex flex-col gap-3">
        <IlamyCalendar
          events={visibleEvents}
          headerClassName="justify-between"
          headerLeadingSlot={
            shouldShowImportButton ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRequestPermission}
                disabled={isLoading}
              >
                导入系统日历
              </Button>
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
              kind?: CalendarKind;
              completed?: boolean;
              readOnly?: boolean;
              isSubscribed?: boolean;
            } | undefined;
            if (meta?.kind !== "reminder") {
              return (
                <div
                  className="h-full w-full px-1 border-[1.5px] border-card text-left overflow-clip relative rounded-sm flex items-center"
                  style={{ backgroundColor: event.backgroundColor, color: event.color }}
                >
                  <span className="text-[10px] font-semibold sm:text-xs">
                    {event.title}
                  </span>
                </div>
              );
            }
            const isCompleted = meta?.completed === true;
            const isReadOnly = meta?.readOnly === true || meta?.isSubscribed === true;
            return (
              <div
                className={`h-full w-full px-1 text-left overflow-clip relative rounded-sm flex items-center gap-1 ${
                  isCompleted ? "text-muted-foreground" : "text-foreground"
                }`}
                style={{
                  backgroundColor: "transparent",
                }}
              >
                <span
                  className={`inline-flex h-2 w-2 items-center justify-center rounded-full border border-current cursor-default`}
                  style={{
                    color: event.backgroundColor ?? "rgb(59, 130, 246)",
                    opacity: isCompleted ? 0.65 : 1,
                  }}
                  role="button"
                  aria-disabled={isReadOnly}
                  aria-label="完成提醒事项"
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
                <span className="text-[10px] font-semibold sm:text-xs">
                  {event.title}
                </span>
              </div>
            );
          }}
          sidebar={
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
          }
          sidebarClassName="h-full"
          renderEventForm={(props) => {
            const selectedMeta = props.selectedEvent?.data as { calendarId?: string; kind?: CalendarKind } | undefined;
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
  );
}
