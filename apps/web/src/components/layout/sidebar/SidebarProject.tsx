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
import { CheckCircle2, ClipboardCopy, FolderOpen, FolderPlus, GitBranch, RotateCw, Square } from "lucide-react";

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
        toast.error("请输入项目名称");
        return;
      }
      await createProject.mutateAsync({
        title,
        enableVersionControl: true,
      });
      toast.success("项目已创建");
      setIsAddOpen(false);
      await projectListQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "操作失败");
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

  /** Start git clone via SSE subscription. */
  const handleCloneFromGit = () => {
    const url = gitUrl.trim();
    if (!url) {
      toast.error("请输入 Git 仓库地址");
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
          }
          if (data.type === "error") {
            toast.error(data.message);
            setIsBusy(false);
            gitSubRef.current = null;
          }
        },
        onError(err: any) {
          toast.error(err?.message ?? "克隆失败");
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
    toast("克隆已终止");
  };

  /** Whether the submit button should be disabled. */
  const isSubmitDisabled = isBusy || !addMode || (addMode === "create" && !createTitle.trim());

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
                        onCreateProject={() => openAddDialog()}
                        onImportProject={() => openAddDialog()}
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
          <ContextMenuItem icon={FolderPlus} onClick={() => openAddDialog()}>
            添加项目
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
          className="max-w-[420px] rounded-2xl border border-border/60 bg-background p-0 shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
          onInteractOutside={(e) => { if (isBusy) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (isBusy) e.preventDefault(); }}
        >
          <DialogHeader className="px-6 pt-5 pb-0">
            <DialogTitle className="text-[16px] font-semibold">添加项目</DialogTitle>
          </DialogHeader>

          {/* 模式选择 */}
          {!addMode && (
            <div className="flex flex-col gap-2.5 px-6 pt-3 pb-7">
              <button
                type="button"
                className="group flex w-full items-center gap-3.5 rounded-xl border border-sky-200/60 bg-sky-50/50 px-4 py-3.5 text-left transition-colors duration-150 hover:border-sky-300 hover:bg-sky-50 dark:border-sky-800/40 dark:bg-sky-950/30 dark:hover:border-sky-700 dark:hover:bg-sky-950/50"
                onClick={() => setAddMode("create")}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/50 dark:text-sky-400">
                  <FolderPlus className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">新建空项目</div>
                  <div className="text-xs text-muted-foreground">在工作空间中创建一个新文件夹</div>
                </div>
              </button>
              <button
                type="button"
                className="group flex w-full items-center gap-3.5 rounded-xl border border-emerald-200/60 bg-emerald-50/50 px-4 py-3.5 text-left transition-colors duration-150 hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/50"
                onClick={async () => {
                  const dir = await pickDirectory();
                  if (!dir) return;
                  // 选完文件夹后直接添加，无需确认步骤
                  try {
                    setIsBusy(true);
                    const result = await trpcClient.project.checkPath.query({ dirPath: dir });
                    const shouldEnableVc = result.isGitProject ? true : true;
                    const autoIcon = (result.isCodeProject && !result.hasIcon) ? "💻" : undefined;
                    await createProject.mutateAsync({
                      rootUri: dir,
                      enableVersionControl: shouldEnableVc,
                      icon: autoIcon,
                    });
                    toast.success("已添加到工作空间");
                    setIsAddOpen(false);
                    await projectListQuery.refetch();
                  } catch (err: any) {
                    toast.error(err?.message ?? "添加失败");
                  } finally {
                    setIsBusy(false);
                  }
                }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
                  <FolderOpen className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">选择已有文件夹</div>
                  <div className="text-xs text-muted-foreground">将电脑上的文件夹作为项目管理</div>
                </div>
              </button>
              <button
                type="button"
                className="group flex w-full items-center gap-3.5 rounded-xl border border-violet-200/60 bg-violet-50/50 px-4 py-3.5 text-left transition-colors duration-150 hover:border-violet-300 hover:bg-violet-50 dark:border-violet-800/40 dark:bg-violet-950/30 dark:hover:border-violet-700 dark:hover:bg-violet-950/50"
                onClick={() => setAddMode("git")}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-400">
                  <GitBranch className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">从 Git 克隆</div>
                  <div className="text-xs text-muted-foreground">粘贴仓库地址，自动克隆到本地</div>
                </div>
              </button>
            </div>
          )}

          {/* 新建空项目表单 */}
          {addMode === "create" && (
            <div className="flex flex-col gap-3 px-6 pt-3 pb-3">
              <div>
                <Label htmlFor="add-project-title" className="mb-1.5 block text-sm font-medium text-foreground">
                  项目名称
                </Label>
                <Input
                  id="add-project-title"
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  className="h-9 rounded-lg"
                  autoFocus
                  placeholder="我的项目"
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
                      仓库地址
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
                      目标目录
                    </Label>
                    <button
                      type="button"
                      className="flex h-9 w-full items-center rounded-lg border border-input bg-background px-3 text-xs text-muted-foreground hover:bg-accent/50 transition-colors"
                      onClick={async () => {
                        const dir = await pickDirectory(gitTargetDir || undefined);
                        if (dir) setGitTargetDir(dir);
                      }}
                    >
                      {gitTargetDir || "工作空间根目录（默认）"}
                    </button>
                  </div>
                </>
              )}
              {(isBusy || gitDone) && (
                <div className="flex flex-col gap-2">
                  {gitDone && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>克隆完成</span>
                    </div>
                  )}
                  <div className="max-h-[160px] overflow-y-auto rounded-lg border border-border/40 bg-muted/30 p-2.5">
                    <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {gitProgress.slice(-12).join("\n") || "正在连接..."}
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
                className="h-9 rounded-full px-5 text-[13px] text-[var(--btn-neutral-fg,#5f6368)] hover:bg-[var(--btn-neutral-bg-hover,#e8eaed)] dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={() => { setAddMode(null); setCreateTitle(""); }}
              >
                返回
              </Button>
              <Button
                onClick={handleAddProject}
                disabled={isSubmitDisabled}
                className="h-9 rounded-full px-5 text-[13px] bg-[var(--btn-primary-bg,#0b57d0)] text-[var(--btn-primary-fg,#ffffff)] shadow-none hover:bg-[var(--btn-primary-bg-hover,#0a4cbc)] dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                {isBusy ? "创建中..." : "创建"}
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
                      className="h-9 rounded-full px-5 text-[13px] text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950/40"
                      onClick={handleAbortClone}
                    >
                      <Square className="mr-1.5 h-3.5 w-3.5" />
                      终止
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      type="button"
                      className="h-9 rounded-full px-5 text-[13px] text-[var(--btn-neutral-fg,#5f6368)] hover:bg-[var(--btn-neutral-bg-hover,#e8eaed)] dark:text-slate-300 dark:hover:bg-slate-700"
                      onClick={() => { setAddMode(null); }}
                    >
                      返回
                    </Button>
                  )}
                  <Button
                    onClick={handleCloneFromGit}
                    disabled={isBusy || !gitUrl.trim()}
                    className="h-9 rounded-full px-5 text-[13px] bg-violet-600 text-white shadow-none hover:bg-violet-500 dark:bg-violet-600 dark:hover:bg-violet-500"
                  >
                    {isBusy ? "克隆中..." : "开始克隆"}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setIsAddOpen(false)}
                  className="h-9 rounded-full px-5 text-[13px] bg-emerald-600 text-white shadow-none hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  完成
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

    </>
  );
};
