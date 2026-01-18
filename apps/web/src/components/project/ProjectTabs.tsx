import { CalendarDays, Folder, Info, Settings } from "lucide-react";
import { useMemo } from "react";
import { ExpandableTabs } from "@/components/ui/expandable-tabs";

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
    icon: Info,
    label: "首页",
  },
  {
    value: "files",
    icon: Folder,
    label: "文件",
  },
  {
    value: "tasks",
    icon: CalendarDays,
    label: "历史",
  },
  {
    value: "settings",
    icon: Settings,
    label: "设置",
  },
] as const;

export type ProjectTabValue = (typeof PROJECT_TABS)[number]["value"];

/** Project tabs props. */
type ProjectTabsProps = {
  value: ProjectTabValue;
  onValueChange: (value: ProjectTabValue) => void;
  isActive?: boolean;
  revealDelayMs?: number;
};

/** Render project tabs with expandable tabs UI. */
export default function ProjectTabs({
  value,
  onValueChange,
  isActive = true,
}: ProjectTabsProps) {
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
        title: tab.label,
        icon: tab.icon,
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

  return (
    <div className="flex justify-end flex-1 min-w-0" aria-hidden={!isActive}>
      <ExpandableTabs
        tabs={tabs}
        selectedIndex={selectedIndex}
        onChange={handleChange}
        getTooltip={(tab, index) =>
          `${tab.title} (${formatShortcutLabel(`Alt+${index + 1}`, isMac)})`
        }
      />
    </div>
  );
}
