"use client";

import CalendarPage from "@/components/calendar/Calendar";
import EmailPage from "@/components/email/EmailPage";
import SkillsPage from "@/components/skills/SkillsPage";
import {
  ExpandableDockTabs,
  type DockTabItem,
} from "@/components/ui/ExpandableDockTabs";
import WorkspaceDesktop from "@/components/workspace/WorkspaceDesktop";
import { useTabs } from "@/hooks/use-tabs";
import { CalendarDays, Mail, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

type WorkspacePanelId = "calendar" | "email" | "skills" | "workbench";

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

const WORKSPACE_DOCK_TABS: Array<DockTabItem & { id: WorkspacePanelId }> = [
  {
    id: "workbench",
    label: "工作台",
    icon: WorkbenchHeadIcon,
    tone: "amber",
  },
  {
    id: "calendar",
    label: "日历",
    icon: CalendarDays,
    tone: "sky",
  },
  {
    id: "email",
    label: "邮箱",
    icon: Mail,
    tone: "emerald",
  },
  {
    id: "skills",
    label: "技能",
    icon: Wand2,
    tone: "violet",
  },
];

/** Render workspace switch tabs inside settings page. */
export function WorkspaceSettings() {
  const activeTabId = useTabs((state) => state.activeTabId);
  const [activePanelId, setActivePanelId] = useState<WorkspacePanelId>(
    "workbench",
  );

  const selectedIndex = useMemo(() => {
    const index = WORKSPACE_DOCK_TABS.findIndex((tab) => tab.id === activePanelId);
    return index < 0 ? 0 : index;
  }, [activePanelId]);

  /** Handle dock tab change. */
  const handlePanelChange = (index: number | null) => {
    if (index === null) return;
    const nextTab = WORKSPACE_DOCK_TABS[index];
    if (!nextTab) return;
    setActivePanelId(nextTab.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex justify-center">
        <ExpandableDockTabs
          tabs={WORKSPACE_DOCK_TABS}
          selectedIndex={selectedIndex}
          onChange={handlePanelChange}
          size="md"
          expandedWidth={430}
          inputPlaceholder="搜索页面"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-background/70">
        {activePanelId === "calendar" ? (
          <CalendarPage
            panelKey="settings-workspace-calendar"
            tabId={activeTabId ?? ""}
          />
        ) : null}
        {activePanelId === "email" ? (
          <EmailPage panelKey="settings-workspace-email" tabId={activeTabId ?? ""} />
        ) : null}
        {activePanelId === "skills" ? (
          <SkillsPage
            panelKey="settings-workspace-skills"
            tabId={activeTabId ?? ""}
          />
        ) : null}
        {activePanelId === "workbench" ? <WorkspaceDesktop /> : null}
      </div>
    </div>
  );
}
