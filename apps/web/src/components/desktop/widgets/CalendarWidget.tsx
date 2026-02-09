"use client";

import * as React from "react";
import CalendarPage from "@/components/calendar/Calendar";

export interface CalendarWidgetProps {
  /** Current tab id for calendar context. */
  tabId?: string;
}

/** Render the desktop calendar widget in compact mode. */
export default function CalendarWidget({ tabId }: CalendarWidgetProps) {
  const resolvedTabId = tabId ?? "desktop-calendar";
  // 逻辑：桌面组件复用日历页面，隐藏侧边栏以适配卡片空间。
  return (
    <div className="h-full w-full min-h-0">
      <CalendarPage panelKey="desktop-calendar-widget" tabId={resolvedTabId} compact />
    </div>
  );
}
