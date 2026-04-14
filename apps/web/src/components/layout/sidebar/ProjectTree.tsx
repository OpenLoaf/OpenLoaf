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
import { useAppState } from "@/hooks/use-app-state";
import { isElectronEnv } from "@/utils/is-electron-env";
import { resolveProjectModeProjectShell } from "@/lib/project-mode";
import { openProjectShell } from "@/lib/project-shell";
import { useMutation } from "@tanstack/react-query";
import {
  SidebarMenuItem,
  SidebarMenu,
  SidebarProvider,
} from "@openloaf/ui/sidebar";
import { Button } from "@openloaf/ui/button";
import { Checkbox } from "@openloaf/ui/checkbox";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ArrowUpRight,
  ClipboardCopy,
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
import {
  BOARD_INDEX_FILE_NAME,
  isBoardFolderName,
  getBoardDisplayName,
  getDisplayFileName,
} from "@/lib/file-name";
import { buildBoardChatTabState } from "@/components/board/utils/board-chat-tab";
import { Switch } from "@openloaf/ui/switch";
import { buildChildUri } from "@/components/project/filesystem/utils/file-system-utils";
import { cn } from "@/lib/utils";
import { buildProjectHierarchyIndex } from "@/lib/project-tree";
import { openProjectSettingsPage } from "@/lib/project-shell";
import { buildStackItemForEntry } from "@/components/file/lib/open-file";
import type { PageTreeMenuProps, ProjectInfo, FileNode } from "./projectTreeTypes";
import {
  buildProjectNode,
  getNodeKey,
  resolveActiveProjectRootUri,
} from "./projectTreeTypes";
import { FileTreeNode } from "./FileTreeNode";
import { useProjectTreeDrag } from "./useProjectTreeDrag";
import { useProjectTreeActions } from "./useProjectTreeActions";

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
  const appState = useAppState();
  const isElectron = isElectronEnv();
  const renameProjectMut = useMutation(trpc.project.update.mutationOptions());
  const createProjectMut = useMutation(trpc.project.create.mutationOptions());
  const removeProjectMut = useMutation(trpc.project.remove.mutationOptions());
  const destroyProjectMut = useMutation(trpc.project.destroy.mutationOptions());
  const moveProjectMut = useMutation(trpc.project.move.mutationOptions());
  const toggleFavoriteMut = useMutation(trpc.project.toggleFavorite.mutationOptions());
  const renameFileMut = useMutation(trpc.fs.rename.mutationOptions());
  const deleteFileMut = useMutation(trpc.fs.delete.mutationOptions());

  const [contextSelectedUri, setContextSelectedUri] = useState<string | null>(null);

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

  const drag = useProjectTreeDrag({
    moveProject: moveProjectMut,
    projectHierarchy,
    expandedNodes,
    setExpanded,
    isElectron,
    suppressNextClickRef,
  });

  const actions = useProjectTreeActions({
    renameProject: renameProjectMut,
    createProject: createProjectMut,
    removeProject: removeProjectMut,
    destroyProject: destroyProjectMut,
    toggleFavorite: toggleFavoriteMut,
    renameFile: renameFileMut,
    deleteFile: deleteFileMut,
    projectRootById,
  });

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
            boardId,
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
          onClick={() => void actions.handleOpenInFileManager(node)}
        >
          {t("nav:projectTree.openInFileManager")}
        </ContextMenuItem>
      ) : null}
      {node.kind === "project" ? (
        <ContextMenuItem
          icon={ClipboardCopy}
          onClick={() => void actions.handleCopyProjectPath(node)}
        >
          {t("nav:projectTree.copyPath")}
        </ContextMenuItem>
      ) : null}
      {node.kind === "project" ? <ContextMenuSeparator /> : null}
      {node.kind === "project" ? (
        <ContextMenuItem
          icon={node.isFavorite ? StarOff : Star}
          onClick={() => void actions.handleToggleFavorite(node)}
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
          <ContextMenuItem icon={FolderPlus} onClick={() => actions.openCreateChildDialog(node)}>
            {t("nav:projectTree.createChild")}
          </ContextMenuItem>
          <ContextMenuItem
            icon={FolderOpen}
            onClick={() => void actions.openImportChildDialog(node)}
          >
            {t("nav:projectTree.importChild")}
          </ContextMenuItem>
        </>
      ) : null}
      <ContextMenuSeparator />
      <ContextMenuItem icon={PencilLine} onClick={() => actions.openRenameDialog(node)}>
        {t("common:rename")}
      </ContextMenuItem>
      {node.kind === "project" ? (
        <ContextMenuItem icon={X} onClick={() => actions.openRemoveDialog(node)}>
          {t("nav:projectTree.remove")}
        </ContextMenuItem>
      ) : (
        <ContextMenuItem icon={Trash2} onClick={() => actions.openDeleteDialog(node)}>
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
      dragOverProjectId={drag.dragOverProjectId ?? null}
      dragInsertTarget={drag.dragInsertTarget ?? null}
      draggingProjectId={drag.draggingProject?.projectId ?? null}
      disableNativeDrag={isElectron}
      onProjectDragStart={drag.handleProjectDragStart}
      onProjectDragOver={drag.handleProjectDragOver}
      onProjectDragLeave={drag.handleProjectDragLeave}
      onProjectDrop={drag.handleProjectDrop}
      onProjectDragEnd={drag.handleProjectDragEnd}
      onProjectPointerDown={drag.handleProjectPointerDown}
      onNativeContextMenu={handleNativeContextMenu}
      enableHoverPanel
    />
  );

  return (
    <>
      {drag.dragGhost ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50"
          style={{ left: drag.dragGhost.x, top: drag.dragGhost.y }}
        >
          <div className="flex max-w-[240px] items-center gap-2 rounded-3xl border border-border/70 bg-background/90 px-2 py-1 text-xs text-foreground shadow-none">
            {drag.dragGhost.icon ? (
              <span className="text-xs leading-none">{drag.dragGhost.icon}</span>
            ) : (
              <img src="/head_s.png" alt="" className="h-3.5 w-3.5 rounded-3xl" />
            )}
            <span className="truncate">{drag.dragGhost.title}</span>
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
        aria-hidden={!drag.draggingProject}
        className={cn(!drag.draggingProject && "h-0 overflow-hidden")}
      >
        <div
          data-project-root-drop="true"
          className={cn(
            "mx-1 rounded-3xl border border-dashed border-border/70 px-2 py-1 text-xs text-muted-foreground transition-colors",
            drag.isRootDropActive && "border-primary/70 bg-primary/10 text-primary",
            !drag.draggingProject && "pointer-events-none max-h-0 py-0 opacity-0",
          )}
          onDragOver={drag.handleRootDragOver}
          onDragLeave={drag.handleRootDragLeave}
          onDrop={drag.handleRootDrop}
        >
          {t("nav:projectTree.dragToRoot")}
        </div>
      </SidebarMenuItem>

      <Dialog
        open={Boolean(actions.renameTarget)}
        onOpenChange={(open) => {
          if (open) return;
          actions.setRenameTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(actions.renameTarget?.node.kind === "project" ? "common:renameProject" : "common:rename")}</DialogTitle>
          </DialogHeader>
          {actions.renameTarget?.node.kind === "project" ? (
            <div className="flex items-center gap-3 py-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-10 shrink-0 rounded-3xl text-lg"
                    aria-label={t("common:rename")}
                  >
                    {actions.renameTarget.nextIcon ?? <SmilePlus className="size-5 text-muted-foreground" />}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[352px] max-w-[calc(100vw-24px)] p-0 min-h-[420px] bg-popover overflow-hidden"
                  align="start"
                >
                  <EmojiPicker
                    width="100%"
                    onSelect={(emoji) =>
                      actions.setRenameTarget((prev) =>
                        prev ? { ...prev, nextIcon: emoji } : prev
                      )
                    }
                  />
                </PopoverContent>
              </Popover>
              <Input
                id="node-title"
                value={actions.renameTarget?.nextName ?? ""}
                onChange={(event) =>
                  actions.setRenameTarget((prev) =>
                    prev ? { ...prev, nextName: event.target.value } : prev
                  )
                }
                className="shadow-none focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    actions.handleRename();
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
                value={actions.renameTarget?.nextName ?? ""}
                onChange={(event) =>
                  actions.setRenameTarget((prev) =>
                    prev ? { ...prev, nextName: event.target.value } : prev
                  )
                }
                className="shadow-none focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    actions.handleRename();
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
              className="bg-secondary text-foreground hover:bg-secondary/80 shadow-none"
              onClick={actions.handleRename}
              disabled={actions.isBusy}
            >
              {t("common:save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(actions.createChildTarget)}
        onOpenChange={(open) => {
          if (open) return;
          actions.setCreateChildTarget(null);
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
                value={actions.createChildTarget?.title ?? ""}
                onChange={(event) =>
                  actions.setCreateChildTarget((prev) =>
                    prev ? { ...prev, title: event.target.value } : prev
                  )
                }
                className="col-span-3"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    actions.handleCreateChildProject();
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
                  checked={actions.createChildTarget?.useCustomPath ?? false}
                  onCheckedChange={(checked) =>
                    actions.setCreateChildTarget((prev) =>
                      prev ? { ...prev, useCustomPath: Boolean(checked) } : prev
                    )
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {t("nav:projectTree.customPathHint")}
                </span>
              </div>
            </div>
            {actions.createChildTarget?.useCustomPath ? (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="child-project-path" className="text-right">
                  {t("nav:projectTree.path")}
                </Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Input
                    id="child-project-path"
                    value={actions.createChildTarget?.customPath ?? ""}
                    onChange={(event) =>
                      actions.setCreateChildTarget((prev) =>
                        prev ? { ...prev, customPath: event.target.value } : prev
                      )
                    }
                    placeholder={t('projectTree.pathPlaceholder', { defaultValue: 'file://... 或 /path/to/project' })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      const next = await actions.pickDirectory(actions.createChildTarget?.customPath);
                      if (!next) return;
                      actions.setCreateChildTarget((prev) =>
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
                  checked={actions.createChildTarget?.enableVersionControl ?? true}
                  onCheckedChange={(checked) =>
                    actions.setCreateChildTarget((prev) =>
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
            <Button onClick={actions.handleCreateChildProject} disabled={actions.isChildBusy}>
              {t("common:create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(actions.importChildTarget)}
        onOpenChange={(open) => {
          if (open) return;
          actions.setImportChildTarget(null);
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
                  value={actions.importChildTarget?.path ?? ""}
                  onChange={(event) =>
                    actions.setImportChildTarget((prev) =>
                      prev ? { ...prev, path: event.target.value } : prev
                    )
                  }
                  placeholder={t('projectTree.pathPlaceholder', { defaultValue: 'file://... 或 /path/to/project' })}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const next = await actions.pickDirectory(actions.importChildTarget?.path);
                    if (!next) return;
                    actions.setImportChildTarget((prev) =>
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
                  checked={actions.importChildTarget?.enableVersionControl ?? true}
                  onCheckedChange={(checked) =>
                    actions.setImportChildTarget((prev) =>
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
            <Button onClick={actions.handleImportChildProject} disabled={actions.isImportChildBusy}>
              {t("common:confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(actions.deleteTarget)}
        onOpenChange={(open) => {
          if (open) return;
          actions.setDeleteTarget(null);
        }}
        title={t("nav:projectTree.deleteTitle")}
        description={t("nav:projectTree.deleteFileDesc")}
        confirmLabel={t("common:delete")}
        variant="destructive"
        loading={actions.isBusy}
        onConfirm={actions.handleDelete}
      />

      <ConfirmDialog
        open={Boolean(actions.removeTarget)}
        onOpenChange={(open) => {
          if (open) return;
          actions.resetRemoveDialogState();
        }}
        title={t("nav:projectTree.removeTitle")}
        description={t("nav:projectTree.removeDesc")}
        confirmLabel={actions.removeButtonText}
        variant="destructive"
        disabled={actions.isRemoveActionDisabled}
        loading={actions.isRemoveBusy}
        onConfirm={actions.removeAction}
      >
        <div className="grid gap-4 py-4">
          <div className="flex items-start gap-2">
            <Checkbox
              id="remove-project-permanent"
              checked={actions.isPermanentRemoveChecked}
              onCheckedChange={(checked) => {
                const nextChecked = Boolean(checked);
                actions.setIsPermanentRemoveChecked(nextChecked);
                if (!nextChecked) {
                  actions.setPermanentRemoveText("");
                }
              }}
            />
            <Label htmlFor="remove-project-permanent">
              {t("nav:projectTree.permanentDeleteHint")}
            </Label>
          </div>
          {actions.isPermanentRemoveChecked ? (
            <div className="grid gap-2">
              <Label htmlFor="remove-project-confirm">{t("nav:projectTree.permanentDeleteConfirmLabel")}</Label>
              <Input
                id="remove-project-confirm"
                value={actions.permanentRemoveText}
                onChange={(event) => actions.setPermanentRemoveText(event.target.value)}
                placeholder="delete"
              />
              <p className="text-xs text-muted-foreground">
                {t("nav:projectTree.permanentDeleteNote")}
              </p>
            </div>
          ) : null}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(drag.pendingMove && drag.pendingMove.mode === "reparent")}
        onOpenChange={(open) => {
          if (open || drag.isMoveBusy) return;
          drag.setPendingMove(null);
        }}
        title={t(drag.pendingMove?.mode === "reorder" ? "nav:projectTree.reorderTitle" : "nav:projectTree.moveTitle")}
        description={
          drag.pendingMove
            ? drag.pendingMove.mode === "reorder"
              ? t("nav:projectTree.reorderDesc", {
                  project: drag.resolveProjectTitle(drag.pendingMove.projectId),
                  parent: drag.pendingMove.targetParentId
                    ? drag.resolveProjectTitle(drag.pendingMove.targetParentId)
                    : t("nav:projectTree.rootProject"),
                })
              : drag.pendingMove.targetParentId
                ? t("nav:projectTree.moveToDesc", {
                    project: drag.resolveProjectTitle(drag.pendingMove.projectId),
                    parent: drag.resolveProjectTitle(drag.pendingMove.targetParentId),
                  })
                : t("nav:projectTree.moveToRootDesc", {
                    project: drag.resolveProjectTitle(drag.pendingMove.projectId),
                  })
            : t("nav:projectTree.confirmMoveDesc")
        }
        confirmLabel={t(drag.pendingMove?.mode === "reorder" ? "nav:projectTree.reorderTitle" : "nav:projectTree.moveTitle")}
        loadingLabel={t(drag.pendingMove?.mode === "reorder" ? "nav:projectTree.reordering" : "nav:projectTree.moving")}
        loading={drag.isMoveBusy}
        onConfirm={drag.handleConfirmProjectMove}
      >
        <div className="text-xs text-muted-foreground">
          {t("nav:projectTree.moveNote")}
        </div>
      </ConfirmDialog>
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
