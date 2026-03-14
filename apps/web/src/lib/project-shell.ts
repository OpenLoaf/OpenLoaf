"use client";

import type { DockItem } from "@openloaf/api/common";
import { PROJECT_LIST_TAB_INPUT } from "@openloaf/api/common";
import { useProjectLayout } from "@/hooks/use-project-layout";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";

export const PROJECT_SHELL_SECTIONS = [
  "assistant",
  "canvas",
  "index",
  "files",
  "history",
  "scheduled",
  "settings",
] as const;

export type ProjectShellSection = (typeof PROJECT_SHELL_SECTIONS)[number];

export type ProjectShellState = {
  projectId: string;
  rootUri: string;
  title: string;
  icon?: string | null;
  section: ProjectShellSection;
};

type ProjectShellInput = Omit<ProjectShellState, "section"> & {
  section?: ProjectShellSection;
};

export type OpenProjectSettingsPageInput = Omit<ProjectShellState, "section">;

export type ProjectShellPageTab =
  | "index"
  | "files"
  | "canvas"
  | "tasks"
  | "scheduled"
  | "settings";

export type OpenProjectShellTabInput = Omit<ProjectShellState, "section"> & {
  tab: ProjectShellPageTab;
  baseParams?: Record<string, unknown>;
};

/** Return true when the value is a supported project-shell section. */
export function isProjectShellSection(value: unknown): value is ProjectShellSection {
  return (
    typeof value === "string" &&
    (PROJECT_SHELL_SECTIONS as readonly string[]).includes(value)
  );
}

/** Resolve project-shell section from one plant-page tab value. */
export function resolveProjectShellSectionFromProjectTab(
  projectTab: string | null | undefined,
): ProjectShellSection | null {
  switch (projectTab?.trim()) {
    case "index":
      return "index";
    case "files":
      return "files";
    case "canvas":
      return "canvas";
    case "tasks":
      return "history";
    case "scheduled":
      return "scheduled";
    case "settings":
      return "settings";
    default:
      return null;
  }
}

/** Build project-shell state from the current plant-page base when metadata is missing. */
export function buildProjectShellStateFromBase(input: {
  base?: DockItem;
  title?: string;
  icon?: string | null;
}): ProjectShellState | null {
  if (input.base?.component !== "plant-page") return null;

  const params = (input.base.params ?? {}) as Record<string, unknown>;
  const projectId =
    typeof params.projectId === "string" ? params.projectId.trim() : "";
  const rootUri = typeof params.rootUri === "string" ? params.rootUri.trim() : "";
  const section = resolveProjectShellSectionFromProjectTab(
    typeof params.projectTab === "string" ? params.projectTab : "",
  );

  if (!projectId || !rootUri || !section) return null;

  return {
    projectId,
    rootUri,
    title: input.title?.trim() || projectId,
    icon: input.icon ?? null,
    section,
  };
}

function applyProjectShellTabBaseParams(input: {
  tab: ProjectShellPageTab;
  baseParams?: Record<string, unknown>;
}) {
  if (!input.baseParams || Object.keys(input.baseParams).length === 0) return;
  useLayoutState.getState().setBaseParams({
    projectTab: input.tab,
    ...input.baseParams,
  });
}

/** Build the left-dock base item for one project-shell section. */
export function buildProjectShellBase(
  input: ProjectShellState,
): { id: string; component: string; params?: Record<string, unknown> } | undefined {
  switch (input.section) {
    case "assistant":
      return undefined;
    case "settings":
      return {
        id: `project:${input.projectId}`,
        component: "plant-page",
        params: {
          projectId: input.projectId,
          rootUri: input.rootUri,
          projectTab: "settings",
        },
      };
    case "history":
      return {
        id: `project:${input.projectId}`,
        component: "plant-page",
        params: {
          projectId: input.projectId,
          rootUri: input.rootUri,
          projectTab: "tasks",
        },
      };
    case "scheduled":
      return {
        id: `project:${input.projectId}`,
        component: "plant-page",
        params: {
          projectId: input.projectId,
          rootUri: input.rootUri,
          projectTab: "scheduled",
        },
      };
    case "canvas":
    case "index":
    case "files":
      return {
        id: `project:${input.projectId}`,
        component: "plant-page",
        params: {
          projectId: input.projectId,
          rootUri: input.rootUri,
          projectTab: input.section,
        },
      };
    default:
      return undefined;
  }
}

