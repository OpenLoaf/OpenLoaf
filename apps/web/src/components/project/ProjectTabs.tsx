import {
  CheckSquare,
  Folder,
  Info,
  Settings,
} from "lucide-react";
import { useMemo, useRef } from "react";

export const PROJECT_TABS = [
  {
    value: "intro",
    icon: <Info className="size-4 shrink-0" />,
    label: "简介",
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

            return (
              <button
                key={tab.value}
                ref={(el) => {
                  tabButtonRefs.current[index] = el;
                }}
                id={tabId}
                type="button"
                role="tab"
                aria-selected={isCurrent}
                aria-controls={panelId}
                aria-label={tab.label}
                title={tab.label}
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
                <span className="pointer-events-none absolute left-1/2 bottom-0 z-20 -translate-x-1/2 translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
