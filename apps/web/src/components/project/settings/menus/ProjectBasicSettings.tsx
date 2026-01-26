import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilePenLine, PencilLine, SmilePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@tenas-ai/ui/button";
import { TenasSettingsGroup } from "@tenas-ai/ui/tenas/TenasSettingsGroup";
import { TenasSettingsField } from "@tenas-ai/ui/tenas/TenasSettingsField";
import { useProject } from "@/hooks/use-project";
import { useProjects } from "@/hooks/use-projects";
import { trpc } from "@/utils/trpc";
import { PageTreePicker } from "@/components/layout/sidebar/ProjectTree";
import { Popover, PopoverContent, PopoverTrigger } from "@tenas-ai/ui/popover";
import { EmojiPicker } from "@tenas-ai/ui/emoji-picker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tenas-ai/ui/dialog";
import { Input } from "@tenas-ai/ui/input";
import { Label } from "@tenas-ai/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@tenas-ai/ui/alert-dialog";
import {
  formatSize,
  getDisplayPathFromUri,
} from "@/components/project/filesystem/utils/file-system-utils";
import { invalidateChatSessions } from "@/hooks/use-chat-sessions";
import { useTabs } from "@/hooks/use-tabs";
import { buildProjectHierarchyIndex, filterProjectTree } from "@/lib/project-tree";

type ProjectBasicSettingsProps = {
  projectId?: string;
  rootUri?: string;
};

/** Copy text to clipboard with a fallback. */
async function copyToClipboard(text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

/** Resolve folder name from a URI or local path. */
function getFolderName(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("file://")) {
    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      const last = parts[parts.length - 1] ?? "";
      return decodeURIComponent(last);
    } catch {
      return "";
    }
  }
  const normalized = trimmed.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** Join parent path and folder name with best-effort separator. */
function joinParentPath(parentPath: string, folderName: string): string {
  const trimmed = parentPath.replace(/[\\/]+$/, "");
  const isWindowsDriveRoot = /^[A-Za-z]:$/.test(trimmed);
  if (isWindowsDriveRoot) {
    return `${trimmed}\\${folderName}`;
  }
  if (!trimmed) {
    const separator = parentPath.includes("\\") ? "\\" : "/";
    return `${separator}${folderName}`;
  }
  const separator = trimmed.includes("\\") ? "\\" : "/";
  return `${trimmed}${separator}${folderName}`;
}

