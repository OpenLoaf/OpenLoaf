"use client";

import * as React from "react";
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
  applyProjectShellToTab,
  type ProjectShellSection,
  exitProjectShellToProjectList,
  isProjectShellSection,
  type ProjectShellState,
} from "@/lib/project-shell";
import { buildProjectHierarchyIndex } from "@/lib/project-tree";
import { resolveProjectModeProjectShell } from "@/lib/project-mode";
import { isProjectWindowMode } from "@/lib/window-mode";
import { useProjects } from "@/hooks/use-projects";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@openloaf/ui/sidebar";
import { SidebarHistory } from "@/components/layout/sidebar/SidebarHistory";
import { ProjectSidebarProjectCard } from "@/components/layout/sidebar/ProjectSidebarProjectCard";

const ACTIVE_CLASS =
  "data-[active=true]:!bg-sidebar-accent data-[active=true]:!text-sidebar-accent-foreground";

const ITEM_CLASS = {
  back:
    `group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-ol-blue/70 hover:[&>svg]:text-ol-blue ${ACTIVE_CLASS}`,
  assistant:
    `group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-ol-amber/70 hover:[&>svg]:text-ol-amber ${ACTIVE_CLASS}`,
  canvas:
    `group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-ol-purple/70 hover:[&>svg]:text-ol-purple ${ACTIVE_CLASS}`,
  index:
    `group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-ol-green/70 hover:[&>svg]:text-ol-green ${ACTIVE_CLASS}`,
  files:
    `group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-ol-blue/70 hover:[&>svg]:text-ol-blue ${ACTIVE_CLASS}`,
  settings:
    `group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-ol-text-auxiliary/70 hover:[&>svg]:text-ol-text-auxiliary ${ACTIVE_CLASS}`,
  history:
    `group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-rose-700/70 dark:[&>svg]:text-rose-300/70 hover:[&>svg]:text-rose-700 dark:hover:[&>svg]:text-rose-200 ${ACTIVE_CLASS}`,
} as const;

const FILE_FOREGROUND_COMPONENTS = new Set([
  "file-viewer",
  "image-viewer",
  "code-viewer",
  "markdown-viewer",
  "pdf-viewer",
  "doc-viewer",
  "sheet-viewer",
  "video-viewer",
  "plate-doc-viewer",
  "streaming-plate-viewer",
  "streaming-code-viewer",
]);

/** Resolve the current project-shell section from the active tab view. */
function resolveActiveProjectSection(
  projectShell: ProjectShellState,
  activeTab: { base?: { component?: string; params?: Record<string, unknown> }; stack?: Array<{ id: string; component: string }>; activeStackItemId?: string },
): ProjectShellSection {
  const foregroundComponent =
    activeTab?.stack?.find((item) => item.id === activeTab.activeStackItemId)?.component ??
    activeTab?.stack?.at(-1)?.component ??
    activeTab?.base?.component;

  if (foregroundComponent === "project-settings-page" || foregroundComponent === "settings-page") {
    return "settings";
  }

  if (foregroundComponent === "board-viewer" || foregroundComponent === "canvas-list-page") {
    return "canvas";
  }

  if (foregroundComponent && FILE_FOREGROUND_COMPONENTS.has(foregroundComponent)) {
    return "files";
  }

  if (activeTab?.base?.component === "plant-page") {
    const baseProjectTab = (activeTab.base.params?.projectTab ?? "") as string;
    if (baseProjectTab === "canvas") return "canvas";
    if (baseProjectTab === "index") return "index";
    if (baseProjectTab === "files") return "files";
    if (baseProjectTab === "tasks") return "history";
  }

  return isProjectShellSection(projectShell.section)
    ? projectShell.section
    : "assistant";
}

export function ProjectSidebar(props: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]! border-r-0!"
      {...props}
    >
      <ProjectSidebarContent />
    </Sidebar>
  );
}

