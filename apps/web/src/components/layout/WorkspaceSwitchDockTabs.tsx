"use client";

import {
  ExpandableDockTabs,
  type DockTabItem,
} from "@/components/ui/ExpandableDockTabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useTabs } from "@/hooks/use-tabs";
import { WORKBENCH_TAB_INPUT } from "@tenas-ai/api/common";
import { CalendarDays, Mail, Wand2 } from "lucide-react";
import { useMemo } from "react";

type WorkspaceSwitchTabId = "calendar" | "email" | "skills" | "workbench";

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

/** Render workbench logo icon in dock tabs. */
function WorkbenchHeadIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/head_s.png"
      alt=""
      decoding="sync"
      className={["block shrink-0 object-contain", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
    />
  );
}

const WORKSPACE_SWITCH_TABS: WorkspaceSwitchTarget[] = [
  {
    id: "workbench",
    label: "工作台",
    icon: WorkbenchHeadIcon,
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
    id: "skills",
    label: "技能",
    icon: Wand2,
    tone: "violet",
    baseId: "base:skills",
    component: "skills-page",
    title: "技能",
    tabIcon: "🪄",
  },
];

const COMPONENT_TO_TAB_ID: Record<string, WorkspaceSwitchTabId> = {
  "calendar-page": "calendar",
  "email-page": "email",
  "skills-page": "skills",
  "workspace-desktop": "workbench",
};

/** Render bottom quick switcher for workspace entry pages. */
export default function WorkspaceSwitchDockTabs({ tabId }: { tabId: string }) {
  const setTabBase = useTabRuntime((state) => state.setTabBase);
  const clearStack = useTabRuntime((state) => state.clearStack);
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
    // 中文注释：切换主页面前先清理 stack，避免上一个页面的浮层残留。
    clearStack(tabId);
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
        expandedWidth={430}
        inputPlaceholder="搜索页面"
      />
    </div>
  );
}