/** Project basic settings panel. */
const ProjectBasicSettings = memo(function ProjectBasicSettings({
  projectId,
  rootUri,
}: ProjectBasicSettingsProps) {
  const queryClient = useQueryClient();
  const { data: projectData, invalidateProject, invalidateProjectList } = useProject(
    projectId,
  );
  const project = projectData?.project;
  const tabs = useTabs((s) => s.tabs);
  const activeTabId = useTabs((s) => s.activeTabId);
  const setTabTitle = useTabs((s) => s.setTabTitle);
  /** Track rename dialog open state. */
  const [renameOpen, setRenameOpen] = useState(false);
  /** Track rename draft title. */
  const [renameDraft, setRenameDraft] = useState("");
  /** Track rename request state. */
  const [renameBusy, setRenameBusy] = useState(false);
  /** Track icon picker popover state. */
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  /** Track parent picker dialog open state. */
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  /** Track selected parent project id. */
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  /** Track pending parent move confirmation. */
  const [pendingParentMove, setPendingParentMove] = useState<{
    targetParentId: string | null;
  } | null>(null);
  /** Track parent move request state. */
  const [moveParentBusy, setMoveParentBusy] = useState(false);
  /** Track target parent path for storage move. */
  const [moveTargetParentPath, setMoveTargetParentPath] = useState<string | null>(null);
  /** Track move progress percentage. */
  const [moveProgress, setMoveProgress] = useState(0);
  /** Track move request state. */
  const [moveBusy, setMoveBusy] = useState(false);
  /** Store timer id for move progress simulation. */
  const moveTimerRef = useRef<number | null>(null);
  /** Track chat clear dialog open state. */
  const [clearChatOpen, setClearChatOpen] = useState(false);
  /** Track cache clear dialog open state. */
  const [clearCacheOpen, setClearCacheOpen] = useState(false);

  const updateProject = useMutation(
    trpc.project.update.mutationOptions({
      onSuccess: async () => {
        await invalidateProject();
        await invalidateProjectList();
      },
    }),
  );

  const moveStorage = useMutation(trpc.project.moveStorage.mutationOptions({}));
  const moveProjectParent = useMutation(trpc.project.move.mutationOptions({}));

  const projectsQuery = useProjects({ enabled: Boolean(projectId) });

  const chatStatsQuery = useQuery({
    ...trpc.chat.getProjectChatStats.queryOptions(
      projectId ? { projectId } : skipToken,
    ),
    staleTime: 5000,
  });

  const workspaceId = useMemo(() => {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    const rawWorkspaceId = activeTab?.workspaceId ?? "";
    if (!rawWorkspaceId || rawWorkspaceId === "unknown") return undefined;
    return rawWorkspaceId;
  }, [activeTabId, tabs]);

  const cacheScope = useMemo(() => {
    if (projectId) return { projectId };
    if (workspaceId) return { workspaceId };
    return null;
  }, [projectId, workspaceId]);

  const cacheQueryKey = useMemo(() => {
    if (!cacheScope) return undefined;
    return trpc.project.getCacheSize.queryOptions(cacheScope).queryKey;
  }, [cacheScope]);

  const cacheSizeQuery = useQuery({
    ...trpc.project.getCacheSize.queryOptions(cacheScope ?? skipToken),
    staleTime: 5000,
  });

  const clearProjectChat = useMutation(
    trpc.chat.clearProjectChat.mutationOptions({}),
  );

  const clearProjectCache = useMutation(
    trpc.project.clearCache.mutationOptions({
      onSuccess: async () => {
        if (!cacheQueryKey) return;
        await queryClient.invalidateQueries({ queryKey: cacheQueryKey });
      },
    }),
  );

  const storagePath = useMemo(() => rootUri ?? "", [rootUri]);
  const displayStoragePath = useMemo(() => {
    if (!storagePath) return "-";
    return getDisplayPathFromUri(storagePath);
  }, [storagePath]);
  const projectFolderName = useMemo(() => getFolderName(storagePath), [storagePath]);
  const moveTargetPath = useMemo(() => {
    if (!moveTargetParentPath || !projectFolderName) return "";
    return joinParentPath(moveTargetParentPath, projectFolderName);
  }, [moveTargetParentPath, projectFolderName]);
  const chatSessionCount = chatStatsQuery.data?.sessionCount;
  const baseValueClass =
    "flex-1 text-right text-xs text-muted-foreground hover:text-foreground hover:underline disabled:cursor-default disabled:no-underline disabled:text-muted-foreground";
  const baseValueTruncateClass = `${baseValueClass} truncate`;
  const baseValueWrapClass = `${baseValueClass} break-all`;
  /** Whether cache management is available. */
  const canManageCache = Boolean(cacheScope);
  const projectTree = projectsQuery.data ?? [];
  const projectHierarchy = useMemo(
    () => buildProjectHierarchyIndex(projectTree),
    [projectTree],
  );
  const currentParentId = useMemo(() => {
    if (!projectId) return null;
    return projectHierarchy.parentById.get(projectId) ?? null;
  }, [projectHierarchy, projectId]);
  const currentParent = useMemo(() => {
    if (!currentParentId) return null;
    return projectHierarchy.projectById.get(currentParentId) ?? null;
  }, [currentParentId, projectHierarchy]);
  const excludedParentIds = useMemo(() => {
    const ids = new Set<string>();
    if (!projectId) return ids;
    ids.add(projectId);
    const descendants = projectHierarchy.descendantsById.get(projectId);
    if (descendants) {
      for (const id of descendants) {
        ids.add(id);
      }
    }
    return ids;
  }, [projectHierarchy, projectId]);
  const selectableProjects = useMemo(
    () => filterProjectTree(projectTree, excludedParentIds),
    [excludedParentIds, projectTree],
  );
  const parentPickerActiveUri = useMemo(() => {
    const activeId = selectedParentId ?? currentParentId;
    if (!activeId) return null;
    return projectHierarchy.rootUriById.get(activeId) ?? null;
  }, [currentParentId, projectHierarchy, selectedParentId]);

  useEffect(() => {
    if (!renameOpen) return;
    setRenameDraft(project?.title ?? "");
  }, [renameOpen, project?.title]);

  useEffect(() => {
    if (!parentPickerOpen) return;
    setSelectedParentId(currentParentId);
  }, [currentParentId, parentPickerOpen]);

  useEffect(() => {
    return () => {
      if (moveTimerRef.current !== null) {
        window.clearInterval(moveTimerRef.current);
      }
    };
  }, []);

  /** Start simulated progress updates for storage move. */
  const startMoveProgress = useCallback(() => {
    if (moveTimerRef.current !== null) {
      window.clearInterval(moveTimerRef.current);
    }
    setMoveProgress(0);
    moveTimerRef.current = window.setInterval(() => {
      setMoveProgress((prev) => {
        if (prev >= 90) return prev;
        // 逻辑：进度先模拟到 90%，等待真实移动完成后再跳到 100%。
        return Math.min(prev + 8, 90);
      });
    }, 180);
  }, []);

  /** Stop simulated progress updates. */
  const stopMoveProgress = useCallback(() => {
    if (moveTimerRef.current === null) return;
    window.clearInterval(moveTimerRef.current);
    moveTimerRef.current = null;
  }, []);

  /** Open project rename dialog. */
  const handleOpenRename = useCallback(() => {
    if (!projectId) {
      toast.error("缺少项目 ID");
      return;
    }
    setRenameOpen(true);
  }, [projectId]);

  /** Save project title updates. */
  const handleRename = useCallback(async () => {
    if (!projectId) {
      toast.error("缺少项目 ID");
      return;
    }
    const nextTitle = renameDraft.trim();
    if (!nextTitle) {
      toast.error("请输入名称");
      return;
    }
    if (nextTitle === (project?.title ?? "")) {
      setRenameOpen(false);
      return;
    }
    try {
      setRenameBusy(true);
      await updateProject.mutateAsync({ projectId, title: nextTitle });
      const baseId = `project:${projectId}`;
      tabs
        .filter((tab) => tab.base?.id === baseId)
        .forEach((tab) => setTabTitle(tab.id, nextTitle));
      toast.success("重命名成功");
      setRenameOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "重命名失败");
    } finally {
      setRenameBusy(false);
    }
  }, [projectId, renameDraft, project?.title, updateProject, tabs, setTabTitle]);

  /** Open the parent picker dialog. */
  const handleOpenParentPicker = useCallback(() => {
    if (!projectId) {
      toast.error("缺少项目 ID");
      return;
    }
    if (selectableProjects.length === 0) {
      toast.error("暂无可选父项目");
      return;
    }
    setParentPickerOpen(true);
  }, [projectId, selectableProjects.length]);

  /** Handle selecting parent project from picker. */
  const handleSelectParentUri = useCallback(
    (uri: string) => {
      const targetId = projectHierarchy.projectIdByRootUri.get(uri);
      if (!targetId) {
        toast.error("未找到目标项目");
        return;
      }
      setSelectedParentId(targetId);
    },
    [projectHierarchy],
  );

  /** Confirm selection from parent picker. */
  const handleSubmitParentSelection = useCallback(() => {
    if (!selectedParentId) {
      toast.error("请选择父项目");
      return;
    }
    // 逻辑：选择同一父项目时不触发确认。
    if (selectedParentId === currentParentId) {
      toast.error("已在该父项目下");
      return;
    }
    setParentPickerOpen(false);
    setPendingParentMove({ targetParentId: selectedParentId });
  }, [currentParentId, selectedParentId]);

  /** Trigger move to root confirmation. */
  const handleMoveToRoot = useCallback(() => {
    if (!projectId) {
      toast.error("缺少项目 ID");
      return;
    }
    if (!currentParentId) return;
    setPendingParentMove({ targetParentId: null });
  }, [currentParentId, projectId]);

  /** Resolve project title from index with fallback. */
  const resolveProjectTitle = useCallback(
    (targetId: string | null) => {
      if (!targetId) return "根项目";
      return projectHierarchy.projectById.get(targetId)?.title ?? "未命名项目";
    },
    [projectHierarchy],
  );

  /** Confirm parent move after user approval. */
  const handleConfirmParentMove = useCallback(async () => {
    if (!projectId || !pendingParentMove) {
      toast.error("缺少项目 ID");
      return;
    }
    try {
      setMoveParentBusy(true);
      // 逻辑：确认后再提交父项目变更。
      await moveProjectParent.mutateAsync({
        projectId,
        targetParentProjectId: pendingParentMove.targetParentId ?? null,
      });
      toast.success("父项目已更新");
      setPendingParentMove(null);
      setSelectedParentId(null);
      await invalidateProjectList();
    } catch (err: any) {
      toast.error(err?.message ?? "更新失败");
    } finally {
      setMoveParentBusy(false);
    }
  }, [invalidateProjectList, moveProjectParent, pendingParentMove, projectId]);

  /** Pick target parent folder for storage move. */
  const handlePickStorageParent = useCallback(async () => {
    if (!projectId) {
      toast.error("缺少项目 ID");
      return;
    }
    const api = window.tenasElectron;
    if (!api?.pickDirectory) {
      toast.error("网页版不支持选择目录");
      return;
    }
    const result = await api.pickDirectory({
      defaultPath: rootUri ?? undefined,
    });
    if (!result?.ok || !result.path) return;
    setMoveTargetParentPath(result.path);
    setMoveProgress(0);
  }, [projectId, rootUri]);

  /** Handle storage move confirmation. */
  const handleConfirmMove = useCallback(async () => {
    if (!projectId) {
      toast.error("缺少项目 ID");
      return;
    }
    if (!moveTargetParentPath) return;
    try {
      setMoveBusy(true);
      startMoveProgress();
      const result = await moveStorage.mutateAsync({
        projectId,
        targetParentPath: moveTargetParentPath,
      });
      setMoveProgress(100);
      if (result?.unchanged) {
        toast.message("存储路径未变化");
      } else {
        toast.success("存储路径已更新");
      }
      await invalidateProject();
      await invalidateProjectList();
      await new Promise((resolve) => setTimeout(resolve, 300));
      setMoveTargetParentPath(null);
      setMoveProgress(0);
    } catch (err: any) {
      toast.error(err?.message ?? "移动失败");
      setMoveProgress(0);
    } finally {
      stopMoveProgress();
      setMoveBusy(false);
    }
  }, [
    projectId,
    moveTargetParentPath,
    moveStorage,
    startMoveProgress,
    invalidateProject,
    invalidateProjectList,
    stopMoveProgress,
  ]);

  /** Handle storage move dialog open state changes. */
  const handleMoveDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open && moveBusy) return;
      if (!open) {
        setMoveTargetParentPath(null);
        setMoveProgress(0);
      }
    },
    [moveBusy],
  );

  /** Clear project chat data. */
  const handleClearProjectChat = useCallback(async () => {
    if (!projectId) {
      toast.error("缺少项目 ID");
      return;
    }
    try {
      const result = await clearProjectChat.mutateAsync({ projectId });
      toast.success(`已清空 ${result.deletedSessions} 个会话`);
      await queryClient.invalidateQueries({
        queryKey: trpc.chat.getProjectChatStats.queryOptions({ projectId }).queryKey,
      });
      invalidateChatSessions(queryClient);
      setClearChatOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "清空失败");
    }
  }, [projectId, clearProjectChat, queryClient]);

  /** Clear project cache data. */
  const handleClearProjectCache = useCallback(async () => {
    if (!cacheScope) {
      toast.error("缺少项目或工作区");
      return;
    }
    try {
      await clearProjectCache.mutateAsync(cacheScope);
      toast.success("缓存已清空");
      setClearCacheOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "清空失败");
    }
  }, [cacheScope, clearProjectCache]);

  return (
    <div className="space-y-4">
      <TenasSettingsGroup title="项目设置" cardProps={{ divided: true, padding: "x" }}>
        <div className="flex flex-wrap items-start gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">项目 ID</div>
            <div className="text-xs text-muted-foreground">仅用于识别与复制</div>
          </div>

          <TenasSettingsField>
            <button
              type="button"
              className={baseValueTruncateClass}
              disabled={!projectId}
              onClick={async () => {
                if (!projectId) return;
                await copyToClipboard(projectId);
                toast.success("已复制项目 ID");
              }}
              title={projectId ?? "-"}
            >
              {projectId ?? "-"}
            </button>
          </TenasSettingsField>
        </div>

        <div className="flex flex-wrap items-start gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">项目图标</div>
            <div className="text-xs text-muted-foreground">支持 Emoji</div>
          </div>

          <TenasSettingsField>
            <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  disabled={!projectId || !rootUri}
                  aria-label="选择项目图标"
                  title="选择项目图标"
                >
                  <span className="text-lg leading-none">
                    {project?.icon ?? <SmilePlus className="size-4" />}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[352px] max-w-[calc(100vw-24px)] p-0 min-h-[420px] bg-popover overflow-hidden"
                align="end"
              >
                <EmojiPicker
                  width="100%"
                  onSelect={(nextIcon) => {
                    setIconPickerOpen(false);
                    if (!projectId) return;
                    updateProject.mutate({ projectId, icon: nextIcon });
                  }}
                />
              </PopoverContent>
            </Popover>
          </TenasSettingsField>
        </div>

        <div className="flex flex-wrap items-start gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">项目名称</div>
            <div className="text-xs text-muted-foreground">显示在项目标题处</div>
          </div>

          <TenasSettingsField className="gap-2">
            <button
              type="button"
              className={baseValueTruncateClass}
              disabled={!project?.title}
              onClick={async () => {
                const title = project?.title?.trim();
                if (!title) return;
                await copyToClipboard(title);
                toast.success("已复制项目名称");
              }}
              title={project?.title ?? "-"}
            >
              {project?.title ?? "-"}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!projectId}
              onClick={handleOpenRename}
              aria-label="修改项目名称"
              title="修改项目名称"
            >
              <PencilLine className="size-4" />
            </Button>
          </TenasSettingsField>
        </div>

        <div className="flex flex-wrap items-start gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">父项目</div>
            <div className="text-xs text-muted-foreground">
              也可在左侧项目树中拖拽调整层级
            </div>
          </div>

          <TenasSettingsField className="gap-2">
            <button
              type="button"
              className={baseValueTruncateClass}
              onClick={async () => {
                const title = currentParent?.title ?? "无父项目";
                await copyToClipboard(title);
                toast.success("已复制父项目");
              }}
              title={currentParent?.title ?? "无父项目"}
            >
              {currentParent?.title ?? "无父项目"}
            </button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!projectId || selectableProjects.length === 0}
              onClick={handleOpenParentPicker}
            >
              更改父项目
            </Button>
            {currentParentId ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!projectId}
                onClick={handleMoveToRoot}
              >
                移到根项目
              </Button>
            ) : null}
          </TenasSettingsField>
        </div>
      </TenasSettingsGroup>

      <TenasSettingsGroup title="存储管理" cardProps={{ divided: true, padding: "x" }}>
        <div className="flex flex-wrap items-start gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">存储路径</div>
            <div className="text-xs text-muted-foreground">项目根目录</div>
          </div>

          <TenasSettingsField className="gap-2">
            <button
              type="button"
              className={baseValueWrapClass}
              disabled={!storagePath}
              onClick={async () => {
                if (!displayStoragePath || displayStoragePath === "-") return;
                await copyToClipboard(displayStoragePath);
                toast.success("已复制存储路径");
              }}
              title={displayStoragePath}
            >
              {displayStoragePath}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!projectId || !rootUri || moveBusy}
              onClick={() => void handlePickStorageParent()}
              aria-label="修改存储路径"
              title="修改存储路径"
            >
              <FilePenLine className="size-4" />
            </Button>
          </TenasSettingsField>
        </div>

        <div className="flex flex-wrap items-start gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">缓存占用</div>
            <div className="text-xs text-muted-foreground">
              可随时清空，不影响项目数据
            </div>
          </div>

          <TenasSettingsField className="gap-2">
            <div className={baseValueTruncateClass}>
              {cacheSizeQuery.isFetching
                ? "计算中..."
                : formatSize(cacheSizeQuery.data?.bytes)}
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!canManageCache || clearProjectCache.isPending}
              onClick={() => setClearCacheOpen(true)}
            >
              清空缓存
            </Button>
          </TenasSettingsField>
        </div>
      </TenasSettingsGroup>

      <TenasSettingsGroup title="AI 聊天" cardProps={{ divided: true, padding: "x" }}>
        <div className="flex flex-wrap items-start gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">AI 聊天记录数量</div>
            <div className="text-xs text-muted-foreground">清空后不可恢复</div>
          </div>

          <TenasSettingsField className="gap-2">
            <button
              type="button"
              className={baseValueTruncateClass}
              disabled={typeof chatSessionCount !== "number"}
              onClick={async () => {
                if (typeof chatSessionCount !== "number") return;
                await copyToClipboard(String(chatSessionCount));
                toast.success("已复制聊天记录数量");
              }}
              title={
                typeof chatSessionCount === "number"
                  ? String(chatSessionCount)
                  : "-"
              }
            >
              {typeof chatSessionCount === "number" ? chatSessionCount : "-"}
            </button>
            {typeof chatSessionCount === "number" && chatSessionCount > 0 ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="ml-2"
                disabled={!projectId || clearProjectChat.isPending}
                onClick={() => setClearChatOpen(true)}
              >
                <Trash2 className="size-4" />
                <span>{clearProjectChat.isPending ? "清空中..." : "清空"}</span>
              </Button>
            ) : null}
          </TenasSettingsField>
        </div>
      </TenasSettingsGroup>

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          if (!open && renameBusy) return;
          setRenameOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名</DialogTitle>
            <DialogDescription>请输入新的名称。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="project-title" className="text-right">
                名称
              </Label>
              <Input
                id="project-title"
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                className="col-span-3"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleRename();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={renameBusy}>
                取消
              </Button>
            </DialogClose>
            <Button onClick={() => void handleRename()} disabled={renameBusy}>
              {renameBusy ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={parentPickerOpen}
        onOpenChange={(open) => {
          if (!open && moveParentBusy) return;
          setParentPickerOpen(open);
          if (!open) {
            setSelectedParentId(null);
          }
        }}
      >
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>选择父项目</DialogTitle>
            <DialogDescription>选择要挂载的父项目。</DialogDescription>
          </DialogHeader>
          <div className="max-h-[360px] overflow-y-auto rounded-xl border border-border/60 bg-card/60 p-3">
            {selectableProjects.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无可选父项目</div>
            ) : (
              <PageTreePicker
                projects={selectableProjects}
                activeUri={parentPickerActiveUri}
                onSelect={handleSelectParentUri}
              />
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                取消
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleSubmitParentSelection}
              disabled={!selectedParentId || selectedParentId === currentParentId}
            >
              下一步
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingParentMove)}
        onOpenChange={(open) => {
          if (!open && moveParentBusy) return;
          if (!open) {
            setPendingParentMove(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认移动</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingParentMove
                ? pendingParentMove.targetParentId
                  ? `将「${project?.title ?? "当前项目"}」移动到「${resolveProjectTitle(pendingParentMove.targetParentId)}」下？`
                  : `将「${project?.title ?? "当前项目"}」移到根项目？`
                : "确认调整项目层级。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-xs text-muted-foreground">
            调整后子项目会随项目一起移动。
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={moveParentBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmParentMove();
              }}
              disabled={moveParentBusy}
            >
              {moveParentBusy ? "移动中..." : "确认移动"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(moveTargetParentPath)}
        onOpenChange={handleMoveDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认移动</AlertDialogTitle>
            <AlertDialogDescription>
              目标父目录已选择，确认将项目文件夹移动到新位置吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-xs text-muted-foreground">
            <div className="space-y-1">
              <div>当前路径</div>
              <div className="text-foreground break-all">{displayStoragePath}</div>
            </div>
            <div className="space-y-1">
              <div>目标父目录</div>
              <div className="text-foreground break-all">
                {moveTargetParentPath ?? "-"}
              </div>
            </div>
            <div className="space-y-1">
              <div>移动后路径</div>
              <div className="text-foreground break-all">
                {moveTargetPath || "-"}
              </div>
            </div>
          </div>
          {moveBusy ? (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">正在移动...</div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${moveProgress}%` }}
                />
              </div>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={moveBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmMove();
              }}
              disabled={moveBusy}
            >
              {moveBusy ? "移动中..." : "确认移动"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={clearCacheOpen}
        onOpenChange={(open) => {
          if (!open && clearProjectCache.isPending) return;
          setClearCacheOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空缓存</AlertDialogTitle>
            <AlertDialogDescription>
              将删除当前项目下的 .tenas-cache 目录，操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearProjectCache.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleClearProjectCache();
              }}
              disabled={clearProjectCache.isPending}
            >
              {clearProjectCache.isPending ? "清空中..." : "确认清空"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={clearChatOpen}
        onOpenChange={(open) => {
          if (!open && clearProjectChat.isPending) return;
          setClearChatOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空</AlertDialogTitle>
            <AlertDialogDescription>
              将删除当前项目下的聊天记录与本地文件，无法恢复。
              {typeof chatSessionCount === "number"
                ? `（当前 ${chatSessionCount} 个会话）`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearProjectChat.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleClearProjectChat();
              }}
              disabled={clearProjectChat.isPending}
            >
              {clearProjectChat.isPending ? "清空中..." : "确认清空"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

export { ProjectBasicSettings };
