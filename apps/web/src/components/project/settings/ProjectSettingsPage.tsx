/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { OpenLoafSettingsLayout } from "@openloaf/ui/openloaf/OpenLoafSettingsLayout";
import { OpenLoafSettingsMenu } from "@openloaf/ui/openloaf/OpenLoafSettingsMenu";
import { Bot, Brain, Cpu, GitBranch, SlidersHorizontal, Wand2 } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { cn } from "@/lib/utils";

import { ProjectBasicSettings } from "./menus/ProjectBasicSettings";
import { ProjectAiSettings } from "./menus/ProjectAiSettings";
import { ProjectGitSettings } from "./menus/ProjectGitSettings";
import { ProjectSkillsSettings } from "./menus/ProjectSkillsSettings";
import { ProjectAgentSettings } from "./menus/ProjectAgentSettings";
import { ProjectMemorySettings } from "@/components/setting/menus/MemorySettings";

type ProjectSettingsPanelProps = {
  projectId?: string;
  rootUri?: string;
};

type ProjectSettingsMenuKey = "basic" | "ai" | "memory" | "skills" | "agents" | "git";

const PROJECT_MENU_ICON_COLOR = {
  basic: "text-ol-blue",
  ai: "text-ol-purple",
  memory: "text-ol-green",
  skills: "text-ol-purple",
  agents: "text-ol-green",
  git: "text-ol-green",
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

type SettingsMenuItem = {
  key: ProjectSettingsMenuKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  Component: ComponentType<ProjectSettingsPanelProps>;
};

const ALL_MENU_KEYS: ProjectSettingsMenuKey[] = ["basic", "ai", "memory", "skills", "agents", "git"];
const MENU_KEY_SET = new Set<ProjectSettingsMenuKey>(ALL_MENU_KEYS);

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
  const { t } = useTranslation(["project", "settings"]);
  if (isLoading) return null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-base font-semibold">{t("project:project.settingsHeader")}</span>
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
  const { t } = useTranslation(["project", "settings"]);
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

  const generalGroup = useMemo<SettingsMenuItem[]>(() => [
    {
      key: "basic",
      label: t("settings:menu.basic"),
      Icon: createMenuIcon(SlidersHorizontal, PROJECT_MENU_ICON_COLOR.basic),
      Component: ProjectBasicSettings,
    },
  ], [t]);

  const aiGroup = useMemo<SettingsMenuItem[]>(() => [
    {
      key: "ai",
      label: t("settings:project.tabAI"),
      Icon: createMenuIcon(Cpu, PROJECT_MENU_ICON_COLOR.ai),
      Component: ProjectAiSettings,
    },
    {
      key: "memory",
      label: t("settings:menu.memory"),
      Icon: createMenuIcon(Brain, PROJECT_MENU_ICON_COLOR.memory),
      Component: ProjectMemorySettings,
    },
    {
      key: "skills",
      label: t("settings:menu.skills"),
      Icon: createMenuIcon(Wand2, PROJECT_MENU_ICON_COLOR.skills),
      Component: ProjectSkillsSettings,
    },
    {
      key: "agents",
      label: t("settings:menu.agents"),
      Icon: createMenuIcon(Bot, PROJECT_MENU_ICON_COLOR.agents),
      Component: ProjectAgentSettings,
    },
  ], [t]);

  const gitMenu = useMemo<SettingsMenuItem>(() => ({
    key: "git",
    label: "Git",
    Icon: createMenuIcon(GitBranch, PROJECT_MENU_ICON_COLOR.git),
    Component: ProjectGitSettings,
  }), []);

  const menuGroups = useMemo(() => {
    const topGroup = isGitProject
      ? [...generalGroup, gitMenu]
      : [...generalGroup];
    return [topGroup, aiGroup];
  }, [isGitProject, generalGroup, gitMenu, aiGroup]);
  const allMenuItems = useMemo(() => menuGroups.flat(), [menuGroups]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const collapseRafRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const lastCollapsedRef = useRef<boolean | null>(null);
  const { basic } = useBasicConfig();
  const shouldAnimate = basic.uiAnimationLevel !== "low";

  useEffect(() => {
    if (allMenuItems.some((item) => item.key === activeKey)) return;
    setActiveKey("basic");
  }, [activeKey, allMenuItems]);

  useEffect(() => {
    if (!isProjectSettingsMenuKey(settingsMenu)) return;
    if (settingsMenu === activeKey) return;
    setActiveKey(settingsMenu);
  }, [activeKey, settingsMenu]);

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
      allMenuItems.find((item) => item.key === activeKey)?.Component ?? (() => null),
    [activeKey, allMenuItems]
  );

  return (
    <OpenLoafSettingsLayout
      ref={containerRef}
      isCollapsed={isCollapsed}
      sectionClassName="rounded-2xl  bg-background/70"
      menu={
        <OpenLoafSettingsMenu
          groups={menuGroups}
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
