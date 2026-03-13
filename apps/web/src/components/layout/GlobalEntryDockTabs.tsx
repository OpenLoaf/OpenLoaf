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

import {
  ExpandableDockTabs,
  type DockTabItem,
} from "@/components/ui/ExpandableDockTabs";
import { isWorkbenchDockContextComponent } from "@/components/layout/global-entry-dock";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useAppView } from "@/hooks/use-app-view";
import { WORKBENCH_TAB_INPUT } from "@openloaf/api/common";
import { CalendarDays, Clock, LayoutDashboard, Mail, Palette } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

type GlobalEntryTabId = "calendar" | "email" | "workbench" | "scheduled" | "canvas";

type GlobalEntryTarget = DockTabItem & {
  /** Tab id for global-entry quick switcher. */
  id: GlobalEntryTabId;
  /** Runtime base id. */
  baseId: string;
  /** Runtime component key. */
  component: string;
  /** Tab title. */
  title: string;
  /** Tab icon text. */
  tabIcon: string;
};

function buildGlobalEntryTabs(
  t: (key: string) => string,
  input?: { hideCanvas?: boolean },
): GlobalEntryTarget[] {
  const tabs: GlobalEntryTarget[] = [
    {
      id: "canvas",
      label: t('nav:canvas'),
      icon: Palette,
      tone: "violet",
      baseId: "base:canvas-list",
      component: "canvas-list-page",
      title: t('nav:canvas'),
      tabIcon: "🎨",
    },
    {
      id: "workbench",
      label: t('nav:workbench'),
      icon: LayoutDashboard,
      tone: "emerald",
      baseId: WORKBENCH_TAB_INPUT.baseId,
      component: WORKBENCH_TAB_INPUT.component,
      title: t('nav:workbench'),
      tabIcon: WORKBENCH_TAB_INPUT.icon,
    },
    {
      id: "calendar",
      label: t('nav:calendar'),
      icon: CalendarDays,
      tone: "sky",
      baseId: "base:calendar",
      component: "calendar-page",
      title: t('nav:calendar'),
      tabIcon: "🗓️",
    },
    {
      id: "email",
      label: t('nav:email'),
      icon: Mail,
      tone: "teal",
      baseId: "base:mailbox",
      component: "email-page",
      title: t('nav:email'),
      tabIcon: "📧",
    },
    {
      id: "scheduled",
      label: t('nav:tasks'),
      icon: Clock,
      tone: "rose",
      baseId: "base:scheduled-tasks",
      component: "scheduled-tasks-page",
      title: t('nav:tasks'),
      tabIcon: "⏰",
    },
  ];

  // 逻辑：全局看板 dock 只保留“看板上下文”入口，不把智能画布混在同一组切换里。
  if (input?.hideCanvas) {
    return tabs.filter((tab) => tab.id !== "canvas");
  }

  return tabs;
}

const GLOBAL_ENTRY_COMPONENT_TO_TAB_ID: Record<string, GlobalEntryTabId> = {
  "calendar-page": "calendar",
  "email-page": "email",
  "scheduled-tasks-page": "scheduled",
  "global-desktop": "workbench",
  "canvas-list-page": "canvas",
};

/** Render bottom quick switcher for global entry pages. */
export default function GlobalEntryDockTabs({ tabId }: { tabId: string }) {
  const { t } = useTranslation();
  const setBase = useLayoutState((state) => state.setBase);
  const setTitle = useAppView((state) => state.setTitle);
  const setIcon = useAppView((state) => state.setIcon);
  const isActive = true; // single-view mode, always active
  const currentBaseComponent = useLayoutState(
    (state) => state.base?.component ?? "",
  );
  const hideCanvasTab = isWorkbenchDockContextComponent(currentBaseComponent);

  const globalEntryTabs = useMemo(
    () => buildGlobalEntryTabs(t, { hideCanvas: hideCanvasTab }),
    [hideCanvasTab, t],
  );

  const selectedIndex = useMemo(() => {
    const currentTabId = GLOBAL_ENTRY_COMPONENT_TO_TAB_ID[currentBaseComponent];
    const index = globalEntryTabs.findIndex((tab) => tab.id === currentTabId);
    return index < 0 ? 0 : index;
  }, [currentBaseComponent, globalEntryTabs]);

  /** Switch current tab base panel. */
  const handleChange = (index: number | null) => {
    if (index === null) return;
    const nextTab = globalEntryTabs[index];
    if (!nextTab) return;
    if (!tabId) return;
    if (nextTab.component === currentBaseComponent) return;
    setBase({
      id: nextTab.baseId,
      component: nextTab.component,
    });
    setTitle(nextTab.title);
    setIcon(nextTab.tabIcon);
  };

  return (
    <div className="flex justify-center">
      <ExpandableDockTabs
        tabs={globalEntryTabs}
        selectedIndex={selectedIndex}
        onChange={handleChange}
        size="md"
        active={isActive}
        expandedWidth={600}
        inputPlaceholder={t('ai:input.defaultPlaceholder')}
      />
    </div>
  );
}
