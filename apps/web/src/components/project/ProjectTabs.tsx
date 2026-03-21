/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { CalendarDays, Clock, Folder, LayoutDashboard, Palette, Settings } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExpandableDockTabs } from "@/components/ui/ExpandableDockTabs";

/** Format a shortcut string for tooltip display. */
function formatShortcutLabel(shortcut: string, isMac: boolean): string {
  // 兼容多组快捷键的展示
  const alternatives = shortcut
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean);
  const joiner = isMac ? "" : "+";

  const formatPart = (part: string) => {
    const normalized = part.toLowerCase();
    if (normalized === "mod") return isMac ? "⌘" : "Ctrl";
    if (normalized === "cmd") return "⌘";
    if (normalized === "ctrl") return "Ctrl";
    if (normalized === "alt") return isMac ? "⌥" : "Alt";
    if (normalized === "shift") return isMac ? "⇧" : "Shift";
    if (/^[a-z]$/i.test(part)) return part.toUpperCase();
    return part;
  };

  return alternatives
    .map((alt) =>
      alt
        .split("+")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((part) => formatPart(part))
        .join(joiner)
    )
    .join(" / ");
}

/** Project tab definition. */
export const PROJECT_TABS = [
  {
    value: "index",
    icon: LayoutDashboard,
    labelKey: "project:project.tabHome",
    tone: "emerald",
  },
  {
    value: "files",
    icon: Folder,
    labelKey: "project:project.tabFiles",
    tone: "sky",
  },
  {
    value: "canvas",
    icon: Palette,
    labelKey: "project:project.tabCanvas",
    tone: "violet",
  },
  {
    value: "tasks",
    icon: CalendarDays,
    labelKey: "project:project.tabHistory",
    tone: "amber",
  },
  {
    value: "scheduled",
    icon: Clock,
    labelKey: "project:project.tabScheduled",
    tone: "rose",
  },
  {
    value: "settings",
    icon: Settings,
    labelKey: "project:project.tabSettings",
    tone: "slate",
  },
] as const;

export type ProjectTabValue = (typeof PROJECT_TABS)[number]["value"];

/** Project tabs props. */
type ProjectTabsProps = {
  value: ProjectTabValue;
  onValueChange: (value: ProjectTabValue) => void;
  isActive?: boolean;
  revealDelayMs?: number;
  size?: "sm" | "md" | "lg";
  tabId?: string;
  /** Tab values to hide (feature-gated and not yet initialized). */
  hiddenTabs?: ReadonlySet<string>;
};

/** Render project tabs with expandable tabs UI. */
export default function ProjectTabs({
  value,
  onValueChange,
  isActive = true,
  size = "md",
  tabId,
  revealDelayMs = 0,
  hiddenTabs,
}: ProjectTabsProps) {
  const { t } = useTranslation("project");
  const [dockHost, setDockHost] = useState<HTMLElement | null>(null);

  // 过滤掉被隐藏的 tab（feature-gated 且未初始化）。
  const visibleTabs = useMemo(
    () =>
      hiddenTabs?.size
        ? PROJECT_TABS.filter((tab) => !hiddenTabs.has(tab.value))
        : PROJECT_TABS,
    [hiddenTabs],
  );

  // 根据当前值映射到选中索引（基于可见 tab 列表）。
  const selectedIndex = useMemo(() => {
    const index = visibleTabs.findIndex((tab) => tab.value === value);
    return index === -1 ? null : index;
  }, [value, visibleTabs]);

  const isMac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac")),
    []
  );

  const tabs = useMemo(
    () =>
      visibleTabs.map((tab) => ({
        id: tab.value,
        label: t(tab.labelKey.replace("project:", "")),
        icon: tab.icon,
        tone: tab.tone,
      })),
    [t, visibleTabs]
  );

  /** Handle tab changes from UI. */
  const handleChange = (index: number | null) => {
    if (index === null) return;
    const nextTab = visibleTabs[index];
    if (!nextTab) return;
    onValueChange(nextTab.value);
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    /** Resolve dock host for the current tab. */
    const resolveHost = () => {
      const selector = tabId
        ? `[data-project-dock-host][data-tab-id="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(tabId) : tabId}"]`
        : "[data-project-dock-host]";
      // 中文注释：优先定位当前 tab 的 dock host，避免多 Tab 时渲染到隐藏面板。
      setDockHost(document.querySelector(selector) as HTMLElement | null);
    };
    resolveHost();
    const observer = new MutationObserver(() => resolveHost());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [tabId]);

  const dock = (
    <div className="flex justify-center min-w-0" aria-hidden={!isActive}>
      <ExpandableDockTabs
        tabs={tabs}
        selectedIndex={selectedIndex}
        onChange={handleChange}
        size={size}
        active={isActive}
        expandedWidth={size === "lg" ? 460 : size === "sm" ? 380 : 420}
        revealDelayMs={revealDelayMs}
        getTooltip={(tab, index) =>
          `${tab.label} (${formatShortcutLabel(`Alt+${index + 1}`, isMac)})`
        }
      />
    </div>
  );

  if (dockHost) {
    return createPortal(dock, dockHost);
  }

  return dock;
}
