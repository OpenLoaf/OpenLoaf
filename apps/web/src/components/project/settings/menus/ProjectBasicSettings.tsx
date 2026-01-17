import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, PencilLine, SmilePlus } from "lucide-react";
import { toast } from "sonner";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { TenasSettingsGroup } from "@/components/ui/tenas/TenasSettingsGroup";
import { TenasSettingsField } from "@/components/ui/tenas/TenasSettingsField";
import { useProject } from "@/hooks/use-project";
import { trpc } from "@/utils/trpc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getDisplayPathFromUri } from "@/components/project/filesystem/utils/file-system-utils";
import { invalidateChatSessions } from "@/hooks/use-chat-sessions";
import { useTabs } from "@/hooks/use-tabs";

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
  const setTabTitle = useTabs((s) => s.setTabTitle);
  /** Track rename dialog open state. */
  const [renameOpen, setRenameOpen] = useState(false);
  /** Track rename draft title. */
  const [renameDraft, setRenameDraft] = useState("");
  /** Track rename request state. */
  const [renameBusy, setRenameBusy] = useState(false);
  /** Track icon picker popover state. */
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
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

  const updateProject = useMutation(
    trpc.project.update.mutationOptions({
      onSuccess: async () => {
        await invalidateProject();
        await invalidateProjectList();
      },
    }),
  );

  const moveStorage = useMutation(trpc.project.moveStorage.mutationOptions({}));

  const chatStatsQuery = useQuery({
    ...trpc.chat.getProjectChatStats.queryOptions(
      projectId ? { projectId } : skipToken,
    ),
    staleTime: 5000,
  });

  const clearProjectChat = useMutation(
    trpc.chat.clearProjectChat.mutationOptions({}),
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

  useEffect(() => {
    if (!renameOpen) return;
    setRenameDraft(project?.title ?? "");
  }, [renameOpen, project?.title]);

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
              className="flex-1 text-right text-sm text-foreground truncate hover:underline disabled:cursor-default disabled:no-underline disabled:text-muted-foreground"
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
            <div className="flex-1 text-right text-sm text-foreground truncate">
              {project?.title ?? "-"}
            </div>
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
      </TenasSettingsGroup>

      <TenasSettingsGroup title="存储管理" cardProps={{ divided: true, padding: "x" }}>
        <div className="flex flex-wrap items-start gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">存储路径</div>
            <div className="text-xs text-muted-foreground">项目根目录</div>
          </div>

          <TenasSettingsField className="gap-2">
            <div
              className="flex-1 text-right text-xs text-muted-foreground break-all"
              title={displayStoragePath}
            >
              {displayStoragePath}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!projectId || !rootUri || moveBusy}
              onClick={() => void handlePickStorageParent()}
              aria-label="修改存储路径"
              title="修改存储路径"
            >
              <ArrowRightLeft className="size-4" />
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
            <div className="flex-1 text-right text-sm text-foreground">
              {typeof chatSessionCount === "number" ? chatSessionCount : "-"}
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!projectId || clearProjectChat.isPending}
              onClick={() => setClearChatOpen(true)}
            >
              {clearProjectChat.isPending ? "清空中..." : "清空"}
            </Button>
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
