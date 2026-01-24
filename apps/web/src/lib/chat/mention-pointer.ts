"use client";

import type { PointerEvent } from "react";
import {
  buildUriFromRoot,
  parseScopedProjectPath,
  type FileSystemEntry,
} from "@/components/project/filesystem/utils/file-system-utils";
import { openFilePreview } from "@/components/file/lib/open-file";
import { queryClient, trpc } from "@/utils/trpc";

/** Shape of the project tree data used for root uri resolution. */
type ProjectTreeNode = {
  projectId?: string;
  rootUri?: string;
  title?: string;
  children?: ProjectTreeNode[];
};

/** Dependencies for mention pointer handling. */
type MentionPointerDownOptions = {
  activeTabId?: string | null;
  workspaceId?: string;
  projectId?: string;
  projects: ProjectTreeNode[];
  pushStackItem: (tabId: string, item: any) => void;
};

type MentionFileRef = {
  projectId: string;
  relativePath: string;
  lineStart?: string;
  lineEnd?: string;
};

/** Resolve the project root uri from a project tree. */
export function resolveProjectRootUri(projects: ProjectTreeNode[], projectId: string): string {
  const queue = [...projects];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    if (node.projectId === projectId && typeof node.rootUri === "string") {
      return node.rootUri;
    }
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      queue.push(child);
    }
  }
  return "";
}

/** Resolve the project title from a project tree. */
function resolveProjectTitle(projects: ProjectTreeNode[], projectId: string): string {
  const queue = [...projects];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    if (node.projectId === projectId && typeof node.title === "string") {
      return node.title;
    }
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      queue.push(child);
    }
  }
  return "";
}

/** Fetch filesystem metadata for a mention target. */
async function fetchMentionEntry(input: {
  workspaceId: string;
  projectId?: string;
  uri: string;
}): Promise<FileSystemEntry | null> {
  try {
    return (await queryClient.fetchQuery(
      trpc.fs.stat.queryOptions({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        uri: input.uri,
      })
    )) as FileSystemEntry;
  } catch {
    return null;
  }
}

/** Parse a mention value into a project file reference. */
function parseMentionFileRef(value: string, defaultProjectId?: string): MentionFileRef | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const match = normalized.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = match?.[1] ?? normalized;
  const parsed = parseScopedProjectPath(baseValue);
  const projectId = parsed?.projectId ?? defaultProjectId;
  if (!projectId || !parsed?.relativePath) return null;
  return {
    projectId,
    relativePath: parsed.relativePath,
    lineStart: match?.[2],
    lineEnd: match?.[3],
  };
}

/** Handle pointer down on file mentions to open the viewer stack. */
export function handleChatMentionPointerDown(
  event: PointerEvent<HTMLElement>,
  options: MentionPointerDownOptions
) {
  const { activeTabId, workspaceId, projectId: defaultProjectId, projects, pushStackItem } =
    options;
  if (!activeTabId) return;
  if (!workspaceId) return;
  const target = event.target as HTMLElement | null;
  if (!target) return;
  if (target.closest("button")) return;
  const mentionEl = target.closest<HTMLElement>("[data-tenas-mention=\"true\"]");
  if (!mentionEl) return;
  if (mentionEl.querySelector("button")?.contains(target)) return;
  const value =
    mentionEl.getAttribute("data-mention-value") ||
    mentionEl.getAttribute("data-slate-value") ||
    "";
  const fileRef = value ? parseMentionFileRef(value, defaultProjectId) : null;
  if (!fileRef) return;
  const { projectId, relativePath } = fileRef;
  if (!projectId || !relativePath) return;
  const rootUri = resolveProjectRootUri(projects, projectId);
  if (!rootUri) return;
  const uri = buildUriFromRoot(rootUri, relativePath);
  if (!uri) return;
  event.preventDefault();
  event.stopPropagation();
  void (async () => {
    const entry = await fetchMentionEntry({
      workspaceId,
      projectId,
      uri,
    });
    if (entry?.kind === "folder") {
      const folderName = entry.name || relativePath.split("/").pop() || relativePath;
      const projectTitle = resolveProjectTitle(projects, projectId);
      pushStackItem(activeTabId, {
        id: entry.uri,
        sourceKey: entry.uri,
        component: "folder-tree-preview",
        title: folderName,
        params: {
          rootUri,
          currentUri: entry.uri,
          projectId,
          projectTitle: projectTitle || undefined,
        },
      });
      return;
    }
    const fallbackName = relativePath.split("/").pop() ?? relativePath;
    const fallbackExt = relativePath.includes(".") ? relativePath.split(".").pop() : undefined;
    const entryName = entry?.name ?? fallbackName;
    const entryExt = entry?.ext ?? fallbackExt;
    openFilePreview({
      entry: entry ?? {
        uri,
        name: entryName,
        kind: "file",
        ext: entryExt,
      },
      tabId: activeTabId,
      projectId,
      rootUri,
    });
  })();
}
