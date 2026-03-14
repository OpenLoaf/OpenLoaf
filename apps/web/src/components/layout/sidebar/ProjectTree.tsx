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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useAppState, getAppState } from "@/hooks/use-app-state";
import { isElectronEnv } from "@/utils/is-electron-env";
import { resolveProjectModeProjectShell } from "@/lib/project-mode";
import { openProjectShell } from "@/lib/project-shell";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenu,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from "@openloaf/ui/sidebar";
import { Button } from "@openloaf/ui/button";
import { Checkbox } from "@openloaf/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { EmojiPicker } from "@openloaf/ui/emoji-picker";
import { Input } from "@openloaf/ui/input";
import { Label } from "@openloaf/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import {
  ArrowUpRight,
  ChevronRight,
  ClipboardCopy,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  PencilLine,
  SmilePlus,
  Star,
  Settings,
  StarOff,
  Trash2,
  X,
} from "lucide-react";
import { trpc as trpcContext } from "@/utils/trpc";
import { getProjectsQueryKey } from "@/hooks/use-projects";
import { toast } from "sonner";
import { buildStackItemForEntry } from "@/components/file/lib/open-file";
import {
  BOARD_INDEX_FILE_NAME,
  ensureBoardFolderName,
  getBoardDisplayName,
  getDisplayFileName,
  isBoardFolderName,
} from "@/lib/file-name";
import { buildBoardChatTabState } from "@/components/board/utils/board-chat-tab";
import { Switch } from "@openloaf/ui/switch";
import {
  getDisplayPathFromUri,
  getParentRelativePath,
  buildChildUri,
  normalizeRelativePath,
  resolveFileUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";
import { cn } from "@/lib/utils";
import { buildProjectHierarchyIndex } from "@/lib/project-tree";
import { openProjectSettingsPage } from "@/lib/project-shell";
import type { ProjectNode } from "@openloaf/api/services/projectTreeService";
import { SidebarHoverPanel } from "@/components/layout/sidebar/SidebarHoverPanel";

type ProjectInfo = ProjectNode;

type FileNode = {
  uri: string;
  name: string;
  kind: "project" | "folder" | "file";
  ext?: string;
  children?: FileNode[];
  projectId?: string;
  projectIcon?: string;
  isFavorite?: boolean;
};

type ProjectDropPosition = "inside" | "before" | "after";

type DragInsertTarget = {
  projectId: string;
  position: "before" | "after";
};

/** Resolve drop position based on pointer location. */
function resolveProjectDropPosition(
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
function applyProjectDragPreview(
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

function getNodeKey(node: FileNode): string {
  const projectId = node.projectId?.trim();
  return projectId ? `${projectId}:${node.uri}` : node.uri;
}

type RenameTarget = {
  node: FileNode;
  nextName: string;
  nextIcon?: string | null;
};

type ChildProjectTarget = {
  node: FileNode;
  title: string;
  useCustomPath: boolean;
  customPath: string;
  enableVersionControl: boolean;
};

type ImportChildTarget = {
  node: FileNode;
  path: string;
  enableVersionControl: boolean;
};


interface PageTreeMenuProps {
  projects: ProjectInfo[];
  expandedNodes: Record<string, boolean>;
  setExpandedNodes: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  /** Callback for creating a new project. */
  onCreateProject?: () => void;
  /** Callback for importing a project. */
  onImportProject?: () => void;
}

interface FileTreeNodeProps {
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

function buildNextUri(uri: string, nextName: string) {
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

function getParentUri(uri: string) {
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
function buildProjectNode(project: ProjectInfo): FileNode {
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
function resolveActiveProjectRootUri(
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

/** Render a file tree node recursively. */
function FileTreeNode({
  node,
  depth,
  activeUri,
  activeProjectRootUri,
  expandedNodes,
  setExpanded,
  onPrimaryClick,
  renderContextMenuContent,
  contextSelectedUri,
  onContextMenuOpenChange,
  subItemGapClassName,
  dragOverProjectId,
  dragInsertTarget,
  draggingProjectId,
  disableNativeDrag,
  onProjectDragStart,
  onProjectDragOver,
  onProjectDragLeave,
  onProjectDrop,
  onProjectDragEnd,
  onProjectPointerDown,
  onNativeContextMenu,
  enableHoverPanel,
}: FileTreeNodeProps) {
  const trpc = trpcContext;
  const nodeKey = getNodeKey(node);
  const isExpanded = expandedNodes[nodeKey] ?? false;
  const isActive =
    activeUri === node.uri ||
    contextSelectedUri === nodeKey ||
    (node.kind === "project" && activeProjectRootUri === node.uri);
  const listQuery = useQuery(
    trpc.fs.list.queryOptions(
      node.kind === "folder" && isExpanded
        ? { projectId: node.projectId, uri: node.uri }
        : skipToken
    )
  );
  const fileChildren = listQuery.data?.entries ?? [];
  const normalizedFileChildren = fileChildren.map((child) => {
    if (child.kind === "folder" && isBoardFolderName(child.name)) {
      return { ...child, kind: "file", ext: undefined, projectId: node.projectId };
    }
    return { ...child, projectId: node.projectId };
  });
  const projectChildren = node.kind === "project" ? node.children ?? [] : [];
  const children = node.kind === "project" ? projectChildren : normalizedFileChildren;
  const hasChildren = node.kind === "project" ? children.length > 0 : true;
  const isProjectNode = node.kind === "project" && Boolean(node.projectId);
  const isDraggable = isProjectNode && Boolean(onProjectDragStart) && !disableNativeDrag;
  const isDragOver =
    isProjectNode && dragOverProjectId && node.projectId === dragOverProjectId;
  const isDraggingSelf =
    isProjectNode && draggingProjectId && node.projectId === draggingProjectId;
  const insertPosition =
    isProjectNode && dragInsertTarget && dragInsertTarget.projectId === node.projectId
      ? dragInsertTarget.position
      : null;

  const Item = depth === 0 ? SidebarMenuItem : SidebarMenuSubItem;
  const Button = depth === 0 ? SidebarMenuButton : SidebarMenuSubButton;

  if (node.kind === "file") {
    const displayName = isBoardFolderName(node.name)
      ? getBoardDisplayName(node.name)
      : getDisplayFileName(node.name, node.ext);
    return (
      <Item key={nodeKey}>
        <ContextMenu onOpenChange={(open) => onContextMenuOpenChange(node, open)}>
          <ContextMenuTrigger asChild>
            <Button
              tooltip={displayName}
              isActive={isActive}
              className="text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
              onClick={() => onPrimaryClick(node)}
              onContextMenu={onNativeContextMenu}
            >
              <FileText className="h-4 w-4" />
              <span>{displayName}</span>
            </Button>
          </ContextMenuTrigger>
          {renderContextMenuContent(node)}
        </ContextMenu>
      </Item>
    );
  }

  const collapsibleContent = (
    <CollapsiblePrimitive.Root
      key={nodeKey}
      asChild
      open={isExpanded}
      onOpenChange={(open) => setExpanded(nodeKey, open)}
      className="group/collapsible"
    >
      <Item>
        {insertPosition ? (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute left-2 right-2 h-0.5 rounded-full bg-primary",
              insertPosition === "before" ? "top-0" : "bottom-0"
            )}
          />
        ) : null}
        <ContextMenu onOpenChange={(open) => onContextMenuOpenChange(node, open)}>
          <ContextMenuTrigger asChild>
            <Button
              asChild
              tooltip={node.name}
              isActive={isActive}
              className={cn(
                "overflow-visible text-sidebar-foreground/80 [&>svg]:text-muted-foreground",
                isDragOver && "ring-1 ring-ring/60 bg-sidebar-accent/70",
                isDraggingSelf && "opacity-60",
              )}
            >
              <div
                role="button"
                tabIndex={0}
                data-project-id={node.projectId ?? undefined}
                onClick={() => onPrimaryClick(node)}
                onContextMenu={onNativeContextMenu}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPrimaryClick(node);
                  }
                }}
                onPointerDown={(event) => onProjectPointerDown?.(node, event)}
                draggable={isDraggable}
                onDragStart={
                  isDraggable ? (event) => onProjectDragStart?.(node, event) : undefined
                }
                onDragOver={
                  isDraggable ? (event) => onProjectDragOver?.(node, event) : undefined
                }
                onDragLeave={
                  isDraggable ? (event) => onProjectDragLeave?.(node, event) : undefined
                }
                onDrop={isDraggable ? (event) => onProjectDrop?.(node, event) : undefined}
                onDragEnd={
                  isDraggable ? (event) => onProjectDragEnd?.(node, event) : undefined
                }
              >
                {node.projectIcon ? (
                  <span className="text-xs leading-none">{node.projectIcon}</span>
                ) : (
                  <img src="/head_s.png" alt="" className="h-4 w-4 rounded-sm" />
                )}
                <span>{node.name}</span>
              </div>
            </Button>
          </ContextMenuTrigger>
          {renderContextMenuContent(node)}
        </ContextMenu>
        {hasChildren ? (
          <CollapsiblePrimitive.Trigger asChild>
            <SidebarMenuAction
              aria-label="Toggle"
              className="text-muted-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              <ChevronRight className="transition-transform duration-300 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuAction>
          </CollapsiblePrimitive.Trigger>
        ) : null}
        {children.length > 0 ? (
          <CollapsiblePrimitive.Content className="data-[state=closed]:overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down data-[state=open]:overflow-visible">
            <SidebarMenuSub className={cn("mx-1 px-1", subItemGapClassName)}>
              {children.map((child: any) => (
                <FileTreeNode
                  key={getNodeKey(child)}
                  node={{
                    uri: child.uri,
                    name: child.name,
                    kind: child.kind,
                    ext: child.ext,
                    children: child.children,
                    projectId: child.projectId,
                    projectIcon: child.projectIcon,
                    isFavorite: child.isFavorite,
                  }}
                  depth={depth + 1}
                  activeUri={activeUri}
                  activeProjectRootUri={activeProjectRootUri}
                  expandedNodes={expandedNodes}
                  setExpanded={setExpanded}
                  onPrimaryClick={onPrimaryClick}
                  renderContextMenuContent={renderContextMenuContent}
                  contextSelectedUri={contextSelectedUri}
                  onContextMenuOpenChange={onContextMenuOpenChange}
                  subItemGapClassName={subItemGapClassName}
                  dragOverProjectId={dragOverProjectId}
                  dragInsertTarget={dragInsertTarget}
                  draggingProjectId={draggingProjectId}
                  onProjectDragStart={onProjectDragStart}
                  onProjectDragOver={onProjectDragOver}
                  onProjectDragLeave={onProjectDragLeave}
                  onProjectDrop={onProjectDrop}
                  onProjectDragEnd={onProjectDragEnd}
                  onProjectPointerDown={onProjectPointerDown}
                  onNativeContextMenu={onNativeContextMenu}
                  enableHoverPanel={enableHoverPanel}
                />
              ))}
            </SidebarMenuSub>
          </CollapsiblePrimitive.Content>
        ) : null}
      </Item>
    </CollapsiblePrimitive.Root>
  );

  if (enableHoverPanel && isProjectNode && node.projectId) {
    return (
      <SidebarHoverPanel
        type="project-chats"
        projectId={node.projectId}
      >
        {collapsibleContent}
      </SidebarHoverPanel>
    );
  }

  return collapsibleContent;
}

export const PageTreeMenu = ({
  projects,
  expandedNodes,
  setExpandedNodes,
  onCreateProject,
  onImportProject,
}: PageTreeMenuProps) => {
  const trpc = trpcContext;
  const { t } = useTranslation(["nav", "common"]);
  const navigate = useAppView((s) => s.navigate);
  const setViewTitle = useAppView((s) => s.setTitle);
  const appState = useAppState();
  const isElectron = isElectronEnv();
  const queryClient = useQueryClient();
  const renameProject = useMutation(trpc.project.update.mutationOptions());
  const createProject = useMutation(trpc.project.create.mutationOptions());
  const removeProject = useMutation(trpc.project.remove.mutationOptions());
  const destroyProject = useMutation(trpc.project.destroy.mutationOptions());
  const moveProject = useMutation(trpc.project.move.mutationOptions());
  const toggleFavorite = useMutation(trpc.project.toggleFavorite.mutationOptions());
  const renameFile = useMutation(trpc.fs.rename.mutationOptions());
  const deleteFile = useMutation(trpc.fs.delete.mutationOptions());
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null);
  const [contextSelectedUri, setContextSelectedUri] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [createChildTarget, setCreateChildTarget] = useState<ChildProjectTarget | null>(null);
  const [importChildTarget, setImportChildTarget] = useState<ImportChildTarget | null>(null);
  const [isChildBusy, setIsChildBusy] = useState(false);
  const [isImportChildBusy, setIsImportChildBusy] = useState(false);
  /** Remove target for project detach. */
  const [removeTarget, setRemoveTarget] = useState<FileNode | null>(null);
  /** Permanent delete checkbox state. */
  const [isPermanentRemoveChecked, setIsPermanentRemoveChecked] = useState(false);
  /** Permanent delete confirmation input. */
  const [permanentRemoveText, setPermanentRemoveText] = useState("");
  /** Busy state for removing or destroying project. */
  const [isRemoveBusy, setIsRemoveBusy] = useState(false);
  /** Track currently dragging project info. */
  const [draggingProject, setDraggingProject] = useState<{
    projectId: string;
    title: string;
  } | null>(null);
  /** Track drag-over project id. */
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);
  /** Track drag insert target for reorder. */
  const [dragInsertTarget, setDragInsertTarget] = useState<DragInsertTarget | null>(
    null,
  );
  /** Track root drop zone active state. */
  const [isRootDropActive, setIsRootDropActive] = useState(false);
  /** Track pending project move confirmation. */
  const [pendingMove, setPendingMove] = useState<{
    projectId: string;
    targetParentId: string | null;
    targetSiblingId?: string | null;
    targetPosition?: "before" | "after";
    mode: "reparent" | "reorder";
  } | null>(null);
  /** Track move request state. */
  const [isMoveBusy, setIsMoveBusy] = useState(false);
  /** Drag ghost overlay state for pointer drag. */
  const [dragGhost, setDragGhost] = useState<{
    projectId: string;
    title: string;
    icon?: string | null;
    x: number;
    y: number;
  } | null>(null);
  /** Drag ghost position cache for pointer drag updates. */
  const dragGhostPositionRef = useRef<{ x: number; y: number } | null>(null);
  /** Drag ghost animation frame handle. */
  const dragGhostRafRef = useRef<number | null>(null);
  /** Auto expand timer for drag hover. */
  const autoExpandRef = useRef<{ projectId: string; timer: number | null } | null>(
    null,
  );
  /** Track whether next click should be ignored after pointer drag. */
  const suppressNextClickRef = useRef(false);
  /** Record last context menu open timestamp to block trackpad ghost clicks. */
  const lastContextMenuAtRef = useRef(0);

  /** Block pointer events shortly after a context menu trigger (trackpad workaround). */
  const shouldBlockClick = useCallback(() => {
    const elapsed = Date.now() - lastContextMenuAtRef.current;
    if (elapsed > 500) return false;
    return true;
  }, []);

  /** Check whether the error indicates a missing project. */
  const isProjectMissingError = (err: unknown) => {
    const message =
      typeof err === "object" && err && "message" in err
        ? String((err as { message?: string }).message ?? "")
        : "";
    return /project not found/i.test(message);
  };

  const activeTabParams = useMemo(
    () => (appState.base?.params ?? {}) as Record<string, unknown>,
    [appState.base?.params],
  );
  const activeUri = useMemo(() => {
    const rootUri = activeTabParams.rootUri;
    const uri = activeTabParams.uri;
    if (typeof rootUri === "string") return rootUri;
    if (typeof uri === "string") return uri;
    return null;
  }, [activeTabParams]);
  const activeProjectId = useMemo(() => {
    const projectId = activeTabParams.projectId;
    if (typeof projectId === "string" && projectId.trim()) return projectId;
    // 聊天标签页没有 base.params，回退到 chatParams.projectId
    const chatProjectId = appState.chatParams?.projectId;
    return typeof chatProjectId === "string" && chatProjectId.trim()
      ? chatProjectId
      : null;
  }, [activeTabParams, appState.chatParams]);

  const setExpanded = (uri: string, isExpanded: boolean) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [uri]: isExpanded,
    }));
  };

  const projectHierarchy = useMemo(() => buildProjectHierarchyIndex(projects), [projects]);
  const projectRootById = projectHierarchy.rootUriById;
  const activeProjectRootUri = useMemo(() => {
    if (activeProjectId) {
      return projectRootById.get(activeProjectId) ?? null;
    }
    return resolveActiveProjectRootUri(projects, activeUri);
  }, [activeProjectId, activeUri, projectRootById, projects]);

  /** 逻辑：记录子项目对应的祖先节点 key 列表。 */
  const ancestorNodeKeysByProjectId = useMemo(() => {
    const map = new Map<string, string[]>();
    /** Build node key for a project item. */
    const getProjectNodeKey = (item: ProjectInfo) =>
      item.projectId ? `${item.projectId}:${item.rootUri}` : item.rootUri;
    const walk = (items: ProjectInfo[], ancestors: string[]) => {
      items.forEach((item) => {
        if (item.projectId && ancestors.length > 0) {
          map.set(item.projectId, [...ancestors]);
        }
        if (item.children?.length) {
          const nodeKey = item.rootUri ? getProjectNodeKey(item) : "";
          const nextAncestors = nodeKey ? [...ancestors, nodeKey] : [...ancestors];
          walk(item.children, nextAncestors);
        }
      });
    };
    walk(projects, []);
    return map;
  }, [projects]);

  useEffect(() => {
    // 逻辑：激活带 projectId 的标签时，自动展开祖先与当前项目，刷新后也能看到最新子项目。
    const params = appState.base?.params as any;
    const projectId = params?.projectId ?? appState.chatParams?.projectId;
    if (!projectId) return;
    const ancestorNodeKeys = ancestorNodeKeysByProjectId.get(projectId) ?? [];
    const rootUri = projectRootById.get(projectId);
    const selfNodeKey = rootUri ? `${projectId}:${rootUri}` : null;
    const nodeKeysToExpand = selfNodeKey
      ? [...ancestorNodeKeys, selfNodeKey]
      : ancestorNodeKeys;
    if (!nodeKeysToExpand.length) return;
    setExpandedNodes((prev) => {
      const patches = nodeKeysToExpand.reduce<Record<string, boolean>>((acc, nodeKey) => {
        if (!prev[nodeKey]) acc[nodeKey] = true;
        return acc;
      }, {});
      return Object.keys(patches).length > 0 ? { ...prev, ...patches } : prev;
    });
  }, [
    appState.base,
    appState.chatParams,
    ancestorNodeKeysByProjectId,
    projectRootById,
    setExpandedNodes,
  ]);

  const setChatSession = useAppView((s) => s.setChatSession);
  const openProjectTab = (project: ProjectInfo) => {
    // 中文注释：项目树打开项目统一走 project-shell，避免旁路导航丢失项目上下文。
    openProjectShell({
      projectId: project.projectId,
      rootUri: project.rootUri,
      title: project.title || "Untitled Project",
      icon: project.icon ?? undefined,
      section: "index",
    });
  };

  const openFileTab = (node: FileNode) => {
    const baseId = `file:${node.uri}`;
    const displayName = isBoardFolderName(node.name)
      ? getBoardDisplayName(node.name)
      : getDisplayFileName(node.name, node.ext);

    const resolvedRootUri = projectRootById.get(node.projectId ?? "") ?? undefined;
    const currentProjectShell = resolveProjectModeProjectShell(appState.projectShell);
    if (isBoardFolderName(node.name)) {
      const boardId = node.uri.split("/").filter(Boolean).pop() ?? node.uri;
      navigate({
        title: displayName,
        icon: "📄",
        ...buildBoardChatTabState(boardId, node.projectId),
        leftWidthPercent: 70,
        ...(currentProjectShell && currentProjectShell.projectId === node.projectId
          ? { projectShell: currentProjectShell }
          : {}),
        base: {
          id: baseId,
          component: "board-viewer",
          params: {
            // 逻辑：画布面板不显示"系统打开"按钮。
            uri: node.uri,
            boardFolderUri: node.uri,
            boardFileUri: buildChildUri(node.uri, BOARD_INDEX_FILE_NAME),
            projectId: node.projectId,
            rootUri: resolvedRootUri,
            __previousBase: appState.base ?? null,
          },
        },
        chatParams: { projectId: node.projectId },
      });
      return;
    }
    const entry = {
      uri: node.uri,
      name: node.name,
      kind: "file" as const,
      ext: node.ext,
    };
    const stackItem = buildStackItemForEntry({
      entry,
      projectId: node.projectId ?? undefined,
      rootUri: resolvedRootUri,
    });
    if (!stackItem) return;
    navigate({
      title: displayName,
      icon: "📄",
      leftWidthPercent: 70,
      base: {
        id: baseId,
        component: stackItem.component,
        params: stackItem.params,
      },
      chatParams: { projectId: node.projectId },
    });
  };

  const handlePrimaryClick = (node: FileNode) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (shouldBlockClick()) return;
    if (node.kind === "project") {
      const projectId = node.projectId ?? node.uri;
      const projectInfo =
        projectHierarchy.projectById.get(projectId) ??
        {
          projectId,
          title: node.name,
          icon: node.projectIcon,
          rootUri: node.uri,
          isGitProject: false,
          children: [],
        };
      openProjectTab(projectInfo);
      return;
    }
    if (node.kind === "file") {
      openFileTab(node);
      return;
    }
    const nodeKey = getNodeKey(node);
    setExpanded(nodeKey, !(expandedNodes[nodeKey] ?? false));
  };

  const openRenameDialog = (node: FileNode) => {
    const displayName = isBoardFolderName(node.name)
      ? getBoardDisplayName(node.name)
      : getDisplayFileName(node.name, node.ext);
    setRenameTarget({ node, nextName: displayName, nextIcon: node.projectIcon ?? null });
  };

  const openDeleteDialog = (node: FileNode) => {
    if (node.kind === "project") return;
    setDeleteTarget(node);
  };

  /** Open the project root in system file manager, or push a folder-tree stack in web. */
  const handleOpenInFileManager = async (node: FileNode) => {
    const api = window.openloafElectron;
    if (!api?.openPath) {
      const rootUri = node.projectId ? projectRootById.get(node.projectId) : undefined
      useLayoutState.getState().pushStackItem({
        id: `project-folder:${node.projectId ?? node.uri}`,
        sourceKey: `project-folder:${node.projectId ?? node.uri}`,
        component: 'folder-tree-preview',
        title: node.name || 'Folder',
        params: {
          rootUri,
          currentUri: node.uri,
          projectId: node.projectId,
        },
      })
      return;
    }
    const rootUri = node.projectId ? projectRootById.get(node.projectId) : undefined;
    const fileUri = resolveFileUriFromRoot(rootUri, node.uri);
    const res = await api.openPath({ uri: fileUri });
    if (!res?.ok) {
      toast.error(res?.reason ?? t("nav:projectTree.openManagerFailed"));
    }
  };

  /** Open the remove confirmation dialog for project node. */
  const openRemoveDialog = (node: FileNode) => {
    if (node.kind !== "project") return;
    setRemoveTarget(node);
  };

  /** Copy text to clipboard with fallback. */
  const copyTextToClipboard = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      // 逻辑：剪贴板 API 失败时使用降级复制。
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast.success(message);
    }
  };

  /** Copy project path to clipboard. */
  const handleCopyProjectPath = async (node: FileNode) => {
    if (node.kind !== "project") return;
    const displayPath = getDisplayPathFromUri(node.uri);
    await copyTextToClipboard(displayPath, t("nav:sidebar.pathCopied"));
  };

  /** Pick a directory from system dialog (Electron only). */
  const pickDirectory = async (initialValue?: string) => {
    const api = window.openloafElectron;
    if (api?.pickDirectory) {
      const result = await api.pickDirectory(
        initialValue ? { defaultPath: initialValue } : undefined,
      );
      if (result?.ok && result.path) return result.path;
    }
    if (initialValue) return initialValue;
    return null;
  };

  const openCreateChildDialog = (node: FileNode) => {
    if (node.kind !== "project") return;
    setCreateChildTarget({
      node,
      title: "",
      useCustomPath: false,
      customPath: "",
      enableVersionControl: true,
    });
  };

  const openImportChildDialog = async (node: FileNode) => {
    if (node.kind !== "project") return;
    setImportChildTarget({
      node,
      path: "",
      enableVersionControl: true,
    });
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const rawName = renameTarget.nextName.trim();
    if (!rawName) return;
    const nextName = isBoardFolderName(renameTarget.node.name)
      ? ensureBoardFolderName(rawName)
      : rawName;
    try {
      setIsBusy(true);
      if (renameTarget.node.kind === "project") {
        if (!renameTarget.node.projectId) {
          throw new Error("缺少项目 ID");
        }
        const projectId = renameTarget.node.projectId;
        await renameProject.mutateAsync({
          projectId: renameTarget.node.projectId,
          title: nextName,
          ...(renameTarget.node.kind === "project" && renameTarget.nextIcon !== undefined
            ? { icon: renameTarget.nextIcon }
            : {}),
        });
        // 逻辑：同步已打开的项目标题，避免缓存导致 UI 不更新。
        const currentBase = useLayoutState.getState().base;
        if (currentBase?.id === `project:${projectId}`) {
          setViewTitle(nextName);
        }
        await queryClient.invalidateQueries({
          queryKey: trpc.project.get.queryOptions({ projectId }).queryKey,
        });
      } else {
        const nextUri = buildNextUri(renameTarget.node.uri, nextName);
        if (!renameTarget.node.projectId) {
          throw new Error("缺少项目 ID");
        }
        await renameFile.mutateAsync({
          projectId: renameTarget.node.projectId,
          from: renameTarget.node.uri,
          to: nextUri,
        });
      }
      toast.success(t("common:renameSuccess"));
      setRenameTarget(null);
      await queryClient.invalidateQueries({
        queryKey: getProjectsQueryKey(),
      });
      if (renameTarget.node.kind !== "project") {
        const parentUri = getParentUri(renameTarget.node.uri);
        await queryClient.invalidateQueries({
          queryKey: trpc.fs.list.queryOptions({
            projectId: renameTarget.node.projectId,
            uri: parentUri,
          }).queryKey,
        });
      }
    } catch (err: any) {
      toast.error(err?.message ?? t("common:renameFailed"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsBusy(true);
      if (!deleteTarget.projectId) {
        throw new Error("缺少项目 ID");
      }
      await deleteFile.mutateAsync({
        projectId: deleteTarget.projectId,
        uri: deleteTarget.uri,
        recursive: true,
      });
      toast.success(t("common:deleted"));
      const parentUri = getParentUri(deleteTarget.uri);
      await queryClient.invalidateQueries({
        queryKey: trpc.fs.list.queryOptions({
          projectId: deleteTarget.projectId,
          uri: parentUri,
        }).queryKey,
      });
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.message ?? t("common:deleteFailed"));
    } finally {
      setIsBusy(false);
    }
  };

  /** Reset remove dialog state. */
  const resetRemoveDialogState = () => {
    setRemoveTarget(null);
    setIsPermanentRemoveChecked(false);
    setPermanentRemoveText("");
  };

  /** Toggle favorite status for a project. */
  const handleToggleFavorite = async (node: FileNode) => {
    if (!node.projectId) return;
    const nextFavorite = !node.isFavorite;
    try {
      await toggleFavorite.mutateAsync({
        projectId: node.projectId,
        isFavorite: nextFavorite,
      });
      await queryClient.invalidateQueries({
        queryKey: getProjectsQueryKey(),
      });
    } catch {
      toast.error(t("common:operationFailed"));
    }
  };

  /** Remove project from list without deleting files. */
  const handleRemoveProject = async () => {
    if (!removeTarget?.projectId) {
      toast.error(t("common:operationFailed"));
      return;
    }
    try {
      setIsRemoveBusy(true);
      await removeProject.mutateAsync({ projectId: removeTarget.projectId });
      toast.success(t("nav:projectTree.removed"));
      resetRemoveDialogState();
      await queryClient.invalidateQueries({
        queryKey: getProjectsQueryKey(),
      });
    } catch (err: any) {
      // 逻辑：项目不存在时直接刷新列表，避免弹错影响用户体验。
      if (isProjectMissingError(err)) {
        resetRemoveDialogState();
        await queryClient.invalidateQueries({
          queryKey: getProjectsQueryKey(),
        });
        return;
      }
      toast.error(err?.message ?? t("nav:projectTree.removeFailed"));
    } finally {
      setIsRemoveBusy(false);
    }
  };

  /** Permanently delete project files and remove it from the project space. */
  const handleDestroyProject = async () => {
    if (!removeTarget?.projectId) {
      toast.error(t("common:operationFailed"));
      return;
    }
    try {
      setIsRemoveBusy(true);
      await destroyProject.mutateAsync({ projectId: removeTarget.projectId });
      toast.success(t("nav:projectTree.permanentlyDeleted"));
      resetRemoveDialogState();
      await queryClient.invalidateQueries({
        queryKey: getProjectsQueryKey(),
      });
    } catch (err: any) {
      // 逻辑：项目不存在时直接刷新列表，避免弹错影响用户体验。
      if (isProjectMissingError(err)) {
        resetRemoveDialogState();
        await queryClient.invalidateQueries({
          queryKey: getProjectsQueryKey(),
        });
        return;
      }
      toast.error(err?.message ?? t("nav:projectTree.permanentDeleteFailed"));
    } finally {
      setIsRemoveBusy(false);
    }
  };

  const handleCreateChildProject = async () => {
    if (!createChildTarget?.node?.projectId) {
      toast.error(t("common:operationFailed"));
      return;
    }
    const title = createChildTarget.title.trim();
    try {
      setIsChildBusy(true);
      await createProject.mutateAsync({
        title: title || undefined,
        rootUri: createChildTarget.useCustomPath
          ? createChildTarget.customPath.trim() || undefined
          : undefined,
        parentProjectId: createChildTarget.node.projectId,
        enableVersionControl: createChildTarget.enableVersionControl,
      });
      toast.success(t("nav:projectTree.childCreated"));
      setCreateChildTarget(null);
      await queryClient.invalidateQueries({
        queryKey: getProjectsQueryKey(),
      });
    } catch (err: any) {
      toast.error(err?.message ?? t("common:createFailed"));
    } finally {
      setIsChildBusy(false);
    }
  };

  const handleImportChildProject = async () => {
    if (!importChildTarget?.node?.projectId) {
      toast.error(t("common:operationFailed"));
      return;
    }
    const path = importChildTarget.path.trim();
    if (!path) {
      toast.error(t("nav:projectTree.pathRequired"));
      return;
    }
    try {
      setIsImportChildBusy(true);
      await createProject.mutateAsync({
        rootUri: path,
        parentProjectId: importChildTarget.node.projectId,
        enableVersionControl: importChildTarget.enableVersionControl,
      });
      toast.success(t("nav:projectTree.childImported"));
      setImportChildTarget(null);
      await queryClient.invalidateQueries({
        queryKey: getProjectsQueryKey(),
      });
    } catch (err: any) {
      toast.error(err?.message ?? t("nav:projectTree.importFailed"));
    } finally {
      setIsImportChildBusy(false);
    }
  };

  /** Clear drag ghost overlay state. */
  const clearDragGhost = () => {
    if (dragGhostRafRef.current !== null) {
      cancelAnimationFrame(dragGhostRafRef.current);
      dragGhostRafRef.current = null;
    }
    dragGhostPositionRef.current = null;
    setDragGhost(null);
  };

  /** Schedule drag ghost position update. */
  const scheduleDragGhostUpdate = (x: number, y: number) => {
    if (typeof window === "undefined") return;
    dragGhostPositionRef.current = { x, y };
    if (dragGhostRafRef.current !== null) return;
    dragGhostRafRef.current = window.requestAnimationFrame(() => {
      dragGhostRafRef.current = null;
      const next = dragGhostPositionRef.current;
      if (!next) return;
      setDragGhost((prev) => (prev ? { ...prev, x: next.x, y: next.y } : prev));
    });
  };

  /** Clear pending auto-expand timer. */
  const clearAutoExpand = () => {
    const current = autoExpandRef.current;
    if (current?.timer) {
      window.clearTimeout(current.timer);
    }
    autoExpandRef.current = null;
  };

  /** Schedule auto-expand for a collapsed project. */
  const scheduleAutoExpand = (projectId: string | null) => {
    if (typeof window === "undefined") return;
    if (!projectId) {
      clearAutoExpand();
      return;
    }
    if (autoExpandRef.current?.projectId === projectId) return;
    clearAutoExpand();
    const rootUri = projectHierarchy.rootUriById.get(projectId);
    if (!rootUri) return;
    const descendants = projectHierarchy.descendantsById.get(projectId);
    if (!descendants || descendants.size === 0) return;
    const nodeKey = `${projectId}:${rootUri}`;
    const isExpanded = expandedNodes[nodeKey] ?? false;
    if (isExpanded) return;
    // 逻辑：拖拽悬停 300ms 后自动展开，便于继续拖到子项目。
    const timer = window.setTimeout(() => {
      setExpanded(nodeKey, true);
      autoExpandRef.current = null;
    }, 300);
    autoExpandRef.current = { projectId, timer };
  };

  /** Reset drag state for project moves. */
  const resetProjectDragState = () => {
    setDraggingProject(null);
    setDragOverProjectId(null);
    setDragInsertTarget(null);
    setIsRootDropActive(false);
    clearAutoExpand();
    clearDragGhost();
  };

  /** Resolve project title from index with fallback. */
  const resolveProjectTitle = (projectId: string) =>
    projectHierarchy.projectById.get(projectId)?.title ?? t("common:untitledProject");

  /** Check whether a drop target is valid. */
  const canDropProject = (sourceId: string, targetParentId: string | null) => {
    if (!sourceId) return false;
    if (targetParentId === sourceId) return false;
    const descendants = projectHierarchy.descendantsById.get(sourceId);
    // 逻辑：禁止把项目拖到自身或后代节点。
    if (targetParentId && descendants?.has(targetParentId)) return false;
    return true;
  };

  /** Apply project move mutation and refresh data. */
  const applyProjectMove = async (payload: {
    projectId: string;
    targetParentId: string | null;
    targetSiblingId?: string | null;
    targetPosition?: "before" | "after";
    mode: "reparent" | "reorder";
  }) => {
    try {
      setIsMoveBusy(true);
      await moveProject.mutateAsync({
        projectId: payload.projectId,
        targetParentProjectId: payload.targetParentId ?? null,
        targetSiblingProjectId: payload.targetSiblingId ?? undefined,
        targetPosition: payload.targetPosition ?? undefined,
      });
      toast.success(t(payload.mode === "reorder" ? "nav:projectTree.reorderSuccess" : "nav:projectTree.moveSuccess"));
      setPendingMove(null);
      await queryClient.invalidateQueries({ queryKey: getProjectsQueryKey() });
    } catch (err: any) {
      toast.error(err?.message ?? t("nav:projectTree.moveFailed"));
    } finally {
      setIsMoveBusy(false);
    }
  };

  /** Confirm project move after user approval. */
  const handleConfirmProjectMove = async () => {
    if (!pendingMove?.projectId) return;
    void applyProjectMove({
      projectId: pendingMove.projectId,
      targetParentId: pendingMove.targetParentId ?? null,
      targetSiblingId: pendingMove.targetSiblingId ?? undefined,
      targetPosition: pendingMove.targetPosition ?? undefined,
      mode: pendingMove.mode,
    });
  };

  /** Handle project drag start from tree. */
  const handleProjectDragStart = (
    node: FileNode,
    event: React.DragEvent<HTMLElement>
  ) => {
    if (node.kind !== "project" || !node.projectId) return;
    applyProjectDragPreview(event.currentTarget, event);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.projectId);
    setDraggingProject({ projectId: node.projectId, title: node.name });
  };

  /** Handle pointer-based drag for Electron. */
  const handleProjectPointerDown = (
    node: FileNode,
    event: React.PointerEvent<HTMLElement>
  ) => {
    if (!isElectron) return;
    if (event.button !== 0) return;
    if (node.kind !== "project" || !node.projectId) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const sourceProject = {
      projectId: node.projectId,
      title: node.name,
      icon: node.projectIcon ?? null,
    };
    let hasStartedDrag = false;
    let lastDropTarget: { projectId: string; position: ProjectDropPosition } | null =
      null;
    let lastRootDropActive = false;

    const updateDropTarget = (moveEvent: PointerEvent) => {
      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const rootTarget = target?.closest?.("[data-project-root-drop=\"true\"]");
      const projectTarget = target?.closest?.("[data-project-id]") as HTMLElement | null;
      const targetProjectId = projectTarget?.getAttribute("data-project-id") ?? null;
      if (rootTarget) {
        setIsRootDropActive(true);
        setDragOverProjectId(null);
        setDragInsertTarget(null);
        lastRootDropActive = true;
        lastDropTarget = null;
        return;
      }
      setIsRootDropActive(false);
      lastRootDropActive = false;
      if (
        targetProjectId &&
        projectTarget &&
        targetProjectId !== sourceProject.projectId
      ) {
        const dropPosition = resolveProjectDropPosition(
          projectTarget,
          moveEvent.clientY
        );
        const targetParentId =
          dropPosition === "inside"
            ? targetProjectId
            : projectHierarchy.parentById.get(targetProjectId) ?? null;
        if (canDropProject(sourceProject.projectId, targetParentId)) {
          if (dropPosition === "inside") {
            setDragOverProjectId(targetProjectId);
            setDragInsertTarget(null);
            scheduleAutoExpand(targetProjectId);
          } else {
            setDragOverProjectId(null);
            setDragInsertTarget({
              projectId: targetProjectId,
              position: dropPosition === "before" ? "before" : "after",
            });
            scheduleAutoExpand(null);
          }
          lastDropTarget = { projectId: targetProjectId, position: dropPosition };
          return;
        }
      }
      setDragOverProjectId(null);
      setDragInsertTarget(null);
      lastDropTarget = null;
      scheduleAutoExpand(null);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      if (!hasStartedDrag) {
        if (Math.hypot(deltaX, deltaY) < 4) return;
        // 逻辑：鼠标位移超过阈值后才进入拖拽态，避免误触打开项目。
        hasStartedDrag = true;
        suppressNextClickRef.current = true;
        setDraggingProject(sourceProject);
        setDragGhost({
          projectId: sourceProject.projectId,
          title: sourceProject.title,
          icon: sourceProject.icon,
          x: startX + 12,
          y: startY + 12,
        });
      }
      if (!hasStartedDrag) return;
      moveEvent.preventDefault();
      // 逻辑：拖拽影像略微偏移，避免遮挡指针。
      scheduleDragGhostUpdate(moveEvent.clientX + 12, moveEvent.clientY + 12);
      updateDropTarget(moveEvent);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      if (!hasStartedDrag) return;
      if (lastRootDropActive) {
        const currentParentId =
          projectHierarchy.parentById.get(sourceProject.projectId) ?? null;
        if (currentParentId) {
          setPendingMove({
            projectId: sourceProject.projectId,
            targetParentId: null,
            mode: "reparent",
          });
        }
      } else if (lastDropTarget) {
        const currentParentId =
          projectHierarchy.parentById.get(sourceProject.projectId) ?? null;
        if (lastDropTarget.position === "inside") {
          if (
            canDropProject(sourceProject.projectId, lastDropTarget.projectId) &&
            currentParentId !== lastDropTarget.projectId
          ) {
            setPendingMove({
              projectId: sourceProject.projectId,
              targetParentId: lastDropTarget.projectId,
              mode: "reparent",
            });
          }
        } else {
          const targetParentId =
            projectHierarchy.parentById.get(lastDropTarget.projectId) ?? null;
          if (canDropProject(sourceProject.projectId, targetParentId)) {
            // 逻辑：调整顺序无需确认，直接提交变更。
            void applyProjectMove({
              projectId: sourceProject.projectId,
              targetParentId,
              targetSiblingId: lastDropTarget.projectId,
              targetPosition:
                lastDropTarget.position === "before" ? "before" : "after",
              mode: "reorder",
            });
          }
        }
      }
      resetProjectDragState();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  /** Handle drag over a project node. */
  const handleProjectDragOver = (
    node: FileNode,
    event: React.DragEvent<HTMLElement>
  ) => {
    if (!draggingProject || node.kind !== "project" || !node.projectId) return;
    if (node.projectId === draggingProject.projectId) return;
    const dropPosition = resolveProjectDropPosition(
      event.currentTarget,
      event.clientY
    );
    const targetParentId =
      dropPosition === "inside"
        ? node.projectId
        : projectHierarchy.parentById.get(node.projectId) ?? null;
    if (!canDropProject(draggingProject.projectId, targetParentId)) {
      setDragOverProjectId(null);
      setDragInsertTarget(null);
      scheduleAutoExpand(null);
      return;
    }
    event.preventDefault();
    if (dropPosition === "inside") {
      setDragOverProjectId(node.projectId);
      setDragInsertTarget(null);
      scheduleAutoExpand(node.projectId);
    } else {
      setDragOverProjectId(null);
      setDragInsertTarget({
        projectId: node.projectId,
        position: dropPosition === "before" ? "before" : "after",
      });
      scheduleAutoExpand(null);
    }
    setIsRootDropActive(false);
  };

  /** Handle drag leave a project node. */
  const handleProjectDragLeave = (
    node: FileNode,
    _event: React.DragEvent<HTMLElement>
  ) => {
    if (dragOverProjectId && node.projectId === dragOverProjectId) {
      setDragOverProjectId(null);
    }
    if (dragInsertTarget?.projectId === node.projectId) {
      setDragInsertTarget(null);
    }
    scheduleAutoExpand(null);
  };

  /** Handle dropping a project onto another project node. */
  const handleProjectDrop = (
    node: FileNode,
    event: React.DragEvent<HTMLElement>
  ) => {
    if (!draggingProject || node.kind !== "project" || !node.projectId) return;
    if (node.projectId === draggingProject.projectId) return;
    const dropPosition = resolveProjectDropPosition(
      event.currentTarget,
      event.clientY
    );
    const targetParentId =
      dropPosition === "inside"
        ? node.projectId
        : projectHierarchy.parentById.get(node.projectId) ?? null;
    if (!canDropProject(draggingProject.projectId, targetParentId)) return;
    event.preventDefault();
    const currentParentId =
      projectHierarchy.parentById.get(draggingProject.projectId) ?? null;
    if (dropPosition === "inside") {
      // 逻辑：拖到同一父节点时不触发确认。
      if (currentParentId === node.projectId) {
        resetProjectDragState();
        return;
      }
      setPendingMove({
        projectId: draggingProject.projectId,
        targetParentId: node.projectId,
        mode: "reparent",
      });
    } else {
      // 逻辑：调整顺序无需确认，直接提交变更。
      void applyProjectMove({
        projectId: draggingProject.projectId,
        targetParentId,
        targetSiblingId: node.projectId,
        targetPosition: dropPosition === "before" ? "before" : "after",
        mode: "reorder",
      });
    }
    resetProjectDragState();
  };

  /** Handle drag end cleanup. */
  const handleProjectDragEnd = () => {
    resetProjectDragState();
  };

  /** Handle drag over root drop zone. */
  const handleRootDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!draggingProject) return;
    if (!canDropProject(draggingProject.projectId, null)) return;
    event.preventDefault();
    setIsRootDropActive(true);
    setDragOverProjectId(null);
    setDragInsertTarget(null);
    scheduleAutoExpand(null);
  };

  /** Handle drag leave root drop zone. */
  const handleRootDragLeave = () => {
    setIsRootDropActive(false);
    setDragInsertTarget(null);
    scheduleAutoExpand(null);
  };

  /** Handle dropping a project onto root drop zone. */
  const handleRootDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!draggingProject) return;
    if (!canDropProject(draggingProject.projectId, null)) return;
    event.preventDefault();
    const currentParentId =
      projectHierarchy.parentById.get(draggingProject.projectId) ?? null;
    // 逻辑：已经是根项目则不触发确认。
    if (!currentParentId) {
      resetProjectDragState();
      return;
    }
    setPendingMove({
      projectId: draggingProject.projectId,
      targetParentId: null,
      mode: "reparent",
    });
    resetProjectDragState();
  };

  const renderContextMenuContent = (node: FileNode) => (
    <ContextMenuContent className="w-52">
      {node.kind === "file" || node.kind === "project" ? (
        <ContextMenuItem icon={ArrowUpRight} onClick={() => handlePrimaryClick(node)}>
          {t("nav:projectTree.open")}
        </ContextMenuItem>
      ) : null}
      {node.kind === "project" ? (
        <ContextMenuItem
          icon={FolderOpen}
          onClick={() => void handleOpenInFileManager(node)}
        >
          {t("nav:projectTree.openInFileManager")}
        </ContextMenuItem>
      ) : null}
      {node.kind === "project" ? (
        <ContextMenuItem
          icon={ClipboardCopy}
          onClick={() => void handleCopyProjectPath(node)}
        >
          {t("nav:projectTree.copyPath")}
        </ContextMenuItem>
      ) : null}
      {node.kind === "project" ? <ContextMenuSeparator /> : null}
      {node.kind === "project" ? (
        <ContextMenuItem
          icon={node.isFavorite ? StarOff : Star}
          onClick={() => void handleToggleFavorite(node)}
        >
          {t(node.isFavorite ? "nav:projectTree.unfavorite" : "nav:projectTree.favorite")}
        </ContextMenuItem>
      ) : null}
      {node.kind === "project" ? (
        <ContextMenuItem
          icon={Settings}
          onClick={() => {
            if (!node.projectId) return;
            openProjectSettingsPage({
              projectId: node.projectId,
              rootUri: node.uri,
              title: node.name,
              icon: node.projectIcon ?? null,
            });
          }}
        >
          {t("nav:projectTree.projectSettings")}
        </ContextMenuItem>
      ) : null}
      {node.kind === "project" ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem icon={FolderPlus} onClick={() => openCreateChildDialog(node)}>
            {t("nav:projectTree.createChild")}
          </ContextMenuItem>
          <ContextMenuItem
            icon={FolderOpen}
            onClick={() => void openImportChildDialog(node)}
          >
            {t("nav:projectTree.importChild")}
          </ContextMenuItem>
        </>
      ) : null}
      <ContextMenuSeparator />
      <ContextMenuItem icon={PencilLine} onClick={() => openRenameDialog(node)}>
        {t("common:rename")}
      </ContextMenuItem>
      {node.kind === "project" ? (
        <ContextMenuItem icon={X} onClick={() => openRemoveDialog(node)}>
          {t("nav:projectTree.remove")}
        </ContextMenuItem>
      ) : (
        <ContextMenuItem icon={Trash2} onClick={() => openDeleteDialog(node)}>
          {t("common:delete")}
        </ContextMenuItem>
      )}
    </ContextMenuContent>
  );

  const handleContextMenuOpenChange = (node: FileNode, open: boolean) => {
    setContextSelectedUri(open ? getNodeKey(node) : null);
    if (open) {
      lastContextMenuAtRef.current = Date.now();
      suppressNextClickRef.current = true;
    }
  };

  const isPermanentRemoveConfirmed =
    isPermanentRemoveChecked && permanentRemoveText.trim() === "delete";
  const removeAction = isPermanentRemoveChecked
    ? handleDestroyProject
    : handleRemoveProject;
  const removeButtonText = isPermanentRemoveChecked ? t("nav:projectTree.permanentDelete") : t("nav:projectTree.remove");
  const isRemoveActionDisabled =
    isRemoveBusy || (isPermanentRemoveChecked && !isPermanentRemoveConfirmed);

  const favoriteProjects = useMemo(
    () => projects.filter((p) => p.isFavorite),
    [projects],
  );
  const normalProjects = useMemo(
    () => projects.filter((p) => !p.isFavorite),
    [projects],
  );

  /** Record timestamp on native contextmenu event (fires before Radix onOpenChange). */
  const handleNativeContextMenu = useCallback(() => {
    lastContextMenuAtRef.current = Date.now();
  }, []);

  const renderProjectNode = (project: ProjectInfo) => (
    <FileTreeNode
      key={project.rootUri}
      node={buildProjectNode(project)}
      depth={0}
      activeUri={activeUri}
      activeProjectRootUri={activeProjectRootUri}
      expandedNodes={expandedNodes}
      setExpanded={setExpanded}
      onPrimaryClick={handlePrimaryClick}
      renderContextMenuContent={renderContextMenuContent}
      contextSelectedUri={contextSelectedUri}
      onContextMenuOpenChange={handleContextMenuOpenChange}
      dragOverProjectId={dragOverProjectId ?? null}
      dragInsertTarget={dragInsertTarget ?? null}
      draggingProjectId={draggingProject?.projectId ?? null}
      disableNativeDrag={isElectron}
      onProjectDragStart={handleProjectDragStart}
      onProjectDragOver={handleProjectDragOver}
      onProjectDragLeave={handleProjectDragLeave}
      onProjectDrop={handleProjectDrop}
      onProjectDragEnd={handleProjectDragEnd}
      onProjectPointerDown={handleProjectPointerDown}
      onNativeContextMenu={handleNativeContextMenu}
      enableHoverPanel
    />
  );

  return (
    <>
      {dragGhost ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50"
          style={{ left: dragGhost.x, top: dragGhost.y }}
        >
          <div className="flex max-w-[240px] items-center gap-2 rounded-md border border-border/70 bg-background/90 px-2 py-1 text-xs text-foreground shadow-lg">
            {dragGhost.icon ? (
              <span className="text-xs leading-none">{dragGhost.icon}</span>
            ) : (
              <img src="/head_s.png" alt="" className="h-3.5 w-3.5 rounded-sm" />
            )}
            <span className="truncate">{dragGhost.title}</span>
          </div>
        </div>
      ) : null}
      {projects.length === 0 ? (
        <SidebarMenuItem>
          <div className="w-full px-2 py-3 text-center text-xs text-muted-foreground/70">
            {/* 逻辑：无项目时显示空态文案。 */}
            <div>{t("nav:projectTree.noProjects")}</div>
            <div className="mt-1">{t("nav:projectTree.addProjectHint")}</div>
          </div>
        </SidebarMenuItem>
      ) : (
        <>
          {favoriteProjects.length > 0 ? (
            <>
              <SidebarMenuItem>
                <div className="flex items-center gap-1 px-2 pt-1 pb-0.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                  <Star className="h-3 w-3" />
                  <span>{t("nav:projectTree.favorites")}</span>
                </div>
              </SidebarMenuItem>
              {favoriteProjects.map(renderProjectNode)}
              <SidebarMenuItem>
                <div className="w-full px-2 pt-1 pb-0.5">
                  <div className="border-t border-border/40" />
                </div>
              </SidebarMenuItem>
            </>
          ) : null}
          {normalProjects.map(renderProjectNode)}
        </>
      )}
      <SidebarMenuItem
        aria-hidden={!draggingProject}
        className={cn(!draggingProject && "h-0 overflow-hidden")}
      >
        <div
          data-project-root-drop="true"
          className={cn(
            "mx-1 rounded-md border border-dashed border-border/70 px-2 py-1 text-xs text-muted-foreground transition-colors",
            isRootDropActive && "border-primary/70 bg-primary/10 text-primary",
            !draggingProject && "pointer-events-none max-h-0 py-0 opacity-0",
          )}
          onDragOver={handleRootDragOver}
          onDragLeave={handleRootDragLeave}
          onDrop={handleRootDrop}
        >
          {t("nav:projectTree.dragToRoot")}
        </div>
      </SidebarMenuItem>

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (open) return;
          setRenameTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(renameTarget?.node.kind === "project" ? "common:renameProject" : "common:rename")}</DialogTitle>
          </DialogHeader>
          {renameTarget?.node.kind === "project" ? (
            <div className="flex items-center gap-3 py-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-10 shrink-0 rounded-lg text-lg"
                    aria-label={t("common:rename")}
                  >
                    {renameTarget.nextIcon ?? <SmilePlus className="size-5 text-muted-foreground" />}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[352px] max-w-[calc(100vw-24px)] p-0 min-h-[420px] bg-popover overflow-hidden"
                  align="start"
                >
                  <EmojiPicker
                    width="100%"
                    onSelect={(emoji) =>
                      setRenameTarget((prev) =>
                        prev ? { ...prev, nextIcon: emoji } : prev
                      )
                    }
                  />
                </PopoverContent>
              </Popover>
              <Input
                id="node-title"
                value={renameTarget?.nextName ?? ""}
                onChange={(event) =>
                  setRenameTarget((prev) =>
                    prev ? { ...prev, nextName: event.target.value } : prev
                  )
                }
                className="shadow-none focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleRename();
                  }
                }}
              />
            </div>
          ) : (
            <div className="grid gap-2 py-2">
              <Label htmlFor="node-title">
                {t("nav:projectTree.nameLabel")}
              </Label>
              <Input
                id="node-title"
                value={renameTarget?.nextName ?? ""}
                onChange={(event) =>
                  setRenameTarget((prev) =>
                    prev ? { ...prev, nextName: event.target.value } : prev
                  )
                }
                className="shadow-none focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleRename();
                  }
                }}
              />
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                {t("common:cancel")}
              </Button>
            </DialogClose>
            <Button
              className="bg-ol-blue-bg text-ol-blue hover:bg-ol-blue-bg-hover shadow-none"
              onClick={handleRename}
              disabled={isBusy}
            >
              {t("common:save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(createChildTarget)}
        onOpenChange={(open) => {
          if (open) return;
          setCreateChildTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("nav:projectTree.createChild")}</DialogTitle>
            <DialogDescription>{t("nav:projectTree.createChildDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="child-project-title" className="text-right">
                {t("nav:projectTree.nameLabel")}
              </Label>
              <Input
                id="child-project-title"
                value={createChildTarget?.title ?? ""}
                onChange={(event) =>
                  setCreateChildTarget((prev) =>
                    prev ? { ...prev, title: event.target.value } : prev
                  )
                }
                className="col-span-3"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleCreateChildProject();
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="child-project-custom-path" className="text-right">
                {t("nav:projectTree.customPath")}
              </Label>
              <div className="col-span-3 flex items-center gap-3">
                <Switch
                  checked={createChildTarget?.useCustomPath ?? false}
                  onCheckedChange={(checked) =>
                    setCreateChildTarget((prev) =>
                      prev ? { ...prev, useCustomPath: Boolean(checked) } : prev
                    )
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {t("nav:projectTree.customPathHint")}
                </span>
              </div>
            </div>
            {createChildTarget?.useCustomPath ? (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="child-project-path" className="text-right">
                  {t("nav:projectTree.path")}
                </Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Input
                    id="child-project-path"
                    value={createChildTarget?.customPath ?? ""}
                    onChange={(event) =>
                      setCreateChildTarget((prev) =>
                        prev ? { ...prev, customPath: event.target.value } : prev
                      )
                    }
                    placeholder="file://... 或 /path/to/project"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      const next = await pickDirectory(createChildTarget?.customPath);
                      if (!next) return;
                      setCreateChildTarget((prev) =>
                        prev ? { ...prev, customPath: next } : prev
                      );
                    }}
                  >
                    {t("nav:projectTree.select")}
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="child-project-version-control" className="text-right">
                {t("nav:projectTree.gitControl")}
              </Label>
              <div className="col-span-3 flex items-center gap-3">
                <Switch
                  id="child-project-version-control"
                  checked={createChildTarget?.enableVersionControl ?? true}
                  onCheckedChange={(checked) =>
                    setCreateChildTarget((prev) =>
                      prev
                        ? { ...prev, enableVersionControl: Boolean(checked) }
                        : prev
                    )
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {t("nav:projectTree.gitControlHint")}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                {t("common:cancel")}
              </Button>
            </DialogClose>
            <Button onClick={handleCreateChildProject} disabled={isChildBusy}>
              {t("common:create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(importChildTarget)}
        onOpenChange={(open) => {
          if (open) return;
          setImportChildTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("nav:projectTree.importChild")}</DialogTitle>
            <DialogDescription>{t("nav:projectTree.importChildDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="import-child-path" className="text-right">
                {t("nav:projectTree.path")}
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <Input
                  id="import-child-path"
                  value={importChildTarget?.path ?? ""}
                  onChange={(event) =>
                    setImportChildTarget((prev) =>
                      prev ? { ...prev, path: event.target.value } : prev
                    )
                  }
                  placeholder="file://... 或 /path/to/project"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const next = await pickDirectory(importChildTarget?.path);
                    if (!next) return;
                    setImportChildTarget((prev) =>
                      prev ? { ...prev, path: next } : prev
                    );
                  }}
                >
                  {t("nav:projectTree.select")}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="import-child-version-control" className="text-right">
                {t("nav:projectTree.gitControl")}
              </Label>
              <div className="col-span-3 flex items-center gap-3">
                <Switch
                  id="import-child-version-control"
                  checked={importChildTarget?.enableVersionControl ?? true}
                  onCheckedChange={(checked) =>
                    setImportChildTarget((prev) =>
                      prev
                        ? { ...prev, enableVersionControl: Boolean(checked) }
                        : prev
                    )
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {t("nav:projectTree.gitControlHint")}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                {t("common:cancel")}
              </Button>
            </DialogClose>
            <Button onClick={handleImportChildProject} disabled={isImportChildBusy}>
              {t("common:confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (open) return;
          setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("nav:projectTree.deleteTitle")}</DialogTitle>
            <DialogDescription>{t("nav:projectTree.deleteFileDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                {t("common:cancel")}
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={isBusy}>
              {t("common:delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (open) return;
          resetRemoveDialogState();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("nav:projectTree.removeTitle")}</DialogTitle>
            <DialogDescription>{t("nav:projectTree.removeDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-start gap-2">
              <Checkbox
                id="remove-project-permanent"
                checked={isPermanentRemoveChecked}
                onCheckedChange={(checked) => {
                  const nextChecked = Boolean(checked);
                  setIsPermanentRemoveChecked(nextChecked);
                  if (!nextChecked) {
                    // 逻辑：取消勾选时清空确认输入，避免误触发彻底删除。
                    setPermanentRemoveText("");
                  }
                }}
              />
              <Label htmlFor="remove-project-permanent">
                {t("nav:projectTree.permanentDeleteHint")}
              </Label>
            </div>
            {isPermanentRemoveChecked ? (
              <div className="grid gap-2">
                <Label htmlFor="remove-project-confirm">{t("nav:projectTree.permanentDeleteConfirmLabel")}</Label>
                <Input
                  id="remove-project-confirm"
                  value={permanentRemoveText}
                  onChange={(event) => setPermanentRemoveText(event.target.value)}
                  placeholder="delete"
                />
                <p className="text-xs text-muted-foreground">
                  {t("nav:projectTree.permanentDeleteNote")}
                </p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                {t("common:cancel")}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={removeAction}
              disabled={isRemoveActionDisabled}
            >
              {removeButtonText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingMove && pendingMove.mode === "reparent")}
        onOpenChange={(open) => {
          if (open || isMoveBusy) return;
          setPendingMove(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t(pendingMove?.mode === "reorder" ? "nav:projectTree.reorderTitle" : "nav:projectTree.moveTitle")}
            </DialogTitle>
            <DialogDescription>
              {pendingMove
                ? pendingMove.mode === "reorder"
                  ? t("nav:projectTree.reorderDesc", {
                      project: resolveProjectTitle(pendingMove.projectId),
                      parent: pendingMove.targetParentId
                        ? resolveProjectTitle(pendingMove.targetParentId)
                        : t("nav:projectTree.rootProject"),
                    })
                  : pendingMove.targetParentId
                    ? t("nav:projectTree.moveToDesc", {
                        project: resolveProjectTitle(pendingMove.projectId),
                        parent: resolveProjectTitle(pendingMove.targetParentId),
                      })
                    : t("nav:projectTree.moveToRootDesc", {
                        project: resolveProjectTitle(pendingMove.projectId),
                      })
                : t("nav:projectTree.confirmMoveDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs text-muted-foreground">
            {t("nav:projectTree.moveNote")}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={isMoveBusy}>
                {t("common:cancel")}
              </Button>
            </DialogClose>
            <Button onClick={handleConfirmProjectMove} disabled={isMoveBusy}>
              {isMoveBusy
                ? t(pendingMove?.mode === "reorder" ? "nav:projectTree.reordering" : "nav:projectTree.moving")
                : t(pendingMove?.mode === "reorder" ? "nav:projectTree.reorderTitle" : "nav:projectTree.moveTitle")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

type PageTreePickerProps = {
  projects?: ProjectInfo[];
  activeUri?: string | null;
  onSelect: (uri: string) => void;
};

/** Project tree picker (folder selection only). */
export const PageTreePicker = ({
  projects,
  activeUri,
  onSelect,
}: PageTreePickerProps) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const activeProjectRootUri = useMemo(
    () => resolveActiveProjectRootUri(projects, activeUri ?? null),
    [activeUri, projects]
  );

  const setExpanded = (uri: string, isExpanded: boolean) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [uri]: isExpanded,
    }));
  };

  const handlePrimaryClick = (node: FileNode) => {
    if (node.kind === "file") return;
    if (node.kind === "project") {
      onSelect(node.uri);
    }
    const nodeKey = getNodeKey(node);
    const isExpanded = expandedNodes[nodeKey] ?? false;
    setExpanded(nodeKey, !isExpanded);
  };

  const renderContextMenuContent = () => null;

  if (!projects?.length) {
    return null;
  }

  return (
    <SidebarProvider className="min-h-0 w-full">
      <SidebarMenu className="w-full gap-2">
        {projects.map((project) => (
          <FileTreeNode
            key={project.rootUri}
            node={buildProjectNode(project)}
            depth={0}
            activeUri={activeUri ?? null}
            activeProjectRootUri={activeProjectRootUri}
            expandedNodes={expandedNodes}
            setExpanded={setExpanded}
            onPrimaryClick={handlePrimaryClick}
            renderContextMenuContent={renderContextMenuContent}
            contextSelectedUri={null}
            onContextMenuOpenChange={() => undefined}
            subItemGapClassName="gap-2"
            draggingProjectId={null}
          />
        ))}
      </SidebarMenu>
    </SidebarProvider>
  );
};
