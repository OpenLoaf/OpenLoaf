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

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { trpc, trpcClient } from "@/utils/trpc";
import { useProjects } from "@/hooks/use-projects";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuSkeleton,
  SidebarMenuSub,
} from "@openloaf/ui/sidebar";
import { Button } from "@openloaf/ui/button";
import { Switch } from "@openloaf/ui/switch";
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
import { Input } from "@openloaf/ui/input";
import { Label } from "@openloaf/ui/label";
import { PageTreeMenu } from "./ProjectTree";
import { toast } from "sonner";
import { getDisplayPathFromUri } from "@/components/project/filesystem/utils/file-system-utils";
import { ClipboardCopy, FolderOpen, FolderPlus, RotateCw } from "lucide-react";

/** Project tree loading skeleton. */
const ProjectTreeSkeleton = () => (
  <div className="flex flex-col gap-1 px-1 py-1">
    <SidebarMenuSkeleton
      showIcon
      className="[&_[data-sidebar=menu-skeleton-icon]]:bg-sidebar-accent/80 [&_[data-sidebar=menu-skeleton-text]]:bg-sidebar-accent/80"
    />
    <SidebarMenuSub className="mx-1 px-1">
      <SidebarMenuSkeleton
        showIcon
        className="h-7 [&_[data-sidebar=menu-skeleton-icon]]:bg-sidebar-accent/80 [&_[data-sidebar=menu-skeleton-text]]:bg-sidebar-accent/80"
      />
      <SidebarMenuSkeleton
        showIcon
        className="h-7 [&_[data-sidebar=menu-skeleton-icon]]:bg-sidebar-accent/80 [&_[data-sidebar=menu-skeleton-text]]:bg-sidebar-accent/80"
      />
      <SidebarMenuSkeleton
        showIcon
        className="h-7 [&_[data-sidebar=menu-skeleton-icon]]:bg-sidebar-accent/80 [&_[data-sidebar=menu-skeleton-text]]:bg-sidebar-accent/80"
      />
    </SidebarMenuSub>
    <SidebarMenuSkeleton
      showIcon
      className="[&_[data-sidebar=menu-skeleton-icon]]:bg-sidebar-accent/80 [&_[data-sidebar=menu-skeleton-text]]:bg-sidebar-accent/80"
    />
    <SidebarMenuSkeleton
      showIcon
      className="[&_[data-sidebar=menu-skeleton-icon]]:bg-sidebar-accent/80 [&_[data-sidebar=menu-skeleton-text]]:bg-sidebar-accent/80"
    />
    <SidebarMenuSub className="mx-1 px-1">
      <SidebarMenuSkeleton
        showIcon
        className="h-7 [&_[data-sidebar=menu-skeleton-icon]]:bg-sidebar-accent/80 [&_[data-sidebar=menu-skeleton-text]]:bg-sidebar-accent/80"
      />
      <SidebarMenuSkeleton
        showIcon
        className="h-7 [&_[data-sidebar=menu-skeleton-icon]]:bg-sidebar-accent/80 [&_[data-sidebar=menu-skeleton-text]]:bg-sidebar-accent/80"
      />
      <SidebarMenuSkeleton
        showIcon
        className="h-7 [&_[data-sidebar=menu-skeleton-icon]]:bg-sidebar-accent/80 [&_[data-sidebar=menu-skeleton-text]]:bg-sidebar-accent/80"
      />
    </SidebarMenuSub>
    <SidebarMenuSkeleton
      showIcon
      className="[&_[data-sidebar=menu-skeleton-icon]]:bg-sidebar-accent/80 [&_[data-sidebar=menu-skeleton-text]]:bg-sidebar-accent/80"
    />
  </div>
);

