import { CalendarDays, Folder, LayoutDashboard, Settings, Wand2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
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
    label: "首页",
    tone: "sky",
  },
  {
    value: "files",
    icon: Folder,
    label: "文件",
    tone: "emerald",
  },
  {
    value: "tasks",
    icon: CalendarDays,
    label: "历史",
    tone: "amber",
  },
  {
    value: "skills",
    icon: Wand2,
    label: "技能",
    tone: "violet",
  },
  {
    value: "settings",
    icon: Settings,
    label: "设置",
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
};

/** Render project tabs with expandable tabs UI. */
export default function ProjectTabs({
  value,
  onValueChange,
  isActive = true,
  size = "md",
  tabId,
  revealDelayMs = 0,
}: ProjectTabsProps) {
  const [dockHost, setDockHost] = useState<HTMLElement | null>(null);
  // 根据当前值映射到选中索引
  const selectedIndex = useMemo(() => {
    const index = PROJECT_TABS.findIndex((tab) => tab.value === value);
    return index === -1 ? null : index;
  }, [value]);

  const isMac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac")),
    []
  );

  const tabs = useMemo(
    () =>
      PROJECT_TABS.map((tab) => ({
        id: tab.value,
        label: tab.label,
        icon: tab.icon,
        tone: tab.tone,
      })),
    []
  );

  /** Handle tab changes from UI. */
  const handleChange = (index: number | null) => {
    if (index === null) return;
    const nextTab = PROJECT_TABS[index];
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
