"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { TenasSettingsLayout } from "@/components/ui/tenas/TenasSettingsLayout";
import { TenasSettingsMenu } from "@/components/ui/tenas/TenasSettingsMenu";
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
  {
    key: "basic",
    label: "基础",
    Icon: SlidersHorizontal,
    Component: ProjectBasicSettings,
  },
  {
    key: "skills",
    label: "技能",
    Icon: Sparkles,
    Component: ProjectSkillSettings,
  },
  {
    key: "stats",
    label: "统计",
    Icon: BarChart3,
    Component: ProjectStatsSettings,
  },
];

const MENU_KEY_SET = new Set<ProjectSettingsMenuKey>(
  MENU.map((item) => item.key)
);

/** Check whether the value is a valid project settings menu key. */
function isProjectSettingsMenuKey(
  value: unknown
): value is ProjectSettingsMenuKey {
  if (typeof value !== "string") return false;
  return MENU_KEY_SET.has(value as ProjectSettingsMenuKey);
}

type ProjectSettingsHeaderProps = {
  isLoading: boolean;
  pageTitle: string;
};

/** Project settings header. */
export function ProjectSettingsHeader({
  isLoading,
  pageTitle,
}: ProjectSettingsHeaderProps) {
  if (isLoading) return null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-base font-semibold">设置</span>
      <span className="text-xs text-muted-foreground truncate">
        {pageTitle}
      </span>
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
    isProjectSettingsMenuKey(settingsMenu) ? settingsMenu : "basic"
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
    () =>
      MENU.find((item) => item.key === activeKey)?.Component ?? (() => null),
    [activeKey]
  );

  return (
    <TenasSettingsLayout
      ref={containerRef}
      isCollapsed={isCollapsed}
      sectionClassName="rounded-2xl  bg-background/70"
      menu={
        <TenasSettingsMenu
          groups={[MENU]}
          activeKey={activeKey}
          isCollapsed={isCollapsed}
          onChange={(key) => setActiveKey(key as ProjectSettingsMenuKey)}
        />
      }
      content={<ActiveComponent projectId={projectId} rootUri={rootUri} />}
    />
  );
}