export const SidebarProject = () => {
  // 当前项目列表查询。
  const projectListQuery = useProjects();
  const projects = projectListQuery.data ?? [];
  const createProject = useMutation(trpc.project.create.mutationOptions());
  const { workspace } = useWorkspace();

  // 将状态提升到顶层组件，确保整个页面树只有一个状态管理
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>(
    {}
  );

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [folderName, setFolderName] = useState("");
  const [isFolderNameSynced, setIsFolderNameSynced] = useState(true);
  const [useCustomPath, setUseCustomPath] = useState(false);
  const [customPath, setCustomPath] = useState("");
  const [importPath, setImportPath] = useState("");
  const [enableVersionControl, setEnableVersionControl] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isImportBusy, setIsImportBusy] = useState(false);
  /** Tracks manual refresh loading state. */
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  /** Whether the import path is detected as a git project (null = not checked yet). */
  const [importPathIsGit, setImportPathIsGit] = useState<boolean | null>(null);
  const checkPathTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Debounced check whether the import path is a git project. */
  const checkImportPathGit = useCallback(
    (dirPath: string) => {
      if (checkPathTimerRef.current) clearTimeout(checkPathTimerRef.current);
      const trimmed = dirPath.trim();
      if (!trimmed) {
        setImportPathIsGit(null);
        return;
      }
      checkPathTimerRef.current = setTimeout(async () => {
        try {
          const result = await trpcClient.project.checkPath.query({ dirPath: trimmed });
          setImportPathIsGit(result.isGitProject);
          if (result.isGitProject) {
            setEnableVersionControl(true);
          }
        } catch {
          setImportPathIsGit(null);
        }
      }, 400);
    },
    [],
  );

  // 清理 timer
  useEffect(() => {
    return () => {
      if (checkPathTimerRef.current) clearTimeout(checkPathTimerRef.current);
    };
  }, []);

  /** Create a new project and refresh list. */
  const handleCreateProject = async () => {
    const title = createTitle.trim();
    const folderNameValue = folderName.trim();
    try {
      setIsBusy(true);
      await createProject.mutateAsync({
        title: title || undefined,
        folderName: folderNameValue || undefined,
        rootUri: useCustomPath ? customPath.trim() || undefined : undefined,
        enableVersionControl,
      });
      toast.success("项目已创建");
      setCreateTitle("");
      setFolderName("");
      setIsFolderNameSynced(true);
      setUseCustomPath(false);
      setCustomPath("");
      setEnableVersionControl(true);
      setIsCreateOpen(false);
      // 中文注释：创建后刷新项目列表，确保新项目立即出现。
      await projectListQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "创建失败");
    } finally {
      setIsBusy(false);
    }
  };

  /** Refresh project list. */
  const handleRefreshProjects = async () => {
    try {
      // 中文注释：手动刷新时强制显示骨架屏，避免旧数据闪烁。
      setIsManualRefresh(true);
      await projectListQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "刷新失败");
    } finally {
      setIsManualRefresh(false);
    }
  };

  /** Copy text to clipboard with fallback. */
  const copyTextToClipboard = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      // 中文注释：剪贴板 API 失败时使用降级复制。
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

  /** Copy workspace path to clipboard. */
  const handleCopyWorkspacePath = async () => {
    const rootUri = workspace?.rootUri;
    if (!rootUri) {
      toast.error("未找到工作空间路径");
      return;
    }
    const displayPath = getDisplayPathFromUri(rootUri);
    await copyTextToClipboard(displayPath, "已复制路径");
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

  /** Import an existing folder as a project into workspace. */
  const handleImportProject = async () => {
    const path = importPath.trim();
    if (!path) {
      toast.error("请选择文件夹");
      return;
    }
    try {
      setIsImportBusy(true);
      // Git 项目无需再初始化版本控制；非 Git 项目按用户选择决定。
      const shouldEnableVc = importPathIsGit === true ? true : enableVersionControl;
      await createProject.mutateAsync({
        rootUri: path,
        enableVersionControl: shouldEnableVc,
      });
      toast.success("已添加到工作空间");
      setIsImportOpen(false);
      setImportPath("");
      setEnableVersionControl(true);
      setImportPathIsGit(null);
      await projectListQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "添加失败");
    } finally {
      setIsImportBusy(false);
    }
  };

  return (
    <>
      {/* Nav Main */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex h-full flex-col">
              <SidebarGroup className="group pt-0">
                  <SidebarGroupLabel>
                    <span className="text-muted-foreground">项目文件夹</span>
                  </SidebarGroupLabel>
                  <SidebarMenu>
                    {projectListQuery.isLoading || isManualRefresh ? (
                      <ProjectTreeSkeleton />
                    ) : (
                      <PageTreeMenu
                        projects={projects}
                        expandedNodes={expandedNodes}
                        setExpandedNodes={setExpandedNodes}
                        onCreateProject={() => setIsCreateOpen(true)}
                        onImportProject={() => setIsImportOpen(true)}
                      />
                    )}
                  </SidebarMenu>
              </SidebarGroup>
            <div className="flex-1" />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem icon={RotateCw} onClick={() => void handleRefreshProjects()}>
            刷新
          </ContextMenuItem>
          <ContextMenuItem
            icon={ClipboardCopy}
            onClick={() => void handleCopyWorkspacePath()}
          >
            复制工作空间路径
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem icon={FolderPlus} onClick={() => setIsCreateOpen(true)}>
            新建项目
          </ContextMenuItem>
          <ContextMenuItem icon={FolderOpen} onClick={() => setIsImportOpen(true)}>
            添加已有文件夹
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsCreateOpen(true);
            setEnableVersionControl(true);
            return;
          }
          setIsCreateOpen(false);
          setCreateTitle("");
          setFolderName("");
          setIsFolderNameSynced(true);
          setUseCustomPath(false);
          setCustomPath("");
          setEnableVersionControl(true);
        }}
      >
        <DialogContent className="max-w-[480px] rounded-2xl border border-border/60 bg-background p-0 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle className="text-[16px] font-semibold">新建项目</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              创建新的项目文件夹并加入工作空间。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col divide-y divide-border/40 px-6">
            <div className="flex items-center gap-3 py-2.5">
              <Label htmlFor="project-title" className="shrink-0 text-sm font-medium text-foreground">
                显示名称
              </Label>
              <Input
                id="project-title"
                value={createTitle}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setCreateTitle(nextValue);
                  if (isFolderNameSynced) {
                    setFolderName(nextValue);
                  }
                }}
                className="ml-auto h-8 w-full max-w-[280px] border-0 bg-transparent text-right text-sm text-foreground shadow-none focus-visible:ring-0"
                autoFocus
                placeholder="我的项目"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleCreateProject();
                  }
                }}
              />
            </div>
            <div className="flex items-center gap-3 py-2.5">
              <Label htmlFor="project-folder-name" className="shrink-0 text-sm font-medium text-foreground">
                文件夹名称
              </Label>
              <Input
                id="project-folder-name"
                value={folderName}
                onChange={(event) => {
                  setFolderName(event.target.value);
                  setIsFolderNameSynced(false);
                }}
                className="ml-auto h-8 w-full max-w-[280px] border-0 bg-transparent text-right text-sm text-foreground shadow-none focus-visible:ring-0"
                placeholder="默认与显示名称一致"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleCreateProject();
                  }
                }}
              />
            </div>
            <div className="flex items-center gap-3 py-2.5">
              <Label htmlFor="project-custom-path" className="shrink-0 text-sm font-medium text-foreground">
                自定义路径
              </Label>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  指定项目目录
                </span>
                <Switch
                  checked={useCustomPath}
                  onCheckedChange={(checked) => setUseCustomPath(Boolean(checked))}
                />
              </div>
            </div>
            {useCustomPath ? (
              <div className="flex items-center gap-3 py-2.5">
                <Label htmlFor="project-custom-path-input" className="shrink-0 text-sm font-medium text-foreground">
                  路径
                </Label>
                <div className="ml-auto flex items-center gap-2">
                  <Input
                    id="project-custom-path-input"
                    value={customPath}
                    onChange={(event) => setCustomPath(event.target.value)}
                    className="h-8 max-w-[220px] rounded-full border border-border/70 bg-muted/40 px-3 text-xs text-foreground shadow-none focus-visible:ring-0"
                    placeholder="/path/to/project"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={async () => {
                      const next = await pickDirectory(customPath);
                      if (!next) return;
                      setCustomPath(next);
                    }}
                  >
                    选择
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="flex items-center gap-3 py-2.5">
              <Label htmlFor="project-version-control" className="shrink-0 text-sm font-medium text-foreground">
                版本控制
              </Label>
              <div className="ml-auto">
                <Switch
                  id="project-version-control"
                  checked={enableVersionControl}
                  onCheckedChange={(checked) =>
                    setEnableVersionControl(Boolean(checked))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-border/30 px-6 py-4 gap-2">
            <DialogClose asChild>
              <Button
                variant="outline"
                type="button"
                className="h-9 rounded-full px-5 text-[13px] text-[var(--btn-neutral-fg,#5f6368)] hover:bg-[var(--btn-neutral-bg-hover,#e8eaed)] dark:text-slate-300 dark:hover:bg-slate-700"
              >
                取消
              </Button>
            </DialogClose>
            <Button
              onClick={handleCreateProject}
              disabled={isBusy}
              className="h-9 rounded-full px-5 text-[13px] bg-[var(--btn-primary-bg,#0b57d0)] text-[var(--btn-primary-fg,#ffffff)] shadow-none hover:bg-[var(--btn-primary-bg-hover,#0a4cbc)] dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              {isBusy ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isImportOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsImportOpen(true);
            setEnableVersionControl(true);
            setImportPath("");
            setImportPathIsGit(null);
            return;
          }
          setIsImportOpen(false);
          setImportPath("");
          setEnableVersionControl(true);
          setImportPathIsGit(null);
        }}
      >
        <DialogContent className="max-w-[480px] rounded-2xl border border-border/60 bg-background p-0 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle className="text-[16px] font-semibold">添加已有文件夹</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              选择电脑上的文件夹，作为项目加入工作空间。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col divide-y divide-border/40 px-6">
            <div className="flex items-center gap-3 py-2.5">
              <Label htmlFor="project-import-path" className="shrink-0 text-sm font-medium text-foreground">
                文件夹路径
              </Label>
              <div className="ml-auto flex items-center gap-2">
                <Input
                  id="project-import-path"
                  value={importPath}
                  onChange={(event) => {
                    const next = event.target.value;
                    setImportPath(next);
                    checkImportPathGit(next);
                  }}
                  className="h-8 max-w-[220px] rounded-full border border-border/70 bg-muted/40 px-3 text-xs text-foreground shadow-none focus-visible:ring-0"
                  placeholder="选择文件夹"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={async () => {
                    const next = await pickDirectory(importPath);
                    if (!next) return;
                    setImportPath(next);
                    checkImportPathGit(next);
                  }}
                >
                  选择
                </Button>
              </div>
            </div>
            {importPathIsGit === false && (
              <div className="flex items-center gap-3 py-2.5">
                <Label htmlFor="project-import-version-control" className="shrink-0 text-sm font-medium text-foreground">
                  启用版本控制
                </Label>
                <div className="ml-auto">
                  <Switch
                    id="project-import-version-control"
                    checked={enableVersionControl}
                    onCheckedChange={(checked) =>
                      setEnableVersionControl(Boolean(checked))
                    }
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-border/30 px-6 py-4 gap-2">
            <DialogClose asChild>
              <Button
                variant="outline"
                type="button"
                className="h-9 rounded-full px-5 text-[13px] text-[var(--btn-neutral-fg,#5f6368)] hover:bg-[var(--btn-neutral-bg-hover,#e8eaed)] dark:text-slate-300 dark:hover:bg-slate-700"
              >
                取消
              </Button>
            </DialogClose>
            <Button
              onClick={handleImportProject}
              disabled={isImportBusy}
              className="h-9 rounded-full px-5 text-[13px] bg-[var(--btn-primary-bg,#0b57d0)] text-[var(--btn-primary-fg,#ffffff)] shadow-none hover:bg-[var(--btn-primary-bg-hover,#0a4cbc)] dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              {isImportBusy ? "添加中..." : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
};
