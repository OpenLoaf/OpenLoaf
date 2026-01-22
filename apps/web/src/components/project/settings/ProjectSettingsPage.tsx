"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { TenasSettingsLayout } from "@/components/ui/tenas/TenasSettingsLayout";
import { TenasSettingsMenu } from "@/components/ui/tenas/TenasSettingsMenu";
import { BarChart3, Bot, GitBranch, SlidersHorizontal, Sparkles } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { useBasicConfig } from "@/hooks/use-basic-config";

import { ProjectBasicSettings } from "./menus/ProjectBasicSettings";
import { ProjectAiSettings } from "./menus/ProjectAiSettings";
import { ProjectGitSettings } from "./menus/ProjectGitSettings";
import { ProjectSkillSettings } from "./menus/ProjectSkillSettings";
import { ProjectStatsSettings } from "./menus/ProjectStatsSettings";

type ProjectSettingsPanelProps = {
  projectId?: string;
  rootUri?: string;
};

type ProjectSettingsMenuKey = "basic" | "ai" | "skills" | "stats" | "git";

const BASE_MENU: Array<{
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
    key: "ai",
    label: "AI设置",
    Icon: Bot,
    Component: ProjectAiSettings,
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

const GIT_MENU = {
  key: "git",
  label: "Git",
  Icon: GitBranch,
  Component: ProjectGitSettings,
} satisfies {
  key: ProjectSettingsMenuKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  Component: ComponentType<ProjectSettingsPanelProps>;
};

const MENU_KEY_SET = new Set<ProjectSettingsMenuKey>(
  [...BASE_MENU, GIT_MENU].map((item) => item.key)
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
  const gitInfoQuery = useQuery({
    ...trpc.project.getGitInfo.queryOptions(
      projectId ? { projectId } : skipToken,
    ),
    staleTime: 5000,
  });
  const isGitProject = gitInfoQuery.data?.isGitProject === true;
  const menuItems = useMemo(
    () => (isGitProject ? [...BASE_MENU, GIT_MENU] : BASE_MENU),
    [isGitProject],
  );
  const [isCollapsed, setIsCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const collapseRafRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const lastCollapsedRef = useRef<boolean | null>(null);
  const { basic } = useBasicConfig();
  const shouldAnimate = basic.uiAnimationLevel !== "low";

  useEffect(() => {
    if (menuItems.some((item) => item.key === activeKey)) return;
    setActiveKey("basic");
  }, [activeKey, menuItems]);

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
      menuItems.find((item) => item.key === activeKey)?.Component ?? (() => null),
    [activeKey, menuItems]
  );

  return (
    <TenasSettingsLayout
      ref={containerRef}
      isCollapsed={isCollapsed}
      sectionClassName="rounded-2xl  bg-background/70"
      menu={
        <TenasSettingsMenu
          groups={[menuItems]}
          activeKey={activeKey}
          isCollapsed={isCollapsed}
          onChange={(key) => setActiveKey(key as ProjectSettingsMenuKey)}
        />
      }
      content={
        <div
          key={activeKey}
          className={
            shouldAnimate
              ? "settings-animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out"
              : undefined
          }
        >
          <ActiveComponent projectId={projectId} rootUri={rootUri} />
        </div>
      }
    />
  );
}
