"use client";

import type { PointerEvent } from "react";
import {
  buildTenasFileUrl,
  buildUriFromRoot,
  parseTenasFileUrl,
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

/** Shape of the project tree data used for root uri resolution. */
type ProjectTreeNode = {
  projectId?: string;
  rootUri?: string;
  children?: ProjectTreeNode[];
};

/** Dependencies for mention pointer handling. */
type MentionPointerDownOptions = {
  activeTabId?: string | null;
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

/** Parse a mention value into a project file reference. */
function parseMentionFileRef(value: string): MentionFileRef | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const match = normalized.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = match?.[1] ?? normalized;
  const parsed = baseValue.startsWith("tenas-file://") ? parseTenasFileUrl(baseValue) : null;
  if (!parsed) return null;
  return {
    projectId: parsed.projectId,
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
  const { activeTabId, projects, pushStackItem } = options;
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
  const fileRef = value ? parseMentionFileRef(value) : null;
  if (!fileRef) return;
  const { projectId, relativePath } = fileRef;
  if (!projectId || !relativePath) return;
  const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
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
  const rootUri = resolveProjectRootUri(projects, projectId);
  if (!rootUri) return;
  const uri = buildUriFromRoot(rootUri, relativePath);
  if (!uri && !isPdfExt) return;
  event.preventDefault();
  event.stopPropagation();
  const fileName = relativePath.split("/").pop() ?? relativePath;
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
  const stackUri = isPdfExt ? buildTenasFileUrl(projectId, relativePath) : uri;
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
      projectId: isCodeExt || isTextExt ? projectId : undefined,
      __customHeader: isPdfExt || isDocExt || isSheetExt ? true : undefined,
    },
  });
}
