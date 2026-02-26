/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { useCallback } from "react";
import { Accordion, AccordionContent, AccordionItem } from "@openloaf/ui/accordion";
import { Checkbox } from "@openloaf/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@openloaf/ui/tabs";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDownIcon, Folder } from "lucide-react";
import type { ProjectNode } from "@openloaf/api/services/projectTreeService";

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
type CalendarSourceFilter = "all" | "local" | "system";

type CalendarFilterPanelProps = {
  calendars: CalendarSource[];
  reminderLists: CalendarSource[];
  projects: ProjectNode[];
  projectIdList: string[];
  projectDescendantsById: Map<string, Set<string>>;
  calendarColorMap: Map<string, string>;
  reminderColorMap: Map<string, string>;
  permissionState: OpenLoafCalendarPermissionState;
  sourceFilter: CalendarSourceFilter;
  hasSystemCalendars: boolean;
  hasSystemReminders: boolean;
  selectedCalendarIds: Set<string>;
  selectedReminderListIds: Set<string>;
  selectedProjectIds: Set<string>;
  className?: string;
  onSourceFilterChange: (filter: CalendarSourceFilter) => void;
  onToggleCalendar: (calendarId: string) => void;
  onSelectAllCalendars: () => void;
  onClearCalendars: () => void;
  onSelectAllReminders: () => void;
  onClearReminders: () => void;
  onToggleReminder: (calendarId: string) => void;
  onSelectAllProjects: () => void;
  onClearProjects: () => void;
  onToggleProject: (projectId: string) => void;
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
  projects,
  projectIdList,
  projectDescendantsById,
  calendarColorMap,
  reminderColorMap,
  permissionState,
  sourceFilter,
  hasSystemCalendars,
  hasSystemReminders,
  selectedCalendarIds,
  selectedReminderListIds,
  selectedProjectIds,
  className,
  onSourceFilterChange,
  onToggleCalendar,
  onSelectAllCalendars,
  onClearCalendars,
  onSelectAllReminders,
  onClearReminders,
  onToggleReminder,
  onSelectAllProjects,
  onClearProjects,
  onToggleProject,
}: CalendarFilterPanelProps) {
  const isGranted = permissionState === "granted";
  const handleToggleCalendar = useCallback(
    (calendarId: string) => onToggleCalendar(calendarId),
    [onToggleCalendar]
  );
  const selectedCalendarCount = calendars.reduce(
    (count, calendar) => count + (selectedCalendarIds.has(calendar.id) ? 1 : 0),
    0
  );
  const allCalendarsSelected =
    calendars.length > 0 && selectedCalendarCount === calendars.length;
  const noCalendarsSelected = selectedCalendarCount === 0;
  const selectedReminderCount = reminderLists.reduce(
    (count, calendar) => count + (selectedReminderListIds.has(calendar.id) ? 1 : 0),
    0
  );
  const allRemindersSelected =
    reminderLists.length > 0 && selectedReminderCount === reminderLists.length;
  const noRemindersSelected = selectedReminderCount === 0;
  const selectedProjectCount = projectIdList.reduce(
    (count, projectId) => count + (selectedProjectIds.has(projectId) ? 1 : 0),
    0
  );
  const allProjectsSelected =
    projectIdList.length > 0 && selectedProjectCount === projectIdList.length;
  const noProjectsSelected = selectedProjectCount === 0;

  const resolveProjectChecked = (projectId: string): boolean | "indeterminate" => {
    const descendants = projectDescendantsById.get(projectId);
    const targetIds = [projectId, ...(descendants ? Array.from(descendants) : [])];
    const selectedCount = targetIds.reduce(
      (count, id) => count + (selectedProjectIds.has(id) ? 1 : 0),
      0
    );
    if (selectedCount === 0) return false;
    if (selectedCount === targetIds.length) return true;
    return "indeterminate";
  };

  const renderProjectNode = (node: ProjectNode, depth: number) => (
    <div key={node.projectId} className="space-y-1">
      <div
        className="flex items-center justify-between gap-2 rounded-md py-1.5 pr-2 transition-colors hover:bg-muted/60"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onToggleProject(node.projectId)}
        >
          {node.icon ? (
            <span className="text-base leading-none">{node.icon}</span>
          ) : (
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="truncate text-sm text-foreground">
            {node.title?.trim() || "未命名项目"}
          </span>
        </button>
        <Checkbox
          checked={resolveProjectChecked(node.projectId)}
          onCheckedChange={() => onToggleProject(node.projectId)}
        />
      </div>
      {node.children?.length
        ? node.children.map((child) => renderProjectNode(child, depth + 1))
        : null}
    </div>
  );

  return (
    <div
      className={`flex flex-col rounded-md bg-background/95 p-2 text-sm ${
        className ?? ""
      }`}
    >
      <div className="flex items-center gap-1 px-1 pb-1 font-semibold text-foreground">
        筛选
      </div>
      <Tabs
        value={sourceFilter}
        onValueChange={(value) => onSourceFilterChange(value as CalendarSourceFilter)}
        className="px-1 pb-2"
      >
        <TabsList className="grid h-8 w-full grid-cols-3">
          <TabsTrigger value="all" className="text-xs">
            全部
          </TabsTrigger>
          <TabsTrigger value="local" className="text-xs">
            仅本地
          </TabsTrigger>
          <TabsTrigger value="system" className="text-xs">
            仅系统
          </TabsTrigger>
        </TabsList>
      </Tabs>
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
                    if (calendars.length === 0) return;
                    if (checked === true) {
                      onSelectAllCalendars();
                    } else {
                      onClearCalendars();
                    }
                  }}
                  disabled={calendars.length === 0}
                />
              </div>
            }
          >
            <span className="text-foreground">日历</span>
          </CalendarFilterPanelTrigger>
          <AccordionContent className="space-y-1">
            {isGranted && !hasSystemCalendars && (
              <div className="px-2 py-1 text-xs text-muted-foreground">
                未检测到系统日历
              </div>
            )}
            {calendars.map((calendar) => {
              const color = calendarColorMap.get(calendar.id) ?? "#94a3b8";
              const checked = selectedCalendarIds.has(calendar.id);
              const isReadOnly = calendar.readOnly || calendar.isSubscribed;
              return (
                <div
                  key={calendar.id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 pr-2 transition-colors hover:bg-muted/60"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => handleToggleCalendar(calendar.id)}
                  >
                    <span
                      className="inline-flex h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span
                      className={`truncate text-sm ${
                        isReadOnly ? "text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {calendar.title}
                    </span>
                  </button>
                  <div className="flex w-6 items-center justify-end">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => handleToggleCalendar(calendar.id)}
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
                    if (reminderLists.length === 0) return;
                    if (checked === true) {
                      onSelectAllReminders();
                    } else {
                      onClearReminders();
                    }
                  }}
                  disabled={reminderLists.length === 0}
                />
              </div>
            }
          >
            <span className="text-foreground">提醒事项</span>
          </CalendarFilterPanelTrigger>
          <AccordionContent className="space-y-1">
            {isGranted && !hasSystemReminders && (
              <div className="px-2 py-1 text-xs text-muted-foreground">
                未检测到提醒事项列表
              </div>
            )}
            {reminderLists.map((calendar) => {
              const color = reminderColorMap.get(calendar.id) ?? "#94a3b8";
              const checked = selectedReminderListIds.has(calendar.id);
              const isReadOnly = calendar.readOnly || calendar.isSubscribed;
              return (
                <div
                  key={calendar.id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 pr-2 transition-colors hover:bg-muted/60"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => onToggleReminder(calendar.id)}
                  >
                    <span
                      className="inline-flex h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span
                      className={`truncate text-sm ${
                        isReadOnly ? "text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {calendar.title}
                    </span>
                  </button>
                  <div className="flex w-6 items-center justify-end">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onToggleReminder(calendar.id)}
                    />
                  </div>
                </div>
              );
            })}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="projects">
          <CalendarFilterPanelTrigger
            trailing={
              <div
                className="flex w-6 items-center justify-end"
                onClick={(event) => event.stopPropagation()}
              >
                <Checkbox
                  checked={
                    allProjectsSelected
                      ? true
                      : noProjectsSelected
                      ? false
                      : "indeterminate"
                  }
                  onCheckedChange={(checked) => {
                    if (projectIdList.length === 0) return;
                    if (checked === true) {
                      onSelectAllProjects();
                    } else {
                      onClearProjects();
                    }
                  }}
                  disabled={projectIdList.length === 0}
                />
              </div>
            }
          >
            <span className="text-foreground">项目</span>
          </CalendarFilterPanelTrigger>
          <AccordionContent className="space-y-1">
            {projectIdList.length === 0 && (
              <div className="px-2 py-1 text-xs text-muted-foreground">
                未检测到项目
              </div>
            )}
            {projects.map((project) => renderProjectNode(project, 0))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
