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

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { Button } from "@openloaf/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@openloaf/ui/breadcrumb";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";
import { toast } from "sonner";
import { PageTreePicker } from "@/components/layout/sidebar/ProjectTree";
import { FileSystemGrid } from "./FileSystemGrid";
import { Ban, FolderPlus, PencilLine } from "lucide-react";
import { useFileSelection } from "@/hooks/use-file-selection";
import { useFileRename } from "@/hooks/use-file-rename";
import { useProjects } from "@/hooks/use-projects";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { isBoardFolderName } from "@/lib/file-name";
import type { ProjectNode } from "@openloaf/api/services/projectTreeService";
import {
  IGNORE_NAMES,
  buildChildUri,
  formatScopedProjectPath,
  getDisplayPathFromUri,
  getParentRelativePath,
  getRelativePathFromUri,
  parseScopedProjectPath,
  getUniqueName,
  type FileSystemEntry,
} from "../utils/file-system-utils";
import { sortEntriesByType } from "../utils/entry-sort";

type ProjectTreeNode = ProjectNode;

/** Transfer mode for the dialog. */
type TransferMode = "copy" | "move" | "select";
/** Select target for select mode. */
type SelectTarget = "folder" | "file";

type ProjectFileSystemTransferDialogProps = {
  /** Whether the dialog is open. */
  open: boolean;
  /** Notify open state changes. */
  onOpenChange: (open: boolean) => void;
  /** Entries to transfer when mode is copy/move. */
  entries?: FileSystemEntry[];
  /** Transfer mode for the dialog. */
  mode?: TransferMode;
  /** Default root uri for the project tree. */
  defaultRootUri?: string;
  /** Default active folder uri for browsing. */
  defaultActiveUri?: string;
  /** Select target for select mode. */
  selectTarget?: SelectTarget;
  /** Optional callback for select mode. */
  onSelectTarget?: (targetUri: string) => void;
  /** Optional callback for file selection mode. */
  onSelectFileRefs?: (fileRefs: string[]) => void;
};

/** Flatten project tree to a list. */
function flattenProjects(nodes?: ProjectTreeNode[]) {
  const results: Array<{ rootUri: string; title: string; projectId?: string }> = [];
  const walk = (items?: ProjectTreeNode[]) => {
    items?.forEach((item) => {
      results.push({
        rootUri: item.rootUri,
        title: item.title,
        projectId: item.projectId,
      });
      if (item.children?.length) {
        walk(item.children);
      }
    });
  };
  walk(nodes);
  return results;
}

/** Normalize project tree for PageTreePicker. */
function normalizePageTreeProjects(nodes?: ProjectTreeNode[]): ProjectTreeNode[] {
  const walk = (items?: ProjectTreeNode[]): ProjectTreeNode[] =>
    (items ?? [])
      // 过滤掉缺失 projectId 的节点，避免 UI 产生不完整的项目入口。
      .filter((item) => Boolean(item.projectId))
      .map((item) => ({
        ...item,
        children: item.children?.length ? walk(item.children) : [],
      }));
  return walk(nodes);
}

/** Check if target uri is inside source uri. */
function isSubPath(sourceUri: string, targetUri: string) {
  if (!sourceUri || !targetUri) return false;
  return targetUri === sourceUri || targetUri.startsWith(`${sourceUri}/`);
}

