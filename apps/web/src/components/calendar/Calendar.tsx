"use client";

import type { IlamyCalendarProps } from "@ilamy/calendar";
import { IlamyCalendar } from "@ilamy/calendar";

export default function CalendarPage({
  panelKey: _panelKey,
  tabId: _tabId,
}: {
  panelKey: string;
  tabId: string;
}) {
  const events: IlamyCalendarProps["events"] = [];

  return (
    <div className="h-full w-full p-4">
      <div className="h-full min-h-0">
        <IlamyCalendar events={events} headerClassName="justify-between" />
      </div>
    </div>
  );
}
