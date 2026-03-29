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

import type { PointerEvent } from "react";
import {
  buildUriFromRoot,
  parseScopedProjectPath,
  type FileSystemEntry,
} from "@/components/project/filesystem/utils/file-system-utils";
import { createFileEntryFromUri, openFile, openFilePreview } from "@/components/file/lib/open-file";
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
  projectId?: string;
  uri: string;
}): Promise<FileSystemEntry | null> {
  try {
    const result = await queryClient.fetchQuery(
      trpc.fs.stat.queryOptions({
        projectId: input.projectId,
        uri: input.uri,
      })
    );
    return (result as FileSystemEntry) ?? null;
  } catch {
    return null;
  }
}

/** Parse a mention value into a project file reference. */
function parseMentionFileRef(value: string, defaultProjectId?: string): MentionFileRef | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let normalized: string;
  if (trimmed.startsWith("@{") && trimmed.endsWith("}")) {
    normalized = trimmed.slice(2, -1);
  } else if (trimmed.startsWith("@")) {
    normalized = trimmed.slice(1);
  } else {
    normalized = trimmed;
  }
  const match = normalized.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = match?.[1] ?? normalized;
  // 绝对路径不走项目文件解析。
  if (baseValue.startsWith("/")) return null;
  const parsed = parseScopedProjectPath(baseValue);
  const projectId = parsed?.projectId ?? defaultProjectId;
  if (!projectId) return null;

  let relativePath = parsed?.relativePath ?? "";

  // 兼容历史数据：../chat-history/xxx → .openloaf/chat-history/xxx
  if (relativePath.match(/^(?:\.\.\/)+/) && relativePath.includes("chat-history/")) {
    const stripped = relativePath.replace(/^(?:\.\.\/)+/, "");
    if (stripped.startsWith("chat-history/")) {
      relativePath = `.openloaf/${stripped}`;
    }
  }

  if (!relativePath) return null;
  return {
    projectId,
    relativePath,
    lineStart: match?.[2],
    lineEnd: match?.[3],
  };
}

/** Extract a normalized chat-history relative path, or null if not a chat-history path. */
function extractChatHistoryPath(value: string): string | null {
  let normalized = value.trim();
  if (normalized.startsWith("@{") && normalized.endsWith("}")) {
    normalized = normalized.slice(2, -1);
  } else if (normalized.startsWith("@")) {
    normalized = normalized.slice(1);
  }
  normalized = normalized.replace(/:\d+-\d+$/, "");
  // .openloaf/chat-history/... (project chat, new format)
  if (normalized.includes(".openloaf/") && normalized.includes("chat-history/")) {
    return normalized;
  }
  // ../chat-history/... (project chat, legacy format)
  if (/^(?:\.\.\/)+/.test(normalized) && normalized.includes("chat-history/")) {
    const stripped = normalized.replace(/^(?:\.\.\/)+/, "");
    if (stripped.startsWith("chat-history/")) {
      return `.openloaf/${stripped}`;
    }
  }
  // chat-history/... (temp chat)
  if (normalized.startsWith("chat-history/")) {
    return normalized;
  }
  return null;
}

/** Handle pointer down on file mentions to open the viewer stack. */
export function handleChatMentionPointerDown(
  event: PointerEvent<HTMLElement>,
  options: MentionPointerDownOptions
) {
  const { activeTabId, projectId: defaultProjectId, projects, pushStackItem } =
    options;
  if (!activeTabId) return;
  const target = event.target as HTMLElement | null;
  if (!target) return;
  if (target.closest("button")) return;
  const mentionEl = target.closest<HTMLElement>("[data-openloaf-mention=\"true\"]");
  if (!mentionEl) return;
  if (mentionEl.querySelector("button")?.contains(target)) return;
  const value =
    mentionEl.getAttribute("data-mention-value") ||
    mentionEl.getAttribute("data-slate-value") ||
    "";

  // chat-history 文件：跳过 VFS，直接用 preview endpoint 打开。
  // 兼容项目 chat（.openloaf/chat-history/...、../chat-history/...）和临时 chat（chat-history/...）。
  const chatHistoryRelPath = extractChatHistoryPath(value);
  if (chatHistoryRelPath) {
    event.preventDefault();
    event.stopPropagation();
    const fileName = chatHistoryRelPath.split("/").pop() ?? "file";
    const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : undefined;
    const rootUri = defaultProjectId ? resolveProjectRootUri(projects, defaultProjectId) : undefined;
    openFilePreview({
      entry: {
        uri: chatHistoryRelPath,
        name: decodeURIComponent(fileName),
        kind: "file" as const,
        ext,
      },
      tabId: activeTabId,
      projectId: defaultProjectId,
      rootUri: rootUri || undefined,
    });
    return;
  }

  const fileRef = value ? parseMentionFileRef(value, defaultProjectId) : null;

  // 绝对路径：直接用 file:// URI 打开，不走项目解析。
  if (!fileRef) {
    const normalized = value.startsWith("@{") && value.endsWith("}")
      ? value.slice(2, -1)
      : value.startsWith("@") ? value.slice(1) : value;
    const baseValue = normalized.replace(/:\d+-\d+$/, "");
    if (baseValue.startsWith("/")) {
      const uri = `file://${baseValue}`;
      const name = baseValue.split("/").pop() ?? "file";
      const entry = createFileEntryFromUri({ uri, name });
      if (entry) {
        event.preventDefault();
        event.stopPropagation();
        openFile({ entry, tabId: activeTabId, mode: "stack", readOnly: true });
      }
    }
    return;
  }
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
