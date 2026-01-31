"use client";

import type { IlamyCalendarProps } from "@tenas-ai/ui/calendar";
import { IlamyCalendar } from "@tenas-ai/ui/calendar";
import styles from "./Calendar.module.css";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCallback, useEffect, useMemo, useState } from "react";
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

type SystemCalendarEvent = TenasCalendarEvent;
type SystemCalendarItem = TenasCalendarItem;
type CalendarEvent = NonNullable<IlamyCalendarProps["events"]>[number];
type CalendarKind = "event" | "reminder";

/** Convert system event payload into calendar UI event. */
function toCalendarEvent(
  event: SystemCalendarEvent,
  calendarColorMap: Map<string, string>,
  kind: CalendarKind
): CalendarEvent {
  const backgroundColor =
    event.color ?? (event.calendarId ? calendarColorMap.get(event.calendarId) : undefined);
  const textColor = backgroundColor ? getReadableTextColor(backgroundColor) : undefined;
  return {
    id: event.id,
    title: event.title,
    start: dayjs(event.start),
    end: dayjs(event.end),
    allDay: event.allDay,
    description: event.description,
    location: event.location,
    color: textColor,
    backgroundColor,
    data: {
      calendarId: event.calendarId,
      recurrence: event.recurrence,
      source: "system",
      kind,
      completed: event.completed === true,
    },
  };
}

/** Convert calendar UI event into system event payload. */
function toSystemEvent(event: CalendarEvent): SystemCalendarEvent {
  const meta = event.data as {
    calendarId?: string;
    recurrence?: string;
    completed?: boolean;
    kind?: CalendarKind;
  } | undefined;
  const calendarId = meta?.calendarId?.trim();
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
    id: String(event.id),
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
function buildCalendarColorMap(calendars: SystemCalendarItem[]): Map<string, string> {
  const palette = ["#60A5FA", "#34D399", "#FBBF24", "#F87171", "#A78BFA", "#F472B6"];
  const map = new Map<string, string>();
  calendars.forEach((item, index) => {
    map.set(item.id, item.color ?? palette[index % palette.length]);
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
  calendars: SystemCalendarItem[];
  reminderLists: SystemCalendarItem[];
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
      <DialogContent className="flex flex-col h-[90vh] w-[90vw] max-w-[520px] p-4 sm:p-6 overflow-hidden gap-3">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base sm:text-lg">
            {props.selectedEvent?.id ? translations?.editEvent : translations?.createEvent}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {props.selectedEvent?.id
              ? translations?.editEventDetails
              : translations?.addNewEvent}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white/70 px-3 py-2">
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

  const {
    systemEvents,
    systemReminders,
    calendars,
    reminderLists,
    selectedCalendarIds,
    selectedReminderListIds,
    permissionState,
    errorMessage,
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
    setSelectedReminderListIds,
    toggleReminderCompleted,
  } = useCalendarPageState({ toSystemEvent, getEventKind });

  const calendarColorMap = useMemo(() => buildCalendarColorMap(calendars), [calendars]);

  const reminderColorMap = useMemo(() => buildCalendarColorMap(reminderLists), [reminderLists]);

  const visibleEvents = useMemo(() => {
    const hasSelection = selectedCalendarIds.size > 0;
    const filtered = systemEvents.filter((event) => {
      if (!hasSelection) return true;
      if (!event.calendarId) return true;
      return selectedCalendarIds.has(event.calendarId);
    });
    const eventResults = filtered.map((event) =>
      toCalendarEvent(event, calendarColorMap, "event")
    );

    const reminderHasSelection = selectedReminderListIds.size > 0;
    const reminderFiltered = systemReminders.filter((reminder) => {
      if (!reminderHasSelection) return false;
      if (!reminder.calendarId) return true;
      return selectedReminderListIds.has(reminder.calendarId);
    });

    const reminderResults = [...reminderFiltered]
      .sort((a, b) => {
        const aCompleted = a.completed === true;
        const bCompleted = b.completed === true;
        if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
        return a.start.localeCompare(b.start);
      })
      .map((reminder) => toCalendarEvent(reminder, reminderColorMap, "reminder"));

    return [...eventResults, ...reminderResults];
  }, [
    calendarColorMap,
    reminderColorMap,
    selectedCalendarIds,
    selectedReminderListIds,
    systemEvents,
    systemReminders,
  ]);

  const handleEventClick = useCallback(() => null, []);

  return (
    <div className={`h-full w-full p-4 ${styles.calendarRoot}`}>
      <div className="h-full min-h-0 flex flex-col gap-3">
        {(permissionState !== "granted" || errorMessage) && (
          <div className="rounded-md border border-amber-400/40 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="font-medium">系统日历未就绪</span>
                <span className="text-xs text-amber-800/80">
                  {errorMessage ?? "请授权系统日历权限以同步事件。"}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRequestPermission}
                disabled={isLoading}
              >
                重新授权
              </Button>
            </div>
          </div>
        )}
        <IlamyCalendar
          events={visibleEvents}
          headerClassName="justify-between"
          locale={calendarLocale}
          translations={calendarTranslations}
          disableCellClick
          disableEventClick={permissionState !== "granted"}
          disableDragAndDrop={permissionState !== "granted"}
          onDateChange={handleDateChange}
          onEventAdd={handleEventAdd}
          onEventUpdate={handleEventUpdate}
          onEventDelete={handleEventDelete}
          onEventClick={handleEventClick}
          openEventOnDoubleClick
          renderEvent={(event) => {
            const meta = event.data as { kind?: CalendarKind; completed?: boolean } | undefined;
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
            return (
              <div
                className="h-full w-full px-1 text-left overflow-clip relative rounded-sm flex items-center gap-1"
                style={{
                  backgroundColor: "transparent",
                  color: isCompleted ? "rgba(15, 23, 42, 0.55)" : "rgb(15, 23, 42)",
                }}
              >
                <span
                  className={`inline-flex h-2 w-2 items-center justify-center rounded-full border border-current cursor-default`}
                  style={{
                    color: event.backgroundColor ?? "rgb(59, 130, 246)",
                    opacity: isCompleted ? 0.65 : 1,
                  }}
                  role="button"
                  aria-label="完成提醒事项"
                  onClick={(e) => {
                    e.stopPropagation();
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
              calendars={calendars}
              reminderLists={reminderLists}
              calendarColorMap={calendarColorMap}
              reminderColorMap={reminderColorMap}
              permissionState={permissionState}
              selectedCalendarIds={selectedCalendarIds}
              selectedReminderListIds={selectedReminderListIds}
              className="h-full overflow-auto"
              onToggleCalendar={handleToggleCalendar}
              onSelectAllCalendars={handleSelectAllCalendars}
              onClearCalendars={handleClearCalendars}
              onSelectAllReminders={() =>
                setSelectedReminderListIds(new Set(reminderLists.map((item) => item.id)))
              }
              onClearReminders={() => setSelectedReminderListIds(new Set())}
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
