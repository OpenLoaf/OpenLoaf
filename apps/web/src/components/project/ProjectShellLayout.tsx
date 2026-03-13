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

import { useCallback, useMemo, useState, useRef, useEffect, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Folder,
  History,
  LayoutDashboard,
  Palette,
  Settings,
  Sparkles,
} from "lucide-react";
import { PROJECT_LIST_TAB_INPUT } from "@openloaf/api/common";
import { useAppState } from "@/hooks/use-app-state";
import {
  type ProjectShellSection,
  exitProjectShellToProjectList,
  isProjectShellSection,
  type ProjectShellState,
} from "@/lib/project-shell";
import { buildProjectHierarchyIndex } from "@/lib/project-tree";
import { resolveProjectModeProjectShell } from "@/lib/project-mode";
import { isProjectWindowMode } from "@/lib/window-mode";
import { useProjects } from "@/hooks/use-projects";
import { ProjectSidebarProjectCard } from "@/components/layout/sidebar/ProjectSidebarProjectCard";
import { OpenLoafSettingsLayout } from "@openloaf/ui/openloaf/OpenLoafSettingsLayout";
import {
  OpenLoafSettingsMenu,
  type OpenLoafSettingsMenuItem,
} from "@openloaf/ui/openloaf/OpenLoafSettingsMenu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@openloaf/ui/tooltip";
import { cn } from "@/lib/utils";
import { useGlobalOverlay } from "@/lib/globalShortcuts";

const LazyProjectPage = lazy(() => import("@/components/project/Project"));
const LazyProjectSettingsPage = lazy(() => import("@/components/project/settings/ProjectSettingsPage"));
const LazyCanvasListPage = lazy(() => import("@/components/board/CanvasListPage"));

const SECTION_ICON_COLOR = {
  back: "text-ol-blue",
  assistant: "text-ol-amber",
  canvas: "text-ol-purple",
  index: "text-ol-green",
  files: "text-ol-blue",
  history: "text-rose-600 dark:text-rose-300",
  settings: "text-muted-foreground",
} as const;

type SectionDef = {
  key: ProjectShellSection;
  labelKey: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
};

const SECTIONS: SectionDef[] = [
  { key: "assistant", labelKey: "projectSidebar.assistant", Icon: Sparkles, color: SECTION_ICON_COLOR.assistant },
  { key: "canvas", labelKey: "projectSidebar.canvas", Icon: Palette, color: SECTION_ICON_COLOR.canvas },
  { key: "index", labelKey: "projectSidebar.board", Icon: LayoutDashboard, color: SECTION_ICON_COLOR.index },
  { key: "files", labelKey: "projectSidebar.files", Icon: Folder, color: SECTION_ICON_COLOR.files },
  { key: "history", labelKey: "projectSidebar.history", Icon: History, color: SECTION_ICON_COLOR.history },
];

const FILE_FOREGROUND_COMPONENTS = new Set([
  "file-viewer", "image-viewer", "code-viewer", "markdown-viewer",
  "pdf-viewer", "doc-viewer", "sheet-viewer", "video-viewer",
  "plate-doc-viewer", "streaming-plate-viewer", "streaming-code-viewer",
]);

function resolveActiveProjectSection(
  projectShell: ProjectShellState,
  activeTab: { base?: { component?: string; params?: Record<string, unknown> }; stack?: Array<{ id: string; component: string }>; activeStackItemId?: string },
): ProjectShellSection {
  const foregroundComponent =
    activeTab?.stack?.find((item) => item.id === activeTab.activeStackItemId)?.component ??
    activeTab?.stack?.at(-1)?.component ??
    activeTab?.base?.component;

  if (foregroundComponent === "project-settings-page" || foregroundComponent === "settings-page") return "settings";
  if (foregroundComponent === "board-viewer" || foregroundComponent === "canvas-list-page") return "canvas";
  if (foregroundComponent && FILE_FOREGROUND_COMPONENTS.has(foregroundComponent)) return "files";

  if (activeTab?.base?.component === "plant-page") {
    const baseProjectTab = (activeTab.base.params?.projectTab ?? "") as string;
    if (baseProjectTab === "canvas") return "canvas";
    if (baseProjectTab === "index") return "index";
    if (baseProjectTab === "files") return "files";
    if (baseProjectTab === "tasks") return "history";
  }

  return isProjectShellSection(projectShell.section) ? projectShell.section : "assistant";
}

interface ProjectShellLayoutProps {
  tabId?: string;
  projectId?: string;
  rootUri?: string;
  section?: string;
  [key: string]: unknown;
}

