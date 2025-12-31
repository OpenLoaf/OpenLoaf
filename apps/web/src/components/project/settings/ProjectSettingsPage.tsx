"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BarChart3, SlidersHorizontal, Sparkles } from "lucide-react";

import { ProjectBasicSettings } from "./menus/ProjectBasicSettings";
import { ProjectSkillSettings } from "./menus/ProjectSkillSettings";
import { ProjectStatsSettings } from "./menus/ProjectStatsSettings";

type ProjectSettingsPanelProps = {
  projectId?: string;
  rootUri?: string;
};

type ProjectSettingsMenuKey = "basic" | "skills" | "stats";

const MENU: Array<{
  key: ProjectSettingsMenuKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  Component: ComponentType<ProjectSettingsPanelProps>;
}> = [
  { key: "basic", label: "基础", Icon: SlidersHorizontal, Component: ProjectBasicSettings },
  { key: "skills", label: "技能", Icon: Sparkles, Component: ProjectSkillSettings },
  { key: "stats", label: "统计", Icon: BarChart3, Component: ProjectStatsSettings },
];

const MENU_KEY_SET = new Set<ProjectSettingsMenuKey>(MENU.map((item) => item.key));

/** Check whether the value is a valid project settings menu key. */
function isProjectSettingsMenuKey(value: unknown): value is ProjectSettingsMenuKey {
  if (typeof value !== "string") return false;
  return MENU_KEY_SET.has(value as ProjectSettingsMenuKey);
}

type ProjectSettingsHeaderProps = {
  isLoading: boolean;
  pageTitle: string;
};

/** Project settings header. */
export function ProjectSettingsHeader({ isLoading, pageTitle }: ProjectSettingsHeaderProps) {
  if (isLoading) return null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-base font-semibold">设置</span>
      <span className="text-xs text-muted-foreground truncate">{pageTitle}</span>
    </div>
  );
}

type ProjectSettingsPageProps = {
  projectId?: string;
  rootUri?: string;
  settingsMenu?: ProjectSettingsMenuKey;
};

/** Project settings page. */
export default function ProjectSettingsPage({
  projectId,
  rootUri,
  settingsMenu,
}: ProjectSettingsPageProps) {
  const [activeKey, setActiveKey] = useState<ProjectSettingsMenuKey>(() =>
    isProjectSettingsMenuKey(settingsMenu) ? settingsMenu : "basic",
  );
  const [isCollapsed, setIsCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const collapseRafRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const lastCollapsedRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const applyCollapseState = (width: number) => {
      const nextCollapsed = width < 700;
      if (lastCollapsedRef.current === nextCollapsed) return;
      lastCollapsedRef.current = nextCollapsed;
      setIsCollapsed(nextCollapsed);
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      // 中文注释：延迟读取宽度，避免同步 setState 引发布局循环。
      pendingWidthRef.current = entry.contentRect.width;
      if (collapseRafRef.current !== null) return;
      collapseRafRef.current = window.requestAnimationFrame(() => {
        collapseRafRef.current = null;
        const width = pendingWidthRef.current;
        if (width == null) return;
        applyCollapseState(width);
      });
    });

    observer.observe(container);
    applyCollapseState(container.getBoundingClientRect().width);
    return () => {
      observer.disconnect();
      if (collapseRafRef.current !== null) {
        window.cancelAnimationFrame(collapseRafRef.current);
        collapseRafRef.current = null;
      }
    };
  }, []);

  const ActiveComponent = useMemo(
    () => MENU.find((item) => item.key === activeKey)?.Component ?? (() => null),
    [activeKey],
  );

  return (
    <div
      ref={containerRef}
      className="h-full w-full min-h-0 min-w-0 overflow-hidden "
    >
      <section className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/70">
        <div className="flex h-full min-h-0">
          <div
            className={cn(
              "shrink-0 border-r border-border ",
              isCollapsed ? "w-[60px]" : "w-[192px]",
            )}
          >
            <div className="h-full overflow-auto">
              <div className="p-2 space-y-2 pr-3">
                {MENU.map((item) => {
                  const active = item.key === activeKey;
                  const Icon = item.Icon;
                  return (
                    <Button
                      key={item.key}
                      variant={active ? "secondary" : "ghost"}
                      size="sm"
                      className={cn(
                        "w-full h-9",
                        isCollapsed
                          ? "justify-center"
                          : "justify-start gap-2 px-3 text-sm",
                      )}
                      onClick={() => setActiveKey(item.key)}
                    >
                      <Icon className="h-4 w-4" />
                      {isCollapsed ? null : <span>{item.label}</span>}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-0 min-h-0 overflow-auto">
            <div className="h-full min-h-0 pl-3 pr-1 pt-2">
              <ActiveComponent projectId={projectId} rootUri={rootUri} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
