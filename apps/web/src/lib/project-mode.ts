"use client";

import {
  getProjectWindowBootstrapPayload,
  type ProjectWindowBootstrapPayload,
} from "./window-mode";
import type { ProjectShellSection, ProjectShellState } from "./project-shell";

/** Build project-shell state from one project-window bootstrap payload. */
export function buildProjectShellStateFromWindowPayload(
  payload: ProjectWindowBootstrapPayload,
  section: ProjectShellSection = "canvas",
): ProjectShellState {
  return {
    projectId: payload.projectId,
    rootUri: payload.rootUri,
    title: payload.title,
    icon: payload.icon,
    section,
  };
}

/** Resolve the current project-mode shell from tab metadata or window bootstrap context. */
export function resolveProjectModeProjectShell(
  projectShell?: ProjectShellState | null,
  fallbackSection: ProjectShellSection = "canvas",
): ProjectShellState | null {
  if (projectShell) return projectShell;
  const payload = getProjectWindowBootstrapPayload();
  if (!payload) return null;
  return buildProjectShellStateFromWindowPayload(payload, fallbackSection);
}

/** Return true when the current renderer should behave as project mode. */
export function isProjectMode(projectShell?: ProjectShellState | null) {
  return Boolean(resolveProjectModeProjectShell(projectShell));
}
