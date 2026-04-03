/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import {
  getParentRelativePath,
  normalizeRelativePath,
} from "@/components/project/filesystem/utils/file-system-utils";
import type { ProjectNode } from "@openloaf/api/services/projectTreeService";

export type ProjectInfo = ProjectNode;

export type FileNode = {
  uri: string;
  name: string;
  kind: "project" | "folder" | "file";
  ext?: string;
  children?: FileNode[];
  projectId?: string;
  projectIcon?: string;
  isFavorite?: boolean;
};

export type ProjectDropPosition = "inside" | "before" | "after";

export type DragInsertTarget = {
  projectId: string;
  position: "before" | "after";
};

/** Resolve drop position based on pointer location. */
export function resolveProjectDropPosition(
  target: HTMLElement,
  clientY: number,
): ProjectDropPosition {
  const rect = target.getBoundingClientRect();
  if (!rect.height) return "inside";
  const ratio = (clientY - rect.top) / rect.height;
  // 逻辑：上/下 25% 视为插入线区域，中间为放入子项目。
  if (ratio <= 0.25) return "before";
  if (ratio >= 0.75) return "after";
  return "inside";
}

/** Apply a stable drag preview for project drag. */
export function applyProjectDragPreview(
  target: HTMLElement,
  event: React.DragEvent<HTMLElement>,
): void {
  // 逻辑：使用克隆节点作为拖拽影像，避免拖拽过程中 DOM 变更导致中断。
  const dragPreview = target.cloneNode(true) as HTMLElement;
  const rect = target.getBoundingClientRect();
  dragPreview.style.position = "absolute";
  dragPreview.style.top = "-9999px";
  dragPreview.style.left = "-9999px";
  dragPreview.style.pointerEvents = "none";
  dragPreview.style.width = `${rect.width}px`;
  dragPreview.style.height = `${rect.height}px`;
  dragPreview.style.transform = "none";
  dragPreview.style.opacity = "0.9";
  document.body.appendChild(dragPreview);
  if (event.dataTransfer?.setDragImage) {
    event.dataTransfer.setDragImage(dragPreview, rect.width / 2, rect.height / 2);
  }
  requestAnimationFrame(() => {
    dragPreview.remove();
  });
}

export function getNodeKey(node: FileNode): string {
  const projectId = node.projectId?.trim();
  return projectId ? `${projectId}:${node.uri}` : node.uri;
}

export type RenameTarget = {
  node: FileNode;
  nextName: string;
  nextIcon?: string | null;
};

export type ChildProjectTarget = {
  node: FileNode;
  title: string;
  useCustomPath: boolean;
  customPath: string;
  enableVersionControl: boolean;
};

export type ImportChildTarget = {
  node: FileNode;
  path: string;
  enableVersionControl: boolean;
};


export interface PageTreeMenuProps {
  projects: ProjectInfo[];
  expandedNodes: Record<string, boolean>;
  setExpandedNodes: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  /** Callback for creating a new project. */
  onCreateProject?: () => void;
  /** Callback for importing a project. */
  onImportProject?: () => void;
}

export interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  activeUri: string | null;
  activeProjectRootUri: string | null;
  expandedNodes: Record<string, boolean>;
  setExpanded: (uri: string, isExpanded: boolean) => void;
  onPrimaryClick: (node: FileNode) => void;
  renderContextMenuContent: (node: FileNode) => React.ReactNode;
  contextSelectedUri: string | null;
  onContextMenuOpenChange: (node: FileNode, open: boolean) => void;
  subItemGapClassName?: string;
  dragOverProjectId?: string | null;
  dragInsertTarget?: DragInsertTarget | null;
  draggingProjectId?: string | null;
  disableNativeDrag?: boolean;
  onProjectDragStart?: (
    node: FileNode,
    event: React.DragEvent<HTMLElement>
  ) => void;
  onProjectDragOver?: (
    node: FileNode,
    event: React.DragEvent<HTMLElement>
  ) => void;
  onProjectDragLeave?: (
    node: FileNode,
    event: React.DragEvent<HTMLElement>
  ) => void;
  onProjectDrop?: (
    node: FileNode,
    event: React.DragEvent<HTMLElement>
  ) => void;
  onProjectDragEnd?: (
    node: FileNode,
    event: React.DragEvent<HTMLElement>
  ) => void;
  onProjectPointerDown?: (
    node: FileNode,
    event: React.PointerEvent<HTMLElement>
  ) => void;
  /** Callback fired on native contextmenu event to record timestamp early. */
  onNativeContextMenu?: () => void;
  /** Whether to show the hover panel for project nodes (sidebar only). */
  enableHoverPanel?: boolean;
}

export function buildNextUri(uri: string, nextName: string) {
  const trimmed = uri.trim();
  if (!trimmed) return normalizeRelativePath(nextName);
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const segments = url.pathname.split("/");
      segments[segments.length - 1] = nextName;
      url.pathname = segments.join("/");
      return url.toString();
    } catch {
      return trimmed;
    }
  }
  const segments = normalizeRelativePath(trimmed).split("/").filter(Boolean);
  if (segments.length === 0) return normalizeRelativePath(nextName);
  segments[segments.length - 1] = nextName;
  return segments.join("/");
}

export function getParentUri(uri: string) {
  const trimmed = uri.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const segments = url.pathname.split("/");
      segments.pop();
      const nextPath = segments.join("/") || "/";
      url.pathname = nextPath;
      return url.toString();
    } catch {
      return trimmed;
    }
  }
  return getParentRelativePath(trimmed) ?? "";
}

/** Build project nodes recursively from API payload. */
export function buildProjectNode(project: ProjectInfo): FileNode {
  const children = Array.isArray(project.children)
    ? project.children.map(buildProjectNode)
    : [];
  return {
    uri: project.rootUri,
    name: project.title || "Untitled Project",
    kind: "project",
    children,
    projectId: project.projectId,
    projectIcon: project.icon,
    isFavorite: project.isFavorite ?? false,
  };
}

/** Resolve the active project root uri from the active file uri. */
export function resolveActiveProjectRootUri(
  projects: ProjectInfo[] | undefined,
  activeUri: string | null
): string | null {
  if (!activeUri || !projects?.length) return null;
  const roots: string[] = [];
  const walk = (items: ProjectInfo[]) => {
    items.forEach((item) => {
      roots.push(item.rootUri);
      if (item.children?.length) {
        walk(item.children);
      }
    });
  };
  walk(projects);
  let best: { uri: string; length: number } | null = null;
  for (const uri of roots) {
    try {
      const rootUrl = new URL(uri);
      const activeUrl = new URL(activeUri);
      if (!activeUrl.pathname.startsWith(rootUrl.pathname)) continue;
      const length = rootUrl.pathname.length;
      if (!best || length > best.length) {
        best = { uri, length };
      }
    } catch {
      continue;
    }
  }
  return best?.uri ?? null;
}