export function ProjectSidebarContent() {
  const { t } = useTranslation(["nav", "settings"]);
  const activeTab = useAppState();
  const { data: projects = [] } = useProjects();
  const projectShell = React.useMemo(
    () => resolveProjectModeProjectShell(activeTab.projectShell),
    [activeTab.projectShell],
  );
  const projectWindowMode = isProjectWindowMode();
  const projectHierarchy = React.useMemo(
    () => buildProjectHierarchyIndex(projects),
    [projects],
  );

  const activeSection = React.useMemo(() => {
    if (!projectShell) return "assistant";
    return resolveActiveProjectSection(projectShell, activeTab);
  }, [activeTab, projectShell]);
  const projectTypeLabel = React.useMemo(() => {
    if (!projectShell) return null;
    const projectType = projectHierarchy.projectById.get(projectShell.projectId)?.projectType ?? "general";
    return t(`project.typeLabel.${projectType}`, { ns: "settings" });
  }, [projectHierarchy.projectById, projectShell, t]);

  const handleSelectSection = React.useCallback(
    (section: ProjectShellSection) => {
      if (!projectShell) return;
      applyProjectShellToTab("main", {
        ...projectShell,
        section,
      });
    },
    [projectShell],
  );

  const handleBack = React.useCallback(() => {
    exitProjectShellToProjectList(
      "main",
      t("sidebarProjectSpace"),
      PROJECT_LIST_TAB_INPUT.icon,
    );
  }, [t]);

  if (!projectShell) return null;

  return (
    <>
      <SidebarHeader className="gap-2">
        {!projectWindowMode ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="default"
                tooltip={t("projectSidebar.backToProjectSpace")}
                className={`${ITEM_CLASS.back} h-12 rounded-lg px-1.5 py-3`}
                onClick={handleBack}
                type="button"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="flex-1 truncate">
                  {t("projectSidebar.backToProjectSpace")}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={t("projectSidebar.assistant")}
              className={ITEM_CLASS.assistant}
              isActive={activeSection === "assistant"}
              onClick={() => handleSelectSection("assistant")}
              type="button"
            >
              <Sparkles className="h-4 w-4" />
              <span className="flex-1 truncate">{t("projectSidebar.assistant")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={t("projectSidebar.canvas")}
              className={ITEM_CLASS.canvas}
              isActive={activeSection === "canvas"}
              onClick={() => handleSelectSection("canvas")}
              type="button"
            >
              <Palette className="h-4 w-4" />
              <span className="flex-1 truncate">{t("projectSidebar.canvas")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={t("projectSidebar.board")}
              className={ITEM_CLASS.index}
              isActive={activeSection === "index"}
              onClick={() => handleSelectSection("index")}
              type="button"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="flex-1 truncate">{t("projectSidebar.board")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={t("projectSidebar.files")}
              className={ITEM_CLASS.files}
              isActive={activeSection === "files"}
              onClick={() => handleSelectSection("files")}
              type="button"
            >
              <Folder className="h-4 w-4" />
              <span className="flex-1 truncate">{t("projectSidebar.files")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={t("projectSidebar.history")}
              className={ITEM_CLASS.history}
              isActive={activeSection === "history"}
              onClick={() => handleSelectSection("history")}
              type="button"
            >
              <History className="h-4 w-4" />
              <span className="flex-1 truncate">{t("projectSidebar.history")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="flex flex-col overflow-hidden">
        <div
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
          style={
            {
              "--sidebar-accent": "var(--sidebar-project-accent)",
              "--sidebar-accent-foreground": "var(--sidebar-project-accent-fg)",
            } as React.CSSProperties
          }
        >
          <SidebarHistory projectId={projectShell.projectId} />
        </div>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <ProjectSidebarProjectCard
              title={projectShell.title}
              icon={projectShell.icon}
              subtitle={projectTypeLabel}
            />
          </div>
          <SidebarMenu className="w-auto">
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={t("projectSidebar.settings")}
                className={`${ITEM_CLASS.settings} h-12 w-12 justify-center p-0`}
                isActive={activeSection === "settings"}
                onClick={() => handleSelectSection("settings")}
                type="button"
              >
                <Settings className="h-4 w-4" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
    </>
  );
}