/** Find whether the current view is a project-shell for the given project. */
export function findProjectShellTab(projectId: string) {
  const state = useAppView.getState()
  if (state.projectShell?.projectId === projectId) return true
  return false
}

/** Apply one project-shell section onto the current view. */
export function applyProjectShellToTab(_tabId: string, input: ProjectShellState) {
  const view = useAppView.getState();
  const layout = useLayoutState.getState();
  const savedLayout = useProjectLayout
    .getState()
    .getProjectLayout(input.projectId);
  const base = buildProjectShellBase(input);

  view.setTitle(input.title);
  view.setIcon(input.icon ?? undefined);
  view.setProjectShell(input);
  view.setChatParams({ projectId: input.projectId });

  layout.clearStack();
  layout.setBase(base);

  if (base) {
    const nextLeftWidth =
      layout.leftWidthPercent && layout.leftWidthPercent > 0
        ? layout.leftWidthPercent
        : savedLayout?.leftWidthPercent ?? 90;
    layout.setLeftWidthPercent(nextLeftWidth);

    const nextRightCollapsed =
      layout.base && typeof layout.rightChatCollapsed === "boolean"
        ? layout.rightChatCollapsed
        : savedLayout?.rightChatCollapsed ?? true;
    layout.setRightChatCollapsed(nextRightCollapsed);
  }
}

/** Open or focus a project-shell view in the current renderer. */
export function openProjectShell(input: ProjectShellInput) {
  const section = input.section ?? "index";
  const resolved: ProjectShellState = { ...input, section };
  const isCurrentProject = findProjectShellTab(input.projectId);

  if (isCurrentProject) {
    applyProjectShellToTab("main", resolved);
    return "main";
  }

  const savedLayout = useProjectLayout
    .getState()
    .getProjectLayout(input.projectId);
  const base = buildProjectShellBase(resolved);
  const leftWidthPercent = base
    ? savedLayout?.leftWidthPercent ?? 90
    : 0;

  useAppView.getState().navigate({
    title: input.title,
    icon: input.icon ?? undefined,
    base,
    leftWidthPercent,
    rightChatCollapsed: base ? savedLayout?.rightChatCollapsed ?? true : false,
    chatParams: { projectId: input.projectId },
    projectShell: resolved,
  });
  return "main";
}

/** Open one project-shell tab and apply any extra base params in one place. */
export function openProjectShellTab(input: OpenProjectShellTabInput) {
  const section = resolveProjectShellSectionFromProjectTab(input.tab);
  if (!section) return null;

  const tabId = openProjectShell({
    projectId: input.projectId,
    rootUri: input.rootUri,
    title: input.title,
    icon: input.icon,
    section,
  });

  applyProjectShellTabBaseParams({
    tab: input.tab,
    baseParams: input.baseParams,
  });

  return tabId;
}

/** Switch the current project-shell tab using the active project context. */
export function openCurrentProjectShellTab(input: {
  tab: ProjectShellPageTab;
  baseParams?: Record<string, unknown>;
}) {
  const view = useAppView.getState();
  const layout = useLayoutState.getState();
  const currentProjectShell =
    view.projectShell ??
    buildProjectShellStateFromBase({
      base: layout.base,
      title: view.title,
      icon: view.icon,
    });

  if (!currentProjectShell) return null;

  return openProjectShellTab({
    projectId: currentProjectShell.projectId,
    rootUri: currentProjectShell.rootUri,
    title: currentProjectShell.title,
    icon: currentProjectShell.icon ?? undefined,
    tab: input.tab,
    baseParams: input.baseParams,
  });
}

/** Open project settings as the current project-shell page. */
export function openProjectSettingsPage(input: OpenProjectSettingsPageInput) {
  return openProjectShell({
    ...input,
    section: "settings",
  });
}

/** Exit the project-shell context and return to the project-space list in-place. */
export function exitProjectShellToProjectList(_tabId: string, title: string, icon: string) {
  const view = useAppView.getState();
  const layout = useLayoutState.getState();

  view.setProjectShell(null);
  view.setChatParams({ projectId: null });
  view.setTitle(title);
  view.setIcon(icon);

  layout.clearStack();
  layout.setBase({
    id: PROJECT_LIST_TAB_INPUT.baseId,
    component: PROJECT_LIST_TAB_INPUT.component,
  });
  layout.setLeftWidthPercent(100);
  layout.setRightChatCollapsed(true);
}
