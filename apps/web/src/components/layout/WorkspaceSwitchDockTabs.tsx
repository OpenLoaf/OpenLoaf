"use client";

import {
  ExpandableDockTabs,
  type DockTabItem,
} from "@/components/ui/ExpandableDockTabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useTabs } from "@/hooks/use-tabs";
import { WORKBENCH_TAB_INPUT } from "@openloaf/api/common";
import { CalendarDays, Clock, LayoutDashboard, Mail } from "lucide-react";
import { useMemo } from "react";

type WorkspaceSwitchTabId = "calendar" | "email" | "workbench" | "scheduled";

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

const WORKSPACE_SWITCH_TABS: WorkspaceSwitchTarget[] = [
  {
    id: "workbench",
    label: "工作台",
    icon: LayoutDashboard,
    tone: "amber",
    baseId: WORKBENCH_TAB_INPUT.baseId,
    component: WORKBENCH_TAB_INPUT.component,
    title: WORKBENCH_TAB_INPUT.title,
    tabIcon: WORKBENCH_TAB_INPUT.icon,
  },
  {
    id: "calendar",
    label: "日历",
    icon: CalendarDays,
    tone: "sky",
    baseId: "base:calendar",
    component: "calendar-page",
    title: "日历",
    tabIcon: "🗓️",
  },
  {
    id: "email",
    label: "邮箱",
    icon: Mail,
    tone: "emerald",
    baseId: "base:mailbox",
    component: "email-page",
    title: "邮箱",
    tabIcon: "📧",
  },
  {
    id: "scheduled",
    label: "任务",
    icon: Clock,
    tone: "rose",
    baseId: "base:scheduled-tasks",
    component: "scheduled-tasks-page",
    title: "任务",
    tabIcon: "⏰",
  },
];

const COMPONENT_TO_TAB_ID: Record<string, WorkspaceSwitchTabId> = {
  "calendar-page": "calendar",
  "email-page": "email",
  "scheduled-tasks-page": "scheduled",
  "workspace-desktop": "workbench",
};

/** Render bottom quick switcher for workspace entry pages. */
export default function WorkspaceSwitchDockTabs({ tabId }: { tabId: string }) {
  const setTabBase = useTabRuntime((state) => state.setTabBase);
  const setTabTitle = useTabs((state) => state.setTabTitle);
  const setTabIcon = useTabs((state) => state.setTabIcon);
  const activeTabId = useTabs((state) => state.activeTabId);
  const isActive = activeTabId === tabId;
  const currentBaseComponent = useTabRuntime(
    (state) => state.runtimeByTabId[tabId]?.base?.component ?? "",
  );

  const selectedIndex = useMemo(() => {
    const currentTabId = COMPONENT_TO_TAB_ID[currentBaseComponent];
    const index = WORKSPACE_SWITCH_TABS.findIndex((tab) => tab.id === currentTabId);
    return index < 0 ? 0 : index;
  }, [currentBaseComponent]);

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
        expandedWidth={520}
        inputPlaceholder="搜索页面"
      />
    </div>
  );
}
