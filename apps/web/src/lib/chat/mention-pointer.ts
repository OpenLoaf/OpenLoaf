"use client";

import type { PointerEvent } from "react";
import {
  buildUriFromRoot,
  parseScopedProjectPath,
  type FileSystemEntry,
} from "@/components/project/filesystem/utils/file-system-utils";
import {
  CODE_EXTS,
  DOC_EXTS,
  IMAGE_EXTS,
  MARKDOWN_EXTS,
  PDF_EXTS,
  SPREADSHEET_EXTS,
  isTextFallbackExt,
} from "@/components/project/filesystem/components/FileSystemEntryVisual";
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
async function fetchMentionEntry(uri: string): Promise<FileSystemEntry | null> {
  try {
    return (await queryClient.fetchQuery(
      trpc.fs.stat.queryOptions({ uri })
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
  const { activeTabId, projectId: defaultProjectId, projects, pushStackItem } = options;
  if (!activeTabId) return;
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
    const entry = await fetchMentionEntry(uri);
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
    const ext = (entry?.ext ?? relativePath.split(".").pop() ?? "").toLowerCase();
    const isImageExt = IMAGE_EXTS.has(ext);
    const isCodeExt = CODE_EXTS.has(ext);
    const isMarkdownExt = MARKDOWN_EXTS.has(ext);
    const isPdfExt = PDF_EXTS.has(ext);
    const isDocExt = DOC_EXTS.has(ext);
    const isSheetExt = SPREADSHEET_EXTS.has(ext);
    const isTextExt = isTextFallbackExt(ext);
    if (
      !isImageExt &&
      !isCodeExt &&
      !isMarkdownExt &&
      !isPdfExt &&
      !isDocExt &&
      !isSheetExt &&
      !isTextExt
    ) {
      return;
    }
    const fileName = entry?.name ?? relativePath.split("/").pop() ?? relativePath;
    const component = isImageExt
      ? "image-viewer"
      : isMarkdownExt
        ? "markdown-viewer"
        : isCodeExt || isTextExt
          ? "code-viewer"
          : isPdfExt
            ? "pdf-viewer"
            : isDocExt
              ? "doc-viewer"
              : "sheet-viewer";
    const stackUri = isPdfExt ? relativePath : uri;
    const stackId = uri || stackUri;
    pushStackItem(activeTabId, {
      id: stackId,
      sourceKey: stackId,
      component,
      title: fileName,
      params: {
        uri: stackUri,
        openUri: uri,
        name: fileName,
        ext,
        rootUri: isCodeExt || isTextExt ? rootUri : undefined,
        projectId: isCodeExt || isTextExt || isPdfExt ? projectId : undefined,
        __customHeader: isPdfExt || isDocExt || isSheetExt ? true : undefined,
      },
    });
  })();
}
