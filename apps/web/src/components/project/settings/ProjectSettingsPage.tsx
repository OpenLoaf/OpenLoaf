"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { TenasSettingsLayout } from "@tenas-ai/ui/tenas/TenasSettingsLayout";
import { TenasSettingsMenu } from "@tenas-ai/ui/tenas/TenasSettingsMenu";
import { BarChart3, Bot, GitBranch, SlidersHorizontal } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { cn } from "@/lib/utils";

import { ProjectBasicSettings } from "./menus/ProjectBasicSettings";
import { ProjectAiSettings } from "./menus/ProjectAiSettings";
import { ProjectGitSettings } from "./menus/ProjectGitSettings";
import { ProjectStatsSettings } from "./menus/ProjectStatsSettings";

type ProjectSettingsPanelProps = {
  projectId?: string;
  rootUri?: string;
};

type ProjectSettingsMenuKey = "basic" | "ai" | "stats" | "git";

const PROJECT_MENU_ICON_COLOR = {
  basic: "text-[#1a73e8] dark:text-sky-300",
  ai: "text-[#9334e6] dark:text-violet-300",
  stats: "text-[#f9ab00] dark:text-amber-300",
  git: "text-[#188038] dark:text-emerald-300",
} as const;

/** Build a menu icon component with fixed email-style color tone. */
function createMenuIcon(
  Icon: ComponentType<{ className?: string }>,
  colorClassName: string,
): ComponentType<{ className?: string }> {
  return function MenuIcon({ className }: { className?: string }) {
    return <Icon className={cn(colorClassName, className)} />;
  };
}

const BASE_MENU: Array<{
  key: ProjectSettingsMenuKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  Component: ComponentType<ProjectSettingsPanelProps>;
}> = [
  {
    key: "basic",
    label: "基础",
    Icon: createMenuIcon(SlidersHorizontal, PROJECT_MENU_ICON_COLOR.basic),
    Component: ProjectBasicSettings,
  },
  {
    key: "ai",
    label: "AI设置",
    Icon: createMenuIcon(Bot, PROJECT_MENU_ICON_COLOR.ai),
    Component: ProjectAiSettings,
  },
  {
    key: "stats",
    label: "统计",
    Icon: createMenuIcon(BarChart3, PROJECT_MENU_ICON_COLOR.stats),
    Component: ProjectStatsSettings,
  },
];

const GIT_MENU = {
  key: "git",
  label: "Git",
  Icon: createMenuIcon(GitBranch, PROJECT_MENU_ICON_COLOR.git),
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