/** Transfer dialog for copy/move/select actions. */
const ProjectFileSystemTransferDialog = memo(function ProjectFileSystemTransferDialog({
  open,
  onOpenChange,
  entries: transferEntries = [],
  mode = "copy",
  defaultRootUri,
  defaultActiveUri,
  selectTarget = "folder",
  onSelectTarget,
  onSelectFileRefs,
}: ProjectFileSystemTransferDialogProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const queryClient = useQueryClient();
  const projectListQuery = useProjects();
  const [activeRootUri, setActiveRootUri] = useState<string | null>(
    defaultRootUri ?? null
  );
  const [activeUri, setActiveUri] = useState<string | null>(null);

  const copyMutation = useMutation(trpc.fs.copy.mutationOptions());
  const mkdirMutation = useMutation(trpc.fs.mkdir.mutationOptions());
  const renameMutation = useMutation(trpc.fs.rename.mutationOptions());
  const projectOptions = useMemo(
    () => flattenProjects(projectListQuery.data as ProjectTreeNode[] | undefined),
    [projectListQuery.data]
  );
  /** Map root uri to project id for selections. */
  const projectIdByRootUri = useMemo(() => {
    const map = new Map<string, string>();
    projectOptions.forEach((item) => {
      if (item.projectId) {
        map.set(item.rootUri, item.projectId);
      }
    });
    return map;
  }, [projectOptions]);
  const activeProjectId = useMemo(
    () => (activeRootUri ? projectIdByRootUri.get(activeRootUri) : undefined),
    [activeRootUri, projectIdByRootUri]
  );
  const listQuery = useQuery(
    trpc.fs.list.queryOptions(
      activeUri !== null && workspaceId
        ? { workspaceId, projectId: activeProjectId, uri: activeUri }
        : skipToken
    )
  );
  const projectTree = useMemo(
    () => normalizePageTreeProjects(projectListQuery.data as ProjectTreeNode[] | undefined),
    [projectListQuery.data]
  );
  const gridEntries = useMemo(() => {
    const entries = ((listQuery.data?.entries ?? []) as FileSystemEntry[]).filter(
      (entry) => !IGNORE_NAMES.has(entry.name)
    );
    return sortEntriesByType(entries);
  }, [listQuery.data?.entries]);
  /** Track current grid selection. */
  const {
    selectedUris,
    replaceSelection,
    toggleSelection,
    applySelectionChange,
  } = useFileSelection();
  /** Selected entries in the current grid view. */
  const selectedEntries = useMemo(
    () => gridEntries.filter((entry) => selectedUris.has(entry.uri)),
    [gridEntries, selectedUris]
  );
  /** Selected file references for select mode. */
  const selectedFileRefs = useMemo(() => {
    // 中文注释：仅选择文件模式下返回可插入的文件引用。
    if (mode !== "select" || selectTarget !== "file") return [];
    if (!activeRootUri) return [];
    const projectId = projectIdByRootUri.get(activeRootUri);
    if (!projectId) return [];
    return selectedEntries
      .filter((entry) => entry.kind === "file")
      .map((entry) => {
        const relativePath = getRelativePathFromUri(activeRootUri, entry.uri);
        if (!relativePath) return "";
        return formatScopedProjectPath({ projectId, relativePath, includeAt: true });
      })
      .filter(Boolean);
  }, [activeRootUri, mode, projectIdByRootUri, selectTarget, selectedEntries]);
  /** Track the entry that opened the context menu. */
  const [contextTargetUri, setContextTargetUri] = useState<string | null>(null);
  /** Resolve macOS-specific modifier behavior. */
  const isMac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac")),
    []
  );
  const parentUri = useMemo(() => {
    if (activeUri === null || !activeRootUri) return null;
    const rootRelative = getRelativePathFromUri(activeRootUri, activeRootUri);
    const currentRelative = getRelativePathFromUri(activeRootUri, activeUri);
    const rootParts = rootRelative ? rootRelative.split("/").filter(Boolean) : [];
    const currentParts = currentRelative ? currentRelative.split("/").filter(Boolean) : [];
    // 已到根目录时不再返回上级。
    if (currentParts.length <= rootParts.length) return null;
    return currentParts.slice(0, -1).join("/");
  }, [activeUri, activeRootUri]);

  /** Resolve context menu target entry. */
  const contextEntry = useMemo(() => {
    if (!contextTargetUri) return null;
    return gridEntries.find((entry) => entry.uri === contextTargetUri) ?? null;
  }, [contextTargetUri, gridEntries]);

  /** Rename a folder entry within the active directory. */
  const handleRename = useCallback(
    async (target: FileSystemEntry, nextName: string) => {
      if (activeUri === null) return null;
      try {
        const targetUri = buildChildUri(activeUri, nextName);
        await renameMutation.mutateAsync({
          workspaceId,
          projectId: activeProjectId,
          from: target.uri,
          to: targetUri,
        });
        await listQuery.refetch();
        toast.success("已重命名");
        return targetUri;
      } catch (error: any) {
        toast.error(error?.message ?? "重命名失败");
        return null;
      }
    },
    [activeProjectId, activeUri, listQuery, renameMutation, workspaceId]
  );

  /** Manage rename state for folder entries. */
  const {
    renamingUri,
    renamingValue,
    setRenamingValue,
    requestRename,
    requestRenameByInfo,
    handleRenamingSubmit,
    handleRenamingCancel,
  } = useFileRename({
    entries: gridEntries,
    allowRename: (entry) => entry.kind === "folder",
    onRename: handleRename,
    onSelectionReplace: replaceSelection,
  });

  /** Resolve whether a click should toggle selection. */
  const shouldToggleSelection = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      // 中文注释：macOS 只使用 Command 键，避免 Ctrl 右键误触切换。
      return isMac ? event.metaKey : event.metaKey || event.ctrlKey;
    },
    [isMac]
  );

  /** Resolve selection mode for drag selection. */
  const resolveSelectionMode = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const toggle = isMac ? event.metaKey : event.metaKey || event.ctrlKey;
      // 中文注释：macOS 下忽略 Ctrl，避免右键菜单触发框选切换。
      return toggle ? "toggle" : "replace";
    },
    [isMac]
  );

  /** Handle left-click selection updates. */
  const handleEntryClick = useCallback(
    (entry: FileSystemEntry, event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      if (event.nativeEvent?.which && event.nativeEvent.which !== 1) return;
      if (isMac && event.ctrlKey) return;
      if (shouldToggleSelection(event)) {
        toggleSelection(entry.uri);
        setContextTargetUri(null);
        return;
      }
      replaceSelection([entry.uri]);
      setContextTargetUri(null);
    },
    [isMac, replaceSelection, shouldToggleSelection, toggleSelection]
  );

  /** Handle selection updates from drag selection. */
  const handleSelectionChange = useCallback(
    (uris: string[], mode: "replace" | "toggle") => {
      applySelectionChange(uris, mode);
      setContextTargetUri(null);
    },
    [applySelectionChange]
  );

  /** Capture context menu target before menu opens. */
  const handleGridContextMenuCapture = useCallback(
    (_event: ReactMouseEvent<HTMLDivElement>, payload: { uri: string | null }) => {
      setContextTargetUri(payload.uri);
      if (!payload.uri) return;
      if (!selectedUris.has(payload.uri)) {
        replaceSelection([payload.uri]);
      }
    },
    [replaceSelection, selectedUris]
  );

  /** Reset context target when menu closes. */
  const handleContextMenuOpenChange = useCallback((open: boolean) => {
    if (open) return;
    setContextTargetUri(null);
  }, []);

  /** Resolve parent uri for a file system entry. */
  const resolveParentUri = useCallback((entry: FileSystemEntry) => {
    const parent = getParentRelativePath(entry.uri);
    return parent;
  }, []);

  /** Resolve the initial folder under the active project root. */
  const resolveInitialActiveUri = useCallback(
    (rootUri?: string | null, activeUri?: string | null) => {
      if (!rootUri) return null;
      if (!activeUri) return "";
      const relative = getRelativePathFromUri(rootUri, activeUri);
      // 中文注释：确保默认目录在项目根目录下，避免打开无效路径。
      return relative;
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    const nextRoot = defaultRootUri ?? null;
    setActiveRootUri(nextRoot);
    setActiveUri(resolveInitialActiveUri(nextRoot, defaultActiveUri ?? null));
  }, [defaultActiveUri, defaultRootUri, open, resolveInitialActiveUri]);

  const handleSelectProject = (uri: string) => {
    setActiveRootUri(uri);
    setActiveUri("");
  };

  const handleNavigate = (uri: string) => {
    setActiveUri(uri);
  };

  /** Confirm the transfer action based on the current mode. */
  const handleConfirmTransfer = async () => {
    if (activeUri === null) return;
    if (mode === "select") {
      if (selectTarget === "file") {
        if (selectedFileRefs.length === 0) return;
        onSelectFileRefs?.(selectedFileRefs);
      } else {
        if (isActiveBoardFolder) {
          toast.error("画布目录不可选");
          return;
        }
        const selectedFolder = selectedEntries.find((entry) => entry.kind === "folder");
        // 中文注释：优先使用选中的文件夹；否则使用当前目录作为目标。
        const targetUri = selectedFolder?.uri ?? activeUri ?? "";
        const parsed = parseScopedProjectPath(targetUri);
        if (parsed) {
          const resolved = formatScopedProjectPath({
            projectId: parsed.projectId,
            relativePath: parsed.relativePath,
            includeAt: true,
          });
          onSelectTarget?.(resolved);
          onOpenChange(false);
          return;
        }
        const relativePath = activeRootUri
          ? getRelativePathFromUri(activeRootUri, targetUri)
          : getRelativePathFromUri("", targetUri);
        const projectId = activeRootUri ? projectIdByRootUri.get(activeRootUri) : undefined;
        if (!projectId) {
          toast.error("请选择一个项目位置");
          return;
        }
        const resolvedTarget = relativePath
          ? formatScopedProjectPath({
              projectId,
              relativePath,
              includeAt: true,
            })
          : `@[${projectId}]/`;
        onSelectTarget?.(resolvedTarget);
      }
      onOpenChange(false);
      return;
    }
    if (transferEntries.length === 0) return;
    try {
      const targetList = await queryClient.fetchQuery(
        trpc.fs.list.queryOptions({
          workspaceId,
          projectId: activeProjectId,
          uri: activeUri,
        })
      );
      const targetNames = new Set(
        (targetList.entries ?? []).map((item) => item.name)
      );
      for (const entry of transferEntries) {
        if (mode === "move" && entry.kind === "folder") {
          // 中文注释：禁止移动到自身或子目录。
          if (isSubPath(entry.uri, activeUri)) {
            toast.error("无法移动到自身目录");
            return;
          }
        }
        if (mode === "move") {
          const parentUri = resolveParentUri(entry);
          // 中文注释：移动到当前目录时跳过，避免无意义的重命名。
          if (parentUri !== null && parentUri === activeUri) continue;
        }
        const targetName = getUniqueName(entry.name, targetNames);
        targetNames.add(targetName);
        const targetUri = buildChildUri(activeUri, targetName);
        if (mode === "move") {
          if (targetUri === entry.uri) continue;
          await renameMutation.mutateAsync({
            workspaceId,
            projectId: activeProjectId,
            from: entry.uri,
            to: targetUri,
          });
        } else {
          await copyMutation.mutateAsync({
            workspaceId,
            projectId: activeProjectId,
            from: entry.uri,
            to: targetUri,
          });
        }
      }
      const invalidateUris = new Set<string>([activeUri]);
      // 中文注释：失效源目录与目标目录，确保列表刷新。
      transferEntries.forEach((entry) => {
        const parentUri = resolveParentUri(entry);
        if (parentUri !== null) invalidateUris.add(parentUri);
      });
      invalidateUris.forEach((uri) => {
        queryClient.invalidateQueries({
          queryKey: trpc.fs.list.queryOptions({
            workspaceId,
            projectId: activeProjectId,
            uri,
          }).queryKey,
        });
      });
      const successLabel =
        mode === "move"
          ? transferEntries.length > 1
            ? "已移动所选项"
            : "已移动"
          : transferEntries.length > 1
            ? "已复制所选项"
            : "已复制";
      toast.success(successLabel);
      onOpenChange(false);
    } catch (error: any) {
      const errorLabel = mode === "move" ? "移动失败" : "复制失败";
      toast.error(error?.message ?? errorLabel);
    }
  };

  /** Build breadcrumb items for the selected directory. */
  const breadcrumbItems = useMemo(() => {
    if (!activeRootUri || activeUri === null) return [];
    const rootRelative = getRelativePathFromUri(activeRootUri, activeRootUri);
    const currentRelative = getRelativePathFromUri(activeRootUri, activeUri);
    const rootParts = rootRelative ? rootRelative.split("/").filter(Boolean) : [];
    const currentParts = currentRelative ? currentRelative.split("/").filter(Boolean) : [];
    // 中文注释：仅展示根目录之后的路径片段，避免重复显示整条绝对路径。
    const relativeParts = currentParts.slice(rootParts.length);
    const decodeLabel = (value: string) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };
    const rootTitle =
      projectOptions.find((item) => item.rootUri === activeRootUri)?.title ??
      decodeLabel(getDisplayPathFromUri(activeRootUri));
    const items: Array<{ label: string; uri: string }> = [
      { label: rootTitle, uri: rootRelative },
    ];
    relativeParts.forEach((part, index) => {
      const nextUri = [...rootParts, ...relativeParts.slice(0, index + 1)].join("/");
      items.push({ label: decodeLabel(part), uri: nextUri });
    });
    return items;
  }, [activeRootUri, activeUri, projectOptions]);

  /** Create a new folder in the target directory. */
  const handleCreateFolder = async () => {
    if (activeUri === null) return;
    try {
      // 以默认名称创建并做唯一性处理，避免覆盖已有目录。
      const existingNames = new Set(gridEntries.map((item) => item.name));
      const targetName = getUniqueName("新建文件夹", existingNames);
      const targetUri = buildChildUri(activeUri, targetName);
      await mkdirMutation.mutateAsync({
        workspaceId,
        projectId: activeProjectId,
        uri: targetUri,
        recursive: true,
      });
      requestRenameByInfo({ uri: targetUri, name: targetName });
      await listQuery.refetch();
      toast.success("已新建文件夹");
    } catch (error: any) {
      toast.error(error?.message ?? "新建失败");
    }
  };

  useEffect(() => {
    // 中文注释：目录切换或对话框重开时重置选择与重命名状态。
    replaceSelection([]);
    handleRenamingCancel();
    setContextTargetUri(null);
  }, [activeUri, handleRenamingCancel, replaceSelection, open]);

  /** Dialog title based on current transfer mode. */
  const dialogTitle =
    mode === "move"
      ? "移动到"
      : mode === "select"
        ? selectTarget === "file"
          ? "选择文件"
          : "选择位置"
        : "复制到";
  /** Confirm button label based on current transfer mode. */
  const confirmLabel =
    mode === "move" ? "确认移动" : mode === "select" ? "确认选择" : "确认复制";
  /** Whether confirm should be disabled for current state. */
  const confirmDisabled =
    activeUri === null ||
    (mode !== "select" && transferEntries.length === 0) ||
    (mode === "select" && selectTarget === "file" && selectedFileRefs.length === 0);
  const isActiveBoardFolder = useMemo(() => {
    if (activeUri === null) return false;
    const parts = activeUri.split("/").filter(Boolean);
    const name = parts[parts.length - 1] ?? "";
    return isBoardFolderName(name);
  }, [activeUri]);
  const effectiveConfirmDisabled =
    confirmDisabled ||
    (mode === "select" && selectTarget === "folder" && isActiveBoardFolder);
  /** Whether to disable preview/context menu interactions. */
  const disableEntryActions = mode === "select";

  const isFolderOnlySelection = mode === "select" && selectTarget === "folder";

  const gridBody = (
    <div className="h-full">
      <FileSystemGrid
        entries={gridEntries}
        isLoading={listQuery.isLoading}
        parentUri={parentUri}
        rootUri={activeRootUri ?? undefined}
        currentUri={activeUri}
        projectId={activeProjectId ?? undefined}
        onNavigate={handleNavigate}
        showEmptyActions={false}
        selectedUris={selectedUris}
        onEntryClick={handleEntryClick}
        onSelectionChange={handleSelectionChange}
        resolveSelectionMode={resolveSelectionMode}
        onGridContextMenuCapture={handleGridContextMenuCapture}
        isEntrySelectable={(entry) =>
          isFolderOnlySelection
            ? entry.kind === "folder" && !isBoardFolderName(entry.name)
            : true
        }
        renamingUri={renamingUri}
        renamingValue={renamingValue}
        onRenamingChange={setRenamingValue}
        onRenamingSubmit={handleRenamingSubmit}
        onRenamingCancel={handleRenamingCancel}
      />
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onOpenChange(false);
          return;
        }
        onOpenChange(true);
      }}
    >
        <DialogContent className="w-[70vw] h-[80vh] max-w-none sm:max-w-none flex flex-col">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 md:grid-cols-[280px_minmax(0,1fr)] flex-1 min-h-0 overflow-hidden">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-3 min-h-0 overflow-y-auto">
            <div className="mb-2 flex h-6 items-center text-xs text-muted-foreground">
              项目
            </div>
            {projectOptions.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无可用项目</div>
            ) : (
              <PageTreePicker
                projects={projectTree}
                activeUri={activeRootUri}
                onSelect={handleSelectProject}
              />
            )}
          </div>
          <div className="min-h-[360px] rounded-2xl border border-border/60 bg-card/60 p-3 min-h-0 flex flex-col">
            <div className="mb-2 flex h-6 items-center justify-between gap-2 text-xs text-muted-foreground">
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbItems.length === 0 ? (
                    <BreadcrumbItem>
                      <BreadcrumbPage>请选择项目</BreadcrumbPage>
                    </BreadcrumbItem>
                  ) : (
                    breadcrumbItems.map((item, index) => {
                      const isLast = index === breadcrumbItems.length - 1;
                      return (
                        <Fragment key={item.uri}>
                          <BreadcrumbItem>
                            {isLast ? (
                              <BreadcrumbPage>{item.label}</BreadcrumbPage>
                            ) : (
                              <BreadcrumbLink asChild className="cursor-pointer">
                                <button type="button" onClick={() => handleNavigate(item.uri)}>
                                  {item.label}
                                </button>
                              </BreadcrumbLink>
                            )}
                          </BreadcrumbItem>
                          {!isLast ? <BreadcrumbSeparator /> : null}
                        </Fragment>
                      );
                    })
                  )}
                </BreadcrumbList>
              </Breadcrumb>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                type="button"
                aria-label="新建文件夹"
                title="新建文件夹"
                onClick={handleCreateFolder}
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {disableEntryActions ? (
                // 逻辑：选择模式下禁用右键菜单与双击预览。
                gridBody
              ) : (
                <ContextMenu onOpenChange={handleContextMenuOpenChange}>
                  <ContextMenuTrigger asChild>{gridBody}</ContextMenuTrigger>
                  <ContextMenuContent className="w-40">
                    {contextEntry && contextEntry.kind === "folder" ? (
                      <ContextMenuItem
                        icon={PencilLine}
                        onSelect={() => requestRename(contextEntry)}
                      >
                        重命名
                      </ContextMenuItem>
                    ) : (
                      <ContextMenuItem icon={Ban} disabled>
                        无可用操作
                      </ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">取消</Button>
          </DialogClose>
          <Button
            type="button"
            onClick={handleConfirmTransfer}
            disabled={effectiveConfirmDisabled}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export default ProjectFileSystemTransferDialog;
