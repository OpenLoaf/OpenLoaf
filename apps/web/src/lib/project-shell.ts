"use client";

import { PROJECT_LIST_TAB_INPUT } from "@openloaf/api/common";
import { useNavigation } from "@/hooks/use-navigation";
import { useProjectLayout } from "@/hooks/use-project-layout";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";

export const PROJECT_SHELL_SECTIONS = [
  "assistant",
  "canvas",
  "index",
  "files",
  "history",
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

/** Return true when the value is a supported project-shell section. */
export function isProjectShellSection(value: unknown): value is ProjectShellSection {
  return (
    typeof value === "string" &&
    (PROJECT_SHELL_SECTIONS as readonly string[]).includes(value)
  );
}

/** Build the left-dock base item for one project-shell section. */
export function buildProjectShellBase(
  input: ProjectShellState,
): { id: string; component: string; params?: Record<string, unknown> } {
  return {
    id: `project-shell:${input.projectId}`,
    component: "project-shell",
    params: {
      projectId: input.projectId,
      rootUri: input.rootUri,
      section: input.section,
    },
  };
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

  const nextLeftWidth =
    layout.leftWidthPercent && layout.leftWidthPercent > 0
      ? layout.leftWidthPercent
      : savedLayout?.leftWidthPercent ?? 90;
  layout.setLeftWidthPercent(nextLeftWidth);

  const nextRightCollapsed =
    layout.base && typeof layout.rightChatCollapsed === "boolean"
      ? layout.rightChatCollapsed
      : savedLayout?.rightChatCollapsed ?? false;
  layout.setRightChatCollapsed(nextRightCollapsed);

  useNavigation.getState().setActiveProject(input.projectId);
}

/** Open or focus a project-shell view in the current renderer. */
export function openProjectShell(input: ProjectShellInput) {
  const section = input.section ?? "assistant";
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
  const leftWidthPercent = savedLayout?.leftWidthPercent ?? 90;

  useAppView.getState().navigate({
    title: input.title,
    icon: input.icon ?? undefined,
    base,
    leftWidthPercent,
    rightChatCollapsed: savedLayout?.rightChatCollapsed ?? false,
    chatParams: { projectId: input.projectId },
    projectShell: resolved,
  });

  useNavigation.getState().setActiveProject(input.projectId);
  return "main";
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

  useNavigation.getState().setActiveView("project-list");
}