export default function ProjectShellLayout({
  tabId,
  projectId,
  rootUri,
  section: sectionParam,
}: ProjectShellLayoutProps) {
  const { t } = useTranslation(["nav", "settings"]);
  const activeTab = useAppState();
  const { data: projects = [] } = useProjects();
  const projectShell = useMemo(
    () => resolveProjectModeProjectShell(activeTab.projectShell),
    [activeTab.projectShell],
  );
  const projectWindowMode = isProjectWindowMode();
  const projectHierarchy = useMemo(
    () => buildProjectHierarchyIndex(projects),
    [projects],
  );

  const activeSection = useMemo(() => {
    if (!projectShell) return (isProjectShellSection(sectionParam) ? sectionParam : "assistant") as ProjectShellSection;
    return resolveActiveProjectSection(projectShell, activeTab);
  }, [activeTab, projectShell, sectionParam]);

  const projectTypeLabel = useMemo(() => {
    const pid = projectShell?.projectId ?? projectId;
    if (!pid) return null;
    const projectType = projectHierarchy.projectById.get(pid)?.projectType ?? "general";
    return t(`project.typeLabel.${projectType}`, { ns: "settings" });
  }, [projectHierarchy.projectById, projectShell, projectId, t]);

  const handleSelectSection = useCallback(
    (nextSection: ProjectShellSection) => {
      if (!projectShell) return;
      // Import dynamically to avoid circular deps
      import("@/lib/project-shell").then(({ applyProjectShellToTab }) => {
        applyProjectShellToTab("main", { ...projectShell, section: nextSection });
      });
    },
    [projectShell],
  );

  const handleBack = useCallback(() => {
    exitProjectShellToProjectList(
      "main",
      t("sidebarProjectSpace"),
      PROJECT_LIST_TAB_INPUT.icon,
    );
  }, [t]);

  const handleOpenSettings = useCallback(() => {
    const pid = projectShell?.projectId ?? projectId;
    const uri = projectShell?.rootUri ?? rootUri;
    useGlobalOverlay.getState().setProjectSettingsOpen(true, pid, uri);
  }, [projectShell, projectId, rootUri]);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let rafId: number | null = null;
    let lastCollapsed: boolean | null = null;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width == null) return;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const next = width < 500;
        if (lastCollapsed === next) return;
        lastCollapsed = next;
        setIsCollapsed(next);
      });
    });
    observer.observe(container);
    const initWidth = container.getBoundingClientRect().width;
    const initCollapsed = initWidth < 500;
    lastCollapsed = initCollapsed;
    setIsCollapsed(initCollapsed);
    return () => {
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // Build menu items
  const menuItems: OpenLoafSettingsMenuItem[] = useMemo(() => {
    return SECTIONS.map((s) => ({
      key: s.key,
      label: t(s.labelKey),
      Icon: function SectionIcon({ className }: { className?: string }) {
        return <s.Icon className={cn(s.color, className)} />;
      },
    }));
  }, [t]);

  const menuGroups = useMemo(() => [menuItems], [menuItems]);

  const shellTitle = projectShell?.title ?? "";
  const shellIcon = projectShell?.icon;

  // Render content based on active section
  const sectionContent = useMemo(() => {
    const pid = projectShell?.projectId ?? projectId;
    const uri = projectShell?.rootUri ?? rootUri;
    if (!pid || !uri) return null;

    switch (activeSection) {
      case "assistant":
        return (
          <div className="flex h-full items-center justify-center text-muted-foreground/50">
            <Sparkles className="h-8 w-8" />
          </div>
        );
      case "canvas":
        return (
          <Suspense fallback={null}>
            <LazyCanvasListPage tabId={tabId ?? ""} panelKey="project-canvas" projectId={pid} />
          </Suspense>
        );
      case "settings":
        return (
          <Suspense fallback={null}>
            <LazyProjectSettingsPage projectId={pid} rootUri={uri} />
          </Suspense>
        );
      case "index":
      case "files":
      case "history":
        return (
          <Suspense fallback={null}>
            <LazyProjectPage
              tabId={tabId}
              projectId={pid}
              rootUri={uri}
              projectTab={activeSection === "history" ? "tasks" : activeSection}
            />
          </Suspense>
        );
      default:
        return null;
    }
  }, [activeSection, projectShell, projectId, rootUri, tabId]);

  return (
    <OpenLoafSettingsLayout
      ref={containerRef}
      isCollapsed={isCollapsed}
      menuWidth={180}
      collapsedMenuWidth={52}
      contentInnerClassName="p-0"
      menu={
        <div className="flex h-full flex-col">
          {!projectWindowMode && (
            <div className="shrink-0 px-2 pt-2 pb-1">
              <button
                type="button"
                onClick={handleBack}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ol-blue hover:bg-ol-blue-bg transition-colors"
              >
                <ArrowLeft className={cn("h-4 w-4", SECTION_ICON_COLOR.back)} />
                {!isCollapsed && <span className="truncate">{t("projectSidebar.backToProjectSpace")}</span>}
              </button>
            </div>
          )}
          <div className="flex-1 min-h-0">
            <OpenLoafSettingsMenu
              groups={menuGroups}
              activeKey={activeSection}
              isCollapsed={isCollapsed}
              onChange={(key) => handleSelectSection(key as ProjectShellSection)}
              renderItemWrapper={(item, button) => {
                if (!isCollapsed) return button;
                return (
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }}
            />
          </div>
          <div className="shrink-0 border-t border-border/40 px-2 py-2">
            {!isCollapsed ? (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <ProjectSidebarProjectCard
                    title={shellTitle}
                    icon={shellIcon}
                    subtitle={projectTypeLabel}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleOpenSettings}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 transition-colors"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleOpenSettings}
                    className="flex w-full items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted/60 transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{t("projectSidebar.settings")}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      }
      content={
        <div className="h-full min-h-0">
          {sectionContent}
        </div>
      }
    />
  );
}
