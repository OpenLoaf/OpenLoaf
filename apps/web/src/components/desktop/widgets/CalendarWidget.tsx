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

import * as React from "react";
import { Maximize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import CalendarPage from "@/components/calendar/Calendar";
import { useLayoutState } from "@/hooks/use-layout-state";
import { Button } from "@openloaf/ui/button";

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
  const { t } = useTranslation('desktop');
  const resolvedTabId = tabId ?? "desktop-calendar";
  const compact = variant !== 'full';
  const initialView = variant ? VARIANT_TO_VIEW[variant] : undefined;
  // 逻辑：单独模式（日/周/月）隐藏视图切换 tab，完整视图保留。
  const hideViewControls = Boolean(variant && variant !== 'full');

  const handleOpenCalendarPage = React.useCallback(() => {
    useLayoutState.getState().pushStackItem({
      id: "calendar-page",
      sourceKey: "calendar-page",
      component: "calendar-page",
      title: t('catalog.calendar'),
    });
  }, []);

  const detailsButton = compact ? (
    <Button
      size="icon"
      variant="ghost"
      className="h-7 w-7"
      onClick={handleOpenCalendarPage}
      aria-label={t('calendarWidget.openDetail')}
    >
      <Maximize2 className="h-3.5 w-3.5" />
    </Button>
  ) : undefined;

  // 逻辑：桌面组件复用日历页面，隐藏侧边栏以适配卡片空间。
  return (
    <div className="h-full w-full min-h-0">
      <CalendarPage
        panelKey="desktop-calendar-widget"
        tabId={resolvedTabId}
        compact={compact}
        initialView={initialView}
        hideViewControls={hideViewControls}
        hideNewEventButton={compact}
        headerTrailingSlot={detailsButton}
      />
    </div>
  );
}
