/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { getProjectsQueryKey } from "@/hooks/use-projects";
import { cleanupProjectCache } from "@/lib/project-cache-cleanup";
import {
  ensureBoardFolderName,
  getBoardDisplayName,
  getDisplayFileName,
  isBoardFolderName,
} from "@/lib/file-name";
import {
  getDisplayPathFromUri,
  resolveFileUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";
import { trpc as trpcContext } from "@/utils/trpc";
import type { UseMutationResult } from "@tanstack/react-query";
import type { FileNode, RenameTarget, ChildProjectTarget, ImportChildTarget } from "./projectTreeTypes";
import { buildNextUri, getParentUri } from "./projectTreeTypes";

export interface UseProjectTreeActionsParams {
  renameProject: UseMutationResult<any, any, any, any>;
  createProject: UseMutationResult<any, any, any, any>;
  removeProject: UseMutationResult<any, any, any, any>;
  destroyProject: UseMutationResult<any, any, any, any>;
  toggleFavorite: UseMutationResult<any, any, any, any>;
  renameFile: UseMutationResult<any, any, any, any>;
  deleteFile: UseMutationResult<any, any, any, any>;
  projectRootById: Map<string, string>;
}

export function useProjectTreeActions({
  renameProject,
  createProject,
  removeProject,
  destroyProject,
  toggleFavorite,
  renameFile,
  deleteFile,
  projectRootById,
}: UseProjectTreeActionsParams) {
  const trpc = trpcContext;
  const { t } = useTranslation(["nav", "common"]);
  const setViewTitle = useAppView((s) => s.setTitle);
  const queryClient = useQueryClient();

  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null);
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

  /** Check whether the error indicates a missing project. */
  const isProjectMissingError = (err: unknown) => {
    const message =
      typeof err === "object" && err && "message" in err
        ? String((err as { message?: string }).message ?? "")
        : "";
    return /project not found/i.test(message);
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
      throw err;
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
      cleanupProjectCache(removeTarget.projectId);
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
      throw err;
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
      cleanupProjectCache(removeTarget.projectId);
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
      throw err;
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

  const isPermanentRemoveConfirmed =
    isPermanentRemoveChecked && permanentRemoveText.trim() === "delete";
  const removeAction = isPermanentRemoveChecked
    ? handleDestroyProject
    : handleRemoveProject;
  const removeButtonText = isPermanentRemoveChecked ? t("nav:projectTree.permanentDelete") : t("nav:projectTree.remove");
  const isRemoveActionDisabled =
    isRemoveBusy || (isPermanentRemoveChecked && !isPermanentRemoveConfirmed);

  return {
    // Rename
    renameTarget,
    setRenameTarget,
    handleRename,
    openRenameDialog,
    // Delete
    deleteTarget,
    setDeleteTarget,
    handleDelete,
    openDeleteDialog,
    // Busy
    isBusy,
    // Remove
    removeTarget,
    setRemoveTarget,
    openRemoveDialog,
    isPermanentRemoveChecked,
    setIsPermanentRemoveChecked,
    permanentRemoveText,
    setPermanentRemoveText,
    isRemoveBusy,
    removeAction,
    removeButtonText,
    isRemoveActionDisabled,
    resetRemoveDialogState,
    // Favorite
    handleToggleFavorite,
    // Child project
    createChildTarget,
    setCreateChildTarget,
    isChildBusy,
    handleCreateChildProject,
    openCreateChildDialog,
    // Import child
    importChildTarget,
    setImportChildTarget,
    isImportChildBusy,
    handleImportChildProject,
    openImportChildDialog,
    // Utility
    handleOpenInFileManager,
    handleCopyProjectPath,
    pickDirectory,
  };
}
