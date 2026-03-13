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

import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { trpc, trpcClient } from "@/utils/trpc";
import { useProjects } from "@/hooks/use-projects";
import { useProjectStorageRootUri } from "@/hooks/use-project-storage-root-uri";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuSkeleton,
  SidebarMenuSub,
} from "@openloaf/ui/sidebar";
import { Button } from "@openloaf/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { Input } from "@openloaf/ui/input";
import { Label } from "@openloaf/ui/label";
import { PageTreeMenu } from "./ProjectTree";
import { toast } from "sonner";
import { getDisplayPathFromUri } from "@/components/project/filesystem/utils/file-system-utils";
import { CheckCircle2, ClipboardCopy, FolderOpen, FolderPlus, GitBranch, Plus, RotateCw, Square } from "lucide-react";

/** Project tree loading skeleton. */
const ProjectTreeSkeleton = () => (
  <div className="flex flex-col gap-1 px-1 py-1">
    <SidebarMenuSkeleton
      showIcon
      className="[&_[data-sidebar=menu-skeleton-icon]]:bg-muted-foreground/15 [&_[data-sidebar=menu-skeleton-text]]:bg-muted-foreground/15"
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
      className="[&_[data-sidebar=menu-skeleton-icon]]:bg-muted-foreground/15 [&_[data-sidebar=menu-skeleton-text]]:bg-muted-foreground/15"
    />
    <SidebarMenuSkeleton
      showIcon
      className="[&_[data-sidebar=menu-skeleton-icon]]:bg-muted-foreground/15 [&_[data-sidebar=menu-skeleton-text]]:bg-muted-foreground/15"
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
      className="[&_[data-sidebar=menu-skeleton-icon]]:bg-muted-foreground/15 [&_[data-sidebar=menu-skeleton-text]]:bg-muted-foreground/15"
    />
  </div>
);

