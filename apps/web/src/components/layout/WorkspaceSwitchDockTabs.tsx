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
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useTabs } from "@/hooks/use-tabs";
import { WORKBENCH_TAB_INPUT } from "@openloaf/api/common";
import { CalendarDays, Clock, LayoutDashboard, Mail, Palette } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

type WorkspaceSwitchTabId = "calendar" | "email" | "workbench" | "scheduled" | "canvas";

type WorkspaceSwitchTarget = DockTabItem & {
  /** Tab id for workspace quick switcher. */
  id: WorkspaceSwitchTabId;
  /** Runtime base id. */
  baseId: string;
  /** Runtime component key. */
  component: string;
  /** Tab title. */
  title: string;
  /** Tab icon text. */
  tabIcon: string;
};

function buildWorkspaceSwitchTabs(t: (key: string) => string): WorkspaceSwitchTarget[] {
  return [
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
}

const COMPONENT_TO_TAB_ID: Record<string, WorkspaceSwitchTabId> = {
  "calendar-page": "calendar",
  "email-page": "email",
  "scheduled-tasks-page": "scheduled",
  "workspace-desktop": "workbench",
  "canvas-list-page": "canvas",
};

/** Render bottom quick switcher for workspace entry pages. */
export default function WorkspaceSwitchDockTabs({ tabId }: { tabId: string }) {
  const { t } = useTranslation();
  const setTabBase = useTabRuntime((state) => state.setTabBase);
  const setTabTitle = useTabs((state) => state.setTabTitle);
  const setTabIcon = useTabs((state) => state.setTabIcon);
  const activeTabId = useTabs((state) => state.activeTabId);
  const isActive = activeTabId === tabId;
  const currentBaseComponent = useTabRuntime(
    (state) => state.runtimeByTabId[tabId]?.base?.component ?? "",
  );

  const WORKSPACE_SWITCH_TABS = useMemo(() => buildWorkspaceSwitchTabs(t), [t]);

  const selectedIndex = useMemo(() => {
    const currentTabId = COMPONENT_TO_TAB_ID[currentBaseComponent];
    const index = WORKSPACE_SWITCH_TABS.findIndex((tab) => tab.id === currentTabId);
    return index < 0 ? 0 : index;
  }, [currentBaseComponent, WORKSPACE_SWITCH_TABS]);

  /** Switch current tab base panel. */
  const handleChange = (index: number | null) => {
    if (index === null) return;
    const nextTab = WORKSPACE_SWITCH_TABS[index];
    if (!nextTab) return;
    if (!tabId) return;
    if (nextTab.component === currentBaseComponent) return;
    setTabBase(tabId, {
      id: nextTab.baseId,
      component: nextTab.component,
    });
    setTabTitle(tabId, nextTab.title);
    setTabIcon(tabId, nextTab.tabIcon);
  };

  return (
    <div className="flex justify-center">
      <ExpandableDockTabs
        tabs={WORKSPACE_SWITCH_TABS}
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
