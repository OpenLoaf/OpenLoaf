import { useCallback } from "react";
import { Accordion, AccordionContent, AccordionItem } from "@tenas-ai/ui/accordion";
import { Checkbox } from "@tenas-ai/ui/checkbox";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDownIcon } from "lucide-react";

type SystemCalendarItem = TenasCalendarItem;

type CalendarFilterPanelProps = {
  calendars: SystemCalendarItem[];
  reminderLists: SystemCalendarItem[];
  calendarColorMap: Map<string, string>;
  reminderColorMap: Map<string, string>;
  permissionState: TenasCalendarPermissionState;
  selectedCalendarIds: Set<string>;
  selectedReminderListIds: Set<string>;
  className?: string;
  onToggleCalendar: (calendarId: string) => void;
  onSelectAllCalendars: () => void;
  onClearCalendars: () => void;
  onSelectAllReminders: () => void;
  onClearReminders: () => void;
  onToggleReminder: (calendarId: string) => void;
};

function CalendarFilterPanelTrigger({
  children,
  trailing,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <AccordionPrimitive.Header className="flex items-center justify-between gap-2 pr-2">
      <AccordionPrimitive.Trigger
        className="focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-center justify-between gap-2 rounded-md py-2 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]_.calendar-accordion-chevron]:rotate-180"
      >
        <span className="flex items-center gap-2">
          <ChevronDownIcon className="calendar-accordion-chevron size-4 shrink-0 text-muted-foreground transition-transform duration-200" />
          {children}
        </span>
      </AccordionPrimitive.Trigger>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </AccordionPrimitive.Header>
  );
}

export function CalendarFilterPanel({
  calendars,
  reminderLists,
  calendarColorMap,
  reminderColorMap,
  permissionState,
  selectedCalendarIds,
  selectedReminderListIds,
  className,
  onToggleCalendar,
  onSelectAllCalendars,
  onClearCalendars,
  onSelectAllReminders,
  onClearReminders,
  onToggleReminder,
}: CalendarFilterPanelProps) {
  const isGranted = permissionState === "granted";
  const handleToggleCalendar = useCallback(
    (calendarId: string) => onToggleCalendar(calendarId),
    [onToggleCalendar]
  );
  const allCalendarsSelected =
    calendars.length > 0 && selectedCalendarIds.size === calendars.length;
  const noCalendarsSelected = selectedCalendarIds.size === 0;
  const allRemindersSelected =
    reminderLists.length > 0 && selectedReminderListIds.size === reminderLists.length;
  const noRemindersSelected = selectedReminderListIds.size === 0;

  return (
    <div
      className={`flex flex-col rounded-md border border-border/70 bg-background/95 p-2 text-sm ${
        className ?? ""
      }`}
    >
      <Accordion type="multiple" defaultValue={["calendars", "reminders"]}>
        <AccordionItem value="calendars">
          <CalendarFilterPanelTrigger
            trailing={
              <div
                className="flex w-6 items-center justify-end"
                onClick={(event) => event.stopPropagation()}
              >
                <Checkbox
                  checked={
                    allCalendarsSelected
                      ? true
                      : noCalendarsSelected
                      ? false
                      : "indeterminate"
                  }
                  onCheckedChange={(checked) => {
                    if (!isGranted || calendars.length === 0) return;
                    if (checked === true) {
                      onSelectAllCalendars();
                    } else {
                      onClearCalendars();
                    }
                  }}
                  disabled={!isGranted || calendars.length === 0}
                />
              </div>
            }
          >
            <span className="text-foreground">日历</span>
          </CalendarFilterPanelTrigger>
          <AccordionContent className="space-y-1">
            {isGranted && calendars.length === 0 && (
              <div className="px-2 py-1 text-xs text-muted-foreground">
                未检测到系统日历
              </div>
            )}
            {calendars.map((calendar) => {
              const color = calendarColorMap.get(calendar.id) ?? "#94a3b8";
              const checked = selectedCalendarIds.has(calendar.id);
              return (
                <div
                  key={calendar.id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 pr-2 transition-colors hover:bg-muted/60"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => handleToggleCalendar(calendar.id)}
                    disabled={!isGranted}
                  >
                    <span
                      className="inline-flex h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span
                      className={`truncate text-sm ${
                        calendar.readOnly ? "text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {calendar.title}
                    </span>
                  </button>
                  <div className="flex w-6 items-center justify-end">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => handleToggleCalendar(calendar.id)}
                      disabled={!isGranted}
                    />
                  </div>
                </div>
              );
            })}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="reminders">
          <CalendarFilterPanelTrigger
            trailing={
              <div
                className="flex w-6 items-center justify-end"
                onClick={(event) => event.stopPropagation()}
              >
                <Checkbox
                  checked={
                    allRemindersSelected
                      ? true
                      : noRemindersSelected
                      ? false
                      : "indeterminate"
                  }
                  onCheckedChange={(checked) => {
                    if (!isGranted || reminderLists.length === 0) return;
                    if (checked === true) {
                      onSelectAllReminders();
                    } else {
                      onClearReminders();
                    }
                  }}
                  disabled={!isGranted || reminderLists.length === 0}
                />
              </div>
            }
          >
            <span className="text-foreground">提醒事项</span>
          </CalendarFilterPanelTrigger>
          <AccordionContent className="space-y-1">
            {isGranted && reminderLists.length === 0 && (
              <div className="px-2 py-1 text-xs text-muted-foreground">
                未检测到提醒事项列表
              </div>
            )}
            {reminderLists.map((calendar) => {
              const color = reminderColorMap.get(calendar.id) ?? "#94a3b8";
              const checked = selectedReminderListIds.has(calendar.id);
              return (
                <div
                  key={calendar.id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 pr-2 transition-colors hover:bg-muted/60"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => onToggleReminder(calendar.id)}
                    disabled={!isGranted}
                  >
                    <span
                      className="inline-flex h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span
                      className={`truncate text-sm ${
                        calendar.readOnly ? "text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {calendar.title}
                    </span>
                  </button>
                  <div className="flex w-6 items-center justify-end">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onToggleReminder(calendar.id)}
                      disabled={!isGranted}
                    />
                  </div>
                </div>
              );
            })}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
