"use client";

import * as React from "react";
import CalendarPage from "@/components/calendar/Calendar";

export interface CalendarWidgetProps {
  /** Current tab id for calendar context. */
  tabId?: string;
  /** Active variant key. */
  variant?: 'month' | 'week' | 'day' | 'full';
}

/** Map widget variant to calendar view mode. */
const VARIANT_TO_VIEW: Record<string, 'day' | 'week' | 'month'> = {
  month: 'month',
  week: 'week',
  day: 'day',
  full: 'month',
}

/** Render the desktop calendar widget in compact mode. */
export default function CalendarWidget({ tabId, variant }: CalendarWidgetProps) {
  const resolvedTabId = tabId ?? "desktop-calendar";
  const compact = variant !== 'full';
  const initialView = variant ? VARIANT_TO_VIEW[variant] : undefined;
  // 逻辑：单独模式（日/周/月）隐藏视图切换 tab，完整视图保留。
  const hideViewControls = Boolean(variant && variant !== 'full');
  // 逻辑：桌面组件复用日历页面，隐藏侧边栏以适配卡片空间。
  return (
    <div className="h-full w-full min-h-0">
      <CalendarPage
        panelKey="desktop-calendar-widget"
        tabId={resolvedTabId}
        compact={compact}
        initialView={initialView}
        hideViewControls={hideViewControls}
      />
    </div>
  );
}
