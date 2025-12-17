"use client";

import * as React from "react";

import { Calendar } from "@/components/ui/calendar";

export default function CalendarPage({
  panelKey: _panelKey,
  tabId: _tabId,
}: {
  panelKey: string;
  tabId: string;
}) {
  const [selected, setSelected] = React.useState<Date | undefined>(new Date());

  return (
    <div className="h-full w-full p-4">
      <div className="mb-3 text-sm text-muted-foreground">日历</div>
      <Calendar
        mode="single"
        selected={selected}
        onSelect={setSelected}
        className="rounded-md border"
      />
    </div>
  );
}
