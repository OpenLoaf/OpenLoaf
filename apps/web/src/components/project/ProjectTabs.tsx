import {
  CheckSquare,
  Folder,
  Info,
  Settings,
} from "lucide-react";
import { useMemo, useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Format a shortcut string for tooltip display. */
function formatShortcutLabel(shortcut: string, isMac: boolean): string {
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
        .join(joiner),
    )
    .join(" / ");
}

export const PROJECT_TABS = [
  {
    value: "index",
    icon: <Info className="size-4 shrink-0" />,
    label: "首页",
  },
  {
    value: "files",
    icon: <Folder className="size-4 shrink-0" />,
    label: "文件",
  },
  // {
  //   value: "canvas",
  //   icon: <LayoutDashboard className="size-4 shrink-0" />,
  //   label: "画布",
  // },
  {
    value: "tasks",
    icon: <CheckSquare className="size-4 shrink-0" />,
    label: "任务",
  },
  // {
  //   value: "skills",
  //   icon: <Sparkles className="size-4 shrink-0" />,
  //   label: "技能",
  // },
  {
    value: "settings",
    icon: <Settings className="size-4 shrink-0" />,
    label: "设置",
  },
] as const;

export type ProjectTabValue = (typeof PROJECT_TABS)[number]["value"];

type ProjectTabsProps = {
  value: ProjectTabValue;
  onValueChange: (value: ProjectTabValue) => void;
  isActive?: boolean;
  revealDelayMs?: number;
};

export default function ProjectTabs({
  value,
  onValueChange,
  isActive = true,
}: ProjectTabsProps) {
  const tabButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isMac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac")),
    [],
  );

  const activeIndex = useMemo(
    () => PROJECT_TABS.findIndex((tab) => tab.value === value),
    [value]
  );

  return (
    <div className="flex justify-end flex-1 min-w-0">
      <div
        className="relative"
        role="tablist"
        aria-label="Project Tabs"
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const direction = event.key === "ArrowRight" ? 1 : -1;
          const current = activeIndex === -1 ? 0 : activeIndex;
          const next = (current + direction + PROJECT_TABS.length) % PROJECT_TABS.length;
          const nextValue = PROJECT_TABS[next]?.value;
          if (!nextValue) return;
          onValueChange(nextValue);
          tabButtonRefs.current[next]?.focus();
        }}
        aria-hidden={!isActive}
      >
        <div className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]">
          {PROJECT_TABS.map((tab, index) => {
            const isCurrent = tab.value === value;
            const tabId = `project-tab-${tab.value}`;
            const panelId = `project-panel-${tab.value}`;
            const tabShortcut = formatShortcutLabel(`Alt+${index + 1}`, isMac);
            const tooltipLabel = `${tab.label} (${tabShortcut})`;

            return (
              <Tooltip key={tab.value}>
                <TooltipTrigger asChild>
                  <button
                    ref={(el) => {
                      tabButtonRefs.current[index] = el;
                    }}
                    id={tabId}
                    type="button"
                    role="tab"
                    aria-selected={isCurrent}
                    aria-controls={panelId}
                    aria-label={tab.label}
                    tabIndex={isCurrent ? 0 : -1}
                    onClick={() => onValueChange(tab.value)}
                    className={[
                      "relative text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-md w-full px-2 py-1 text-sm font-medium whitespace-nowrap focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                      "group flex items-center px-3 transition-colors duration-200",
                      isCurrent ? "text-foreground bg-background shadow-sm" : "",
                    ].join(" ")}
                  >
                    <span className="relative z-10 flex items-center justify-center w-5 h-5">
                      {tab.icon}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  {tooltipLabel}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
}