export const SidebarProject = () => {
  const { t } = useTranslation('nav');
  const { t: tCommon } = useTranslation('common');
  // 当前项目列表查询。
  const projectListQuery = useProjects();
  const projects = projectListQuery.data ?? [];
  const createProject = useMutation(trpc.project.create.mutationOptions());
  const projectStorageRootUri = useProjectStorageRootUri();

  // 将状态提升到顶层组件，确保整个页面树只有一个状态管理
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>(
    {}
  );

  /** Unified "add project" dialog state. */
  const [isAddOpen, setIsAddOpen] = useState(false);
  /** "create" = new empty project, "git" = clone from git, null = mode selection screen. */
  const [addMode, setAddMode] = useState<"create" | "git" | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [gitUrl, setGitUrl] = useState("");
  const [gitTargetDir, setGitTargetDir] = useState("");
  const [gitProgress, setGitProgress] = useState<string[]>([]);
  const [gitDone, setGitDone] = useState(false);
  const gitSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  /** Tracks manual refresh loading state. */
  const [isManualRefresh, setIsManualRefresh] = useState(false);

  /** Open the add-project dialog with a clean state. */
  const openAddDialog = useCallback(() => {
    setAddMode(null);
    setCreateTitle("");
    setGitUrl("");
    setGitTargetDir("");
    setGitProgress([]);
    setGitDone(false);
    setIsAddOpen(true);
  }, []);

  /** Submit handler for creating a new empty project. */
  const handleAddProject = async () => {
    try {
      setIsBusy(true);
      const title = createTitle.trim();
      if (!title) {
        toast.error(t('sidebar.projectNamePlaceholder') || "请输入项目名称");
        return;
      }
      const res = await createProject.mutateAsync({
        title,
        enableVersionControl: true,
      });
      toast.success(t('sidebar.projectCreated'));
      setIsAddOpen(false);
      await projectListQuery.refetch();
      // Fire-and-forget: infer project type via auxiliary model.
      if (res.project?.projectId) {
        trpcClient.settings.inferProjectType
          .mutate({ projectId: res.project.projectId })
          .then(() => projectListQuery.refetch())
          .catch(() => {});
      }
    } catch (err: any) {
      toast.error(err?.message ?? tCommon('operationFailed'));
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
      toast.error(err?.message ?? t('sidebar.refresh') + "失败");
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

  /** Copy project-space root path to clipboard. */
  const handleCopyProjectSpacePath = async () => {
    const rootUri = projectStorageRootUri;
    if (!rootUri) {
      toast.error(t('sidebar.projectSpacePathNotFound'));
      return;
    }
    const displayPath = getDisplayPathFromUri(rootUri);
    await copyTextToClipboard(displayPath, t('sidebar.pathCopied'));
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

  /** Start git clone via SSE subscription. */
  const handleCloneFromGit = () => {
    const url = gitUrl.trim();
    if (!url) {
      toast.error(t('sidebar.gitRepositoryAddress'));
      return;
    }
    setIsBusy(true);
    setGitProgress([]);
    setGitDone(false);
    const sub = trpcClient.project.cloneFromGit.subscribe(
      { url, targetDir: gitTargetDir || undefined },
      {
        onData(data: any) {
          if (data.type === "progress") {
            setGitProgress((prev) => [...prev, data.message]);
          }
          if (data.type === "done") {
            setGitDone(true);
            setIsBusy(false);
            gitSubRef.current = null;
            projectListQuery.refetch();
            // Fire-and-forget: infer project type via auxiliary model.
            if (data.projectId) {
              trpcClient.settings.inferProjectType
                .mutate({ projectId: data.projectId })
                .then(() => projectListQuery.refetch())
                .catch(() => {});
            }
          }
          if (data.type === "error") {
            toast.error(data.message);
            setIsBusy(false);
            gitSubRef.current = null;
          }
        },
        onError(err: any) {
          toast.error(err?.message ?? t('sidebar.cloneError'));
          setIsBusy(false);
          gitSubRef.current = null;
        },
      },
    );
    gitSubRef.current = sub;
  };

  /** Abort a running git clone. */
  const handleAbortClone = () => {
    gitSubRef.current?.unsubscribe();
    gitSubRef.current = null;
    setIsBusy(false);
    toast(t('sidebar.cloneAborted'));
  };

  /** Whether the submit button should be disabled. */
  const isSubmitDisabled = isBusy || !addMode || (addMode === "create" && !createTitle.trim());

  return (
    <>
      {/* Nav Main */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex h-full flex-col">
              <div className="shrink-0 mt-2 border-t border-sidebar-border px-3 pt-2 pb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{t('projectsSection')}</span>
                <button
                  type="button"
                  className="flex items-center gap-0.5 rounded px-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-accent/30 transition-colors"
                  onClick={() => openAddDialog()}
                  title={t('sidebar.addProject')}
                >
                  <Plus className="h-3 w-3" />
                  <span>{t('sidebar.addNew')}</span>
                </button>
              </div>
              <SidebarGroup className="group pt-0 flex flex-col flex-1 min-h-0">
                      <div className="flex-1 overflow-y-auto min-h-0">
                    <SidebarMenu>
                      {projectListQuery.isLoading || isManualRefresh ? (
                        <ProjectTreeSkeleton />
                      ) : (
                        <PageTreeMenu
                          projects={projects}
                          expandedNodes={expandedNodes}
                          setExpandedNodes={setExpandedNodes}
                          onCreateProject={() => openAddDialog()}
                          onImportProject={() => openAddDialog()}
                        />
                      )}
                    </SidebarMenu>
                  </div>
              </SidebarGroup>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem icon={RotateCw} onClick={() => void handleRefreshProjects()}>
            {t('sidebar.refresh')}
          </ContextMenuItem>
          <ContextMenuItem
            icon={ClipboardCopy}
            onClick={() => void handleCopyProjectSpacePath()}
          >
            {t('sidebar.copyProjectSpacePath')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem icon={FolderPlus} onClick={() => openAddDialog()}>
            {t('sidebar.addProject')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog
        open={isAddOpen}
        onOpenChange={(open) => {
          if (open) { openAddDialog(); } else if (!isBusy) { setIsAddOpen(false); }
        }}
      >
        <DialogContent
          className="max-w-[420px] rounded-2xl border border-border/60 bg-background p-0 shadow-ol-float"
          onInteractOutside={(e) => { if (isBusy) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (isBusy) e.preventDefault(); }}
        >
          <DialogHeader className="px-6 pt-5 pb-0">
            <DialogTitle className="text-[16px] font-semibold">{t('sidebar.addDialog')}</DialogTitle>
          </DialogHeader>

          {/* 模式选择 */}
          {!addMode && (
            <div className="flex flex-col gap-2.5 px-6 pt-3 pb-7">
              <button
                type="button"
                className="group flex w-full items-center gap-3.5 rounded-xl border border-ol-blue/20 bg-ol-blue-bg px-4 py-3.5 text-left transition-colors duration-150 hover:border-ol-blue/30 hover:bg-ol-blue-bg-hover"
                onClick={() => setAddMode("create")}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ol-blue-bg text-ol-blue">
                  <FolderPlus className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{t('sidebar.newEmptyProject')}</div>
                  <div className="text-xs text-muted-foreground">{t('sidebar.newEmptyProjectDescription')}</div>
                </div>
              </button>
              <button
                type="button"
                className="group flex w-full items-center gap-3.5 rounded-xl border border-ol-green/20 bg-ol-green-bg px-4 py-3.5 text-left transition-colors duration-150 hover:border-ol-green/30 hover:bg-ol-green-bg-hover"
                onClick={async () => {
                  const dir = await pickDirectory();
                  if (!dir) return;
                  // 选完文件夹后直接添加，无需确认步骤
                  try {
                    setIsBusy(true);
                    const result = await trpcClient.project.checkPath.query({ dirPath: dir });
                    const shouldEnableVc = result.isGitProject ? true : true;
                    const autoIcon = (result.isCodeProject && !result.hasIcon) ? "💻" : undefined;
                    const res = await createProject.mutateAsync({
                      rootUri: dir,
                      enableVersionControl: shouldEnableVc,
                      icon: autoIcon,
                    });
                    toast.success(t('sidebar.addToProjectSpace'));
                    setIsAddOpen(false);
                    await projectListQuery.refetch();
                    // Fire-and-forget: infer project type via auxiliary model.
                    if (res.project?.projectId) {
                      trpcClient.settings.inferProjectType
                        .mutate({ projectId: res.project.projectId })
                        .then(() => projectListQuery.refetch())
                        .catch(() => {});
                    }
                  } catch (err: any) {
                    toast.error(err?.message ?? t('sidebar.addError'));
                  } finally {
                    setIsBusy(false);
                  }
                }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ol-green-bg text-ol-green">
                  <FolderOpen className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{t('sidebar.selectExistingFolder')}</div>
                  <div className="text-xs text-muted-foreground">{t('sidebar.selectExistingFolderDescription')}</div>
                </div>
              </button>
              <button
                type="button"
                className="group flex w-full items-center gap-3.5 rounded-xl border border-ol-purple/20 bg-ol-purple-bg px-4 py-3.5 text-left transition-colors duration-150 hover:border-ol-purple/30 hover:bg-ol-purple-bg-hover"
                onClick={() => setAddMode("git")}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ol-purple-bg text-ol-purple">
                  <GitBranch className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{t('sidebar.cloneFromGit')}</div>
                  <div className="text-xs text-muted-foreground">{t('sidebar.cloneFromGitDescription')}</div>
                </div>
              </button>
            </div>
          )}

          {/* 新建空项目表单 */}
          {addMode === "create" && (
            <div className="flex flex-col gap-3 px-6 pt-3 pb-3">
              <div>
                <Label htmlFor="add-project-title" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t('sidebar.projectName')}
                </Label>
                <Input
                  id="add-project-title"
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  className="h-9 rounded-lg"
                  autoFocus
                  placeholder={t('sidebar.projectNamePlaceholder')}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !isSubmitDisabled) {
                      handleAddProject();
                    }
                  }}
                />
              </div>
            </div>
          )}


          {/* Git 克隆表单 */}
          {addMode === "git" && (
            <div className="flex flex-col gap-3 px-6 pt-3 pb-3">
              {!isBusy && !gitDone && (
                <>
                  <div>
                    <Label htmlFor="git-url" className="mb-1.5 block text-sm font-medium text-foreground">
                      {t('sidebar.repositoryAddress')}
                    </Label>
                    <Input
                      id="git-url"
                      value={gitUrl}
                      onChange={(e) => setGitUrl(e.target.value)}
                      className="h-9 rounded-lg font-mono text-xs"
                      autoFocus
                      placeholder="https://github.com/user/repo.git"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && gitUrl.trim()) handleCloneFromGit();
                      }}
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-sm font-medium text-foreground">
                      {t('sidebar.targetDirectory')}
                    </Label>
                    <button
                      type="button"
                      className="flex h-9 w-full items-center rounded-lg border border-input bg-background px-3 text-xs text-muted-foreground hover:bg-accent/50 transition-colors"
                      onClick={async () => {
                        const dir = await pickDirectory(gitTargetDir || undefined);
                        if (dir) setGitTargetDir(dir);
                      }}
                    >
                      {gitTargetDir || t('sidebar.projectSpaceRootDefault')}
                    </button>
                  </div>
                </>
              )}
              {(isBusy || gitDone) && (
                <div className="flex flex-col gap-2">
                  {gitDone && (
                    <div className="flex items-center gap-2 text-sm text-ol-green">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{t('sidebar.cloneComplete')}</span>
                    </div>
                  )}
                  <div className="max-h-[160px] overflow-y-auto rounded-lg border border-border/40 bg-muted/30 p-2.5">
                    <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {gitProgress.slice(-12).join("\n") || t('sidebar.connecting')}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer: 只在新建项目表单时显示 */}
          {addMode === "create" && (
            <DialogFooter className="border-t border-border/30 px-6 pt-3 pb-5 gap-2">
              <Button
                variant="outline"
                type="button"
                className="h-9 rounded-full px-5 text-[13px] text-ol-text-auxiliary hover:bg-ol-surface-muted"
                onClick={() => { setAddMode(null); setCreateTitle(""); }}
              >
                {t('sidebar.back')}
              </Button>
              <Button
                onClick={handleAddProject}
                disabled={isSubmitDisabled}
                className="h-9 rounded-full px-5 text-[13px] bg-ol-blue text-white shadow-none hover:opacity-90"
              >
                {isBusy ? t('sidebar.creating') : t('sidebar.create')}
              </Button>
            </DialogFooter>
          )}

          {/* Footer: Git 克隆模式 */}
          {addMode === "git" && (
            <DialogFooter className="border-t border-border/30 px-6 pt-3 pb-5 gap-2">
              {!gitDone ? (
                <>
                  {isBusy ? (
                    <Button
                      variant="outline"
                      type="button"
                      className="h-9 rounded-full px-5 text-[13px] text-ol-red border-ol-red/20 hover:bg-ol-red-bg"
                      onClick={handleAbortClone}
                    >
                      <Square className="mr-1.5 h-3.5 w-3.5" />
                      {t('sidebar.abort')}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      type="button"
                      className="h-9 rounded-full px-5 text-[13px] text-ol-text-auxiliary hover:bg-ol-surface-muted"
                      onClick={() => { setAddMode(null); }}
                    >
                      {t('sidebar.back')}
                    </Button>
                  )}
                  <Button
                    onClick={handleCloneFromGit}
                    disabled={isBusy || !gitUrl.trim()}
                    className="h-9 rounded-full px-5 text-[13px] bg-ol-purple text-white shadow-none hover:opacity-90"
                  >
                    {isBusy ? t('sidebar.cloning') : t('sidebar.startClone')}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setIsAddOpen(false)}
                  className="h-9 rounded-full px-5 text-[13px] bg-ol-green text-white shadow-none hover:opacity-90"
                >
                  {t('sidebar.done')}
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

    </>
  );
};
