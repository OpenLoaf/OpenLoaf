"use client";

import type { PointerEvent } from "react";
import { buildUriFromRoot } from "@/components/project/filesystem/file-system-utils";

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
  const mentionEl = target.closest<HTMLElement>("[data-teatime-mention=\"true\"]");
  if (!mentionEl) return;
  if (mentionEl.querySelector("button")?.contains(target)) return;
  const value =
    mentionEl.getAttribute("data-mention-value") ||
    mentionEl.getAttribute("data-slate-value") ||
    "";
  if (!value) return;
  const match = value.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = match?.[1] ?? value;
  if (!baseValue.includes("/")) return;
  const parts = baseValue.split("/");
  const projectId = parts[0] ?? "";
  const relativePath = parts.slice(1).join("/");
  if (!projectId || !relativePath) return;
  const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
  const isImageExt = /^(png|jpe?g|gif|bmp|webp|svg|avif|tiff|heic)$/i.test(ext);
  const isCodeExt = /^(js|ts|tsx|jsx|json|yml|yaml|toml|ini|py|go|rs|java|cpp|c|h|hpp|css|scss|less|html|xml|sh|zsh|md|mdx)$/i.test(ext);
  if (!isImageExt && !isCodeExt) return;
  const rootUri = resolveProjectRootUri(projects, projectId);
  if (!rootUri) return;
  const uri = buildUriFromRoot(rootUri, relativePath);
  if (!uri) return;
  event.preventDefault();
  event.stopPropagation();
  const fileName = relativePath.split("/").pop() ?? relativePath;
  const stackId = `${isImageExt ? "image-viewer" : "code-viewer"}:${uri}`;
  pushStackItem(activeTabId, {
    id: stackId,
    sourceKey: stackId,
    component: isImageExt ? "image-viewer" : "code-viewer",
    title: fileName,
    params: {
      uri,
      name: fileName,
      ext,
      rootUri: isCodeExt ? rootUri : undefined,
      projectId: isCodeExt ? projectId : undefined,
    },
  });
}
