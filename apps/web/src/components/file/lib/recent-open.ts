/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { getWorkspaceIdFromCookie } from "@/components/board/core/boardSession";
import type { FileSystemEntry } from "@/components/project/filesystem/utils/file-system-utils";
import { useTabs } from "@/hooks/use-tabs";

export const RECENT_OPEN_EVENT = "openloaf:recent-open";

export type RecentOpenItem = {
  /** Project id for the entry. */
  projectId?: string | null;
  /** Relative uri for the entry. */
  fileUri: string;
  /** Display name of the entry. */
  fileName: string;
  /** Entry kind for rendering. */
  kind: "file";
  /** Optional file extension. */
  ext?: string | null;
  /** Last opened timestamp (ms). */
  openedAt: number;
};

type RecentOpenStore = {
  /** Workspace-level recent entries. */
  workspace: RecentOpenItem[];
  /** Project-level recent entries. */
  projects: Record<string, RecentOpenItem[]>;
};

type RecordRecentOpenInput = {
  /** Current tab id for workspace resolution. */
  tabId?: string | null;
  /** Explicit workspace id. */
  workspaceId?: string | null;
  /** Project id for the entry. */
  projectId?: string | null;
  /** Entry payload. */
  entry: FileSystemEntry;
  /** Max items to keep. */
  maxItems?: number;
};

/** Build the storage key for a workspace. */
function buildStorageKey(workspaceId: string): string {
  return `openloaf:recent-open:${workspaceId}`;
}

/** Resolve workspace id from tab or cookies. */
function resolveWorkspaceId(input: {
  tabId?: string | null;
  workspaceId?: string | null;
}): string | null {
  if (input.workspaceId) return input.workspaceId;
  if (input.tabId) {
    const tab = useTabs.getState().getTabById(input.tabId);
    if (tab?.workspaceId) return tab.workspaceId;
  }
  return getWorkspaceIdFromCookie();
}

/** Safely read the recent-open store. */
function readStore(workspaceId: string): RecentOpenStore {
  if (typeof window === "undefined") {
    return { workspace: [], projects: {} };
  }
  const raw = window.localStorage.getItem(buildStorageKey(workspaceId));
  if (!raw) return { workspace: [], projects: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<RecentOpenStore>;
    return {
      workspace: Array.isArray(parsed.workspace) ? parsed.workspace : [],
      projects: parsed.projects && typeof parsed.projects === "object" ? parsed.projects : {},
    };
  } catch {
    return { workspace: [], projects: {} };
  }
}

/** Persist the recent-open store to localStorage. */
function writeStore(workspaceId: string, store: RecentOpenStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(buildStorageKey(workspaceId), JSON.stringify(store));
}

/** Build a unique key for de-duplication. */
function buildItemKey(item: RecentOpenItem): string {
  return `${item.projectId ?? "workspace"}:${item.fileUri}`;
}

/** Record a file open event into the recent list. */
export function recordRecentOpen(input: RecordRecentOpenInput): void {
  if (typeof window === "undefined") return;
  if (input.entry.kind !== "file") return;
  const fileUri = input.entry.uri?.trim();
  if (!fileUri) return;
  const projectId = input.projectId?.trim();
  if (!projectId) return;

  const workspaceId = resolveWorkspaceId({
    tabId: input.tabId,
    workspaceId: input.workspaceId,
  });
  if (!workspaceId) return;

  const maxItems = input.maxItems ?? 5;
  const store = readStore(workspaceId);
  const item: RecentOpenItem = {
    projectId,
    fileUri,
    fileName: input.entry.name || fileUri.split("/").pop() || fileUri,
    kind: "file",
    ext: input.entry.ext ?? null,
    openedAt: Date.now(),
  };

  // 逻辑：同一文件重复打开时置顶，避免重复项。
  const nextWorkspace = [
    item,
    ...store.workspace.filter((existing) => buildItemKey(existing) !== buildItemKey(item)),
  ].slice(0, maxItems);
  store.workspace = nextWorkspace;

  const projectList = store.projects[projectId] ?? [];
  const nextProjectList = [
    item,
    ...projectList.filter((existing) => buildItemKey(existing) !== buildItemKey(item)),
  ].slice(0, maxItems);
  store.projects[projectId] = nextProjectList;

  writeStore(workspaceId, store);
  window.dispatchEvent(
    new CustomEvent(RECENT_OPEN_EVENT, { detail: { workspaceId } }),
  );
}

/** Read recent entries for workspace and project scopes. */
export function getRecentOpens(input: {
  workspaceId?: string | null;
  projectId?: string | null;
  limit?: number;
}): { workspace: RecentOpenItem[]; project: RecentOpenItem[] } {
  if (typeof window === "undefined") {
    return { workspace: [], project: [] };
  }
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) return { workspace: [], project: [] };
  const store = readStore(workspaceId);
  const limit = input.limit ?? 5;
  const workspaceItems = store.workspace.slice(0, limit);
  const projectItems = input.projectId
    ? (store.projects[input.projectId] ?? []).slice(0, limit)
    : [];
  return { workspace: workspaceItems, project: projectItems };
}
