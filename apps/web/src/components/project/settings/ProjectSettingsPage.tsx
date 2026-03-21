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

import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { OpenLoafSettingsLayout } from "@openloaf/ui/openloaf/OpenLoafSettingsLayout";
import { OpenLoafSettingsMenu } from "@openloaf/ui/openloaf/OpenLoafSettingsMenu";
import { Bot, Brain, Cpu, GitBranch, SlidersHorizontal, Wand2 } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useTabActive } from "@/components/layout/TabActiveContext";
import { useAppState } from "@/hooks/use-app-state";
import { useLayoutState } from "@/hooks/use-layout-state";
import { cn } from "@/lib/utils";
import ProjectTabs, { type ProjectTabValue } from "@/components/project/ProjectTabs";
import { openProjectShellTab } from "@/lib/project-shell";
import {
  readPersistedSettingsMenu,
  writePersistedSettingsMenu,
} from "@/lib/settings-menu-storage";

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
  basic: "text-foreground",
  ai: "text-foreground",
  memory: "text-foreground",
  skills: "text-foreground",
  agents: "text-foreground",
  git: "text-foreground",
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

/** Normalize persisted project settings menu keys to current supported values. */
function normalizeProjectSettingsMenuKey(
  value: unknown,
): ProjectSettingsMenuKey | null {
  return isProjectSettingsMenuKey(value) ? value : null;
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
  const { t } = useTranslation(["project", "settings", "nav"]);
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
  tabId?: string;
  projectId?: string;
  rootUri?: string;
  settingsMenu?: ProjectSettingsMenuKey;
  showProjectTabs?: boolean;
};

/** Project settings page. */
export default function ProjectSettingsPage({
  tabId,
  projectId,
  rootUri,
  settingsMenu,
  showProjectTabs = true,
}: ProjectSettingsPageProps) {
  const { t } = useTranslation(["project", "settings", "nav"]);
  const tabActive = useTabActive();
  const appState = useAppState();
  const setBaseParams = useLayoutState((s) => s.setBaseParams);
  const [activeKey, setActiveKey] = useState<ProjectSettingsMenuKey>(() =>
    normalizeProjectSettingsMenuKey(settingsMenu)
      ?? normalizeProjectSettingsMenuKey(readPersistedSettingsMenu("project"))
      ?? "basic"
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
  const pageTitle =
    appState.projectShell?.title
    ?? appState.title
    ?? projectId
    ?? t("nav:panelTitle.plant-page");
  const pageIcon = appState.projectShell?.icon ?? appState.icon ?? null;
  const resolvedRootUri = rootUri ?? appState.projectShell?.rootUri ?? "";

  useEffect(() => {
    if (allMenuItems.some((item) => item.key === activeKey)) return;
    setActiveKey("basic");
  }, [activeKey, allMenuItems]);

  useEffect(() => {
    const normalizedMenu = normalizeProjectSettingsMenuKey(settingsMenu);
    if (!normalizedMenu) return;
    if (normalizedMenu === activeKey) return;
    setActiveKey(normalizedMenu);
  }, [activeKey, settingsMenu]);

  useEffect(() => {
    writePersistedSettingsMenu("project", activeKey);
    if (!tabId) return;
    if (settingsMenu === activeKey) return;
    // 中文注释：项目设置也把当前菜单写回 project base params，确保刷新后仍然定位到同一子设置页。
    setBaseParams({ settingsMenu: activeKey });
  }, [activeKey, setBaseParams, settingsMenu, tabId]);

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

  /** Navigate from settings back to one project tab. */
  const handleProjectTabChange = useCallback(
    (nextTab: ProjectTabValue) => {
      if (!projectId) return;
      if (nextTab === "settings") return;

      openProjectShellTab({
        projectId,
        rootUri: resolvedRootUri,
        title: pageTitle,
        icon: pageIcon,
        tab: nextTab,
      });
    },
    [projectId, resolvedRootUri, pageTitle, pageIcon],
  );

  const settingsLayout = (
    <OpenLoafSettingsLayout
      ref={containerRef}
      isCollapsed={isCollapsed}
      sectionClassName="rounded-2xl bg-background/70"
      contentInnerClassName={
        showProjectTabs
          ? "h-full min-h-0 pl-3 pr-1 pt-2 pb-16"
          : "h-full min-h-0 pl-3 pr-1 pt-2"
      }
      menu={
        <OpenLoafSettingsMenu
          groups={menuGroups}
          activeKey={activeKey}
          isCollapsed={isCollapsed}
          onChange={(key) => {
            const nextKey = key as ProjectSettingsMenuKey;
            setActiveKey(nextKey);
            writePersistedSettingsMenu("project", nextKey);
            if (!tabId) return;
            setBaseParams({ settingsMenu: nextKey });
          }}
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
          <ActiveComponent projectId={projectId} rootUri={resolvedRootUri} />
        </div>
      }
    />
  );

  if (!showProjectTabs) {
    return settingsLayout;
  }

  return (
    <div className="project-shell flex h-full w-full min-h-0 flex-col">
      <ProjectTabs
        value="settings"
        onValueChange={handleProjectTabChange}
        isActive={tabActive}
        revealDelayMs={200}
        size="md"
        tabId={tabId}
      />
      {settingsLayout}
    </div>
  );
}
