/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilePenLine, PencilLine, SmilePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@openloaf/ui/button";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import { useProject } from "@/hooks/use-project";
import { useProjects } from "@/hooks/use-projects";
import { trpc } from "@/utils/trpc";
import { PageTreePicker } from "@/components/layout/sidebar/ProjectTree";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import { EmojiPicker } from "@openloaf/ui/emoji-picker";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select";
import { Label } from "@openloaf/ui/label";
import { Switch } from "@openloaf/ui/switch";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  formatSize,
  getDisplayPathFromUri,
} from "@/components/project/filesystem/utils/file-system-utils";
import { invalidateChatSessions } from "@/hooks/use-chat-sessions";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
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
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const { data: projectData, invalidateProject, invalidateProjectList } = useProject(
    projectId,
  );
  const project = projectData?.project;
  const setTitle = useAppView((s) => s.setTitle);
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
  const setFeaturesMutation = useMutation(
    trpc.project.setFeatures.mutationOptions({
      onSuccess: async () => {
        await invalidateProject();
      },
    }),
  );

  const projectsQuery = useProjects({ enabled: Boolean(projectId) });

  const chatStatsQuery = useQuery({
    ...trpc.chat.getProjectChatStats.queryOptions(
      projectId ? { projectId } : skipToken,
    ),
    staleTime: 5000,
  });

  const cacheScope = useMemo(() => {
    if (projectId) return { projectId };
    return null;
  }, [projectId]);

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

  const FEATURE_OPTIONS = [
    { value: "canvas", labelKey: "project.featureCanvas", descKey: "project.featureCanvasDesc" },
    { value: "index", labelKey: "project.featureHome", descKey: "project.featureHomeDesc" },
    { value: "tasks", labelKey: "project.featureHistory", descKey: "project.featureHistoryDesc" },
    { value: "scheduled", labelKey: "project.featureScheduled", descKey: "project.featureScheduledDesc" },
  ] as const;
  const enabledFeatures = useMemo(
    () => new Set(project?.initializedFeatures ?? []),
    [project?.initializedFeatures],
  );
  const handleToggleFeature = useCallback(
    (feature: string, checked: boolean) => {
      if (!projectId) return;
      const next = new Set(enabledFeatures);
      if (checked) {
        next.add(feature);
      } else {
        next.delete(feature);
      }
      setFeaturesMutation.mutate({
        projectId,
        features: [...next] as ("index" | "tasks" | "canvas" | "scheduled")[],
      });
    },
    [projectId, enabledFeatures, setFeaturesMutation],
  );

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
      toast.error(t("project.missingId"));
      return;
    }
    setRenameOpen(true);
  }, [projectId, t]);

  /** Save project title updates. */
  const handleRename = useCallback(async () => {
    if (!projectId) {
      toast.error(t("project.missingId"));
      return;
    }
    const nextTitle = renameDraft.trim();
    if (!nextTitle) {
      toast.error(t("project.namePlease"));
      return;
    }
    if (nextTitle === (project?.title ?? "")) {
      setRenameOpen(false);
      return;
    }
    try {
      setRenameBusy(true);
      await updateProject.mutateAsync({ projectId, title: nextTitle });
      // In single-view mode, update the title if the current base matches this project.
      const currentBase = useLayoutState.getState().base;
      const baseId = `project:${projectId}`;
      if (currentBase?.id === baseId) {
        setTitle(nextTitle);
      }
      toast.success(t("project.renameSuccess"));
      setRenameOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? t("project.renameError"));
    } finally {
      setRenameBusy(false);
    }
  }, [projectId, renameDraft, project?.title, updateProject, setTitle, t]);

  /** Open the parent picker dialog. */
  const handleOpenParentPicker = useCallback(() => {
    if (!projectId) {
      toast.error(t("project.missingId"));
      return;
    }
    if (selectableProjects.length === 0) {
      toast.error(t("project.noParents"));
      return;
    }
    setParentPickerOpen(true);
  }, [projectId, selectableProjects.length, t]);

  /** Handle selecting parent project from picker. */
  const handleSelectParentUri = useCallback(
    (uri: string) => {
      const targetId = projectHierarchy.projectIdByRootUri.get(uri);
      if (!targetId) {
        toast.error(t("project.targetNotFound"));
        return;
      }
      setSelectedParentId(targetId);
    },
    [projectHierarchy, t],
  );

  /** Confirm selection from parent picker. */
  const handleSubmitParentSelection = useCallback(() => {
    if (!selectedParentId) {
      toast.error(t("project.selectParent"));
      return;
    }
    // 逻辑：选择同一父项目时不触发确认。
    if (selectedParentId === currentParentId) {
      toast.error(t("project.alreadyUnder"));
      return;
    }
    setParentPickerOpen(false);
    setPendingParentMove({ targetParentId: selectedParentId });
  }, [currentParentId, selectedParentId, t]);

  /** Trigger move to root confirmation. */
  const handleMoveToRoot = useCallback(() => {
    if (!projectId) {
      toast.error(t("project.missingId"));
      return;
    }
    if (!currentParentId) return;
    setPendingParentMove({ targetParentId: null });
  }, [currentParentId, projectId, t]);

  /** Resolve project title from index with fallback. */
  const resolveProjectTitle = useCallback(
    (targetId: string | null) => {
      if (!targetId) return t("project.moveCurrentProject");
      return projectHierarchy.projectById.get(targetId)?.title ?? t("project.moveCurrentProject");
    },
    [projectHierarchy, t],
  );

  /** Confirm parent move after user approval. */
  const handleConfirmParentMove = useCallback(async () => {
    if (!projectId || !pendingParentMove) {
      toast.error(t("project.missingId"));
      throw new Error("missing-id");
    }
    try {
      setMoveParentBusy(true);
      // 逻辑：确认后再提交父项目变更。
      await moveProjectParent.mutateAsync({
        projectId,
        targetParentProjectId: pendingParentMove.targetParentId ?? null,
      });
      toast.success(t("project.parentUpdated"));
      setSelectedParentId(null);
      await invalidateProjectList();
    } catch (err: any) {
      toast.error(err?.message ?? t("project.updateError"));
      throw err;
    } finally {
      setMoveParentBusy(false);
    }
  }, [invalidateProjectList, moveProjectParent, pendingParentMove, projectId, t]);

  /** Pick target parent folder for storage move. */
  const handlePickStorageParent = useCallback(async () => {
    if (!projectId) {
      toast.error(t("project.missingId"));
      return;
    }
    const api = window.openloafElectron;
    if (!api?.pickDirectory) {
      toast.error(t("project.webNoDirectory"));
      return;
    }
    const result = await api.pickDirectory({
      defaultPath: rootUri ?? undefined,
    });
    if (!result?.ok || !result.path) return;
    setMoveTargetParentPath(result.path);
    setMoveProgress(0);
  }, [projectId, rootUri, t]);

  /** Handle storage move confirmation. */
  const handleConfirmMove = useCallback(async () => {
    if (!projectId) {
      toast.error(t("project.missingId"));
      throw new Error("missing-id");
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
        toast.message(t("project.pathUnchanged"));
      } else {
        toast.success(t("project.pathUpdated"));
      }
      await invalidateProject();
      await invalidateProjectList();
      await new Promise((resolve) => setTimeout(resolve, 300));
      setMoveProgress(0);
    } catch (err: any) {
      toast.error(err?.message ?? t("project.moveFailed"));
      setMoveProgress(0);
      throw err;
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
    t,
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
      toast.error(t("project.missingId"));
      throw new Error("missing-id");
    }
    try {
      const result = await clearProjectChat.mutateAsync({ projectId });
      toast.success(t("project.sessionCleared", { count: result.deletedSessions }));
      await queryClient.invalidateQueries({
        queryKey: trpc.chat.getProjectChatStats.queryOptions({ projectId }).queryKey,
      });
      invalidateChatSessions(queryClient);
    } catch (err: any) {
      toast.error(err?.message ?? t("project.clearError"));
      throw err;
    }
  }, [projectId, clearProjectChat, queryClient, t]);

  /** Clear project cache data. */
  const handleClearProjectCache = useCallback(async () => {
    if (!cacheScope) {
      toast.error(t("project.missingScope"));
      throw new Error("missing-scope");
    }
    try {
      await clearProjectCache.mutateAsync(cacheScope);
      toast.success(t("project.cacheCleared"));
    } catch (err: any) {
      toast.error(err?.message ?? t("project.clearError"));
      throw err;
    }
  }, [cacheScope, clearProjectCache, t]);

  return (
    <div className="space-y-4">
      <OpenLoafSettingsGroup title={t("project.title")} cardProps={{ divided: true, padding: "x" }}>
        <div className="flex flex-wrap items-start gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">{t("project.projectId")}</div>
            <div className="text-xs text-muted-foreground">{t("project.idDescription")}</div>
          </div>

          <OpenLoafSettingsField>
            <button
              type="button"
              className={baseValueTruncateClass}
              disabled={!projectId}
              onClick={async () => {
                if (!projectId) return;
                await copyToClipboard(projectId);
                toast.success(t("project.idCopied"));
              }}
              title={projectId ?? "-"}
            >
              {projectId ?? "-"}
            </button>
          </OpenLoafSettingsField>
        </div>

        <div className="flex flex-wrap items-start gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">{t("project.icon")}</div>
            <div className="text-xs text-muted-foreground">{t("project.iconSupport")}</div>
          </div>

          <OpenLoafSettingsField>
            <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  disabled={!projectId || !rootUri}
                  aria-label={t("project.selectIcon")}
                  title={t("project.selectIcon")}
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
          </OpenLoafSettingsField>
        </div>

        <div className="flex flex-wrap items-start gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">{t("project.name")}</div>
            <div className="text-xs text-muted-foreground">{t("project.nameDescription")}</div>
          </div>

          <OpenLoafSettingsField className="gap-2">
            <button
              type="button"
              className={baseValueTruncateClass}
              disabled={!project?.title}
              onClick={async () => {
                const title = project?.title?.trim();
                if (!title) return;
                await copyToClipboard(title);
                toast.success(t("project.nameCopied"));
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
              aria-label={t("project.editName")}
              title={t("project.editName")}
            >
              <PencilLine className="size-4" />
            </Button>
          </OpenLoafSettingsField>
        </div>

        <div className="flex flex-wrap items-center gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">{t("project.projectType")}</div>
          </div>

          <OpenLoafSettingsField>
            <Select
              value={project?.projectType ?? "general"}
              onValueChange={(value) => {
                if (!projectId) return;
                updateProject.mutate({
                  projectId,
                  projectType: value as "code" | "document" | "data" | "design" | "research" | "general",
                });
              }}
              disabled={!projectId}
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["code", "document", "data", "design", "research", "general"] as const).map(
                  (type) => (
                    <SelectItem key={type} value={type} className="text-xs">
                      {t(`project.typeLabel.${type}`)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </OpenLoafSettingsField>
        </div>

        <div className="flex flex-wrap items-start gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">{t("project.parent")}</div>
            <div className="text-xs text-muted-foreground">
              {t("project.parentDescription")}
            </div>
          </div>

          <OpenLoafSettingsField className="gap-2">
            <button
              type="button"
              className={baseValueTruncateClass}
              onClick={async () => {
                const title = currentParent?.title ?? t("project.noParent");
                await copyToClipboard(title);
                toast.success(t("project.parentCopied"));
              }}
              title={currentParent?.title ?? t("project.noParent")}
            >
              {currentParent?.title ?? t("project.noParent")}
            </button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!projectId || selectableProjects.length === 0}
              onClick={handleOpenParentPicker}
            >
              {t("project.changeParent")}
            </Button>
            {currentParentId ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!projectId}
                onClick={handleMoveToRoot}
              >
                {t("project.moveToRoot")}
              </Button>
            ) : null}
          </OpenLoafSettingsField>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t("project.features")} cardProps={{ divided: true, padding: "x" }}>
        {FEATURE_OPTIONS.map((opt) => (
          <div key={opt.value} className="flex flex-wrap items-center gap-2 py-3">
            <div className="min-w-0 sm:w-56">
              <div className="text-sm font-medium">{t(opt.labelKey)}</div>
              <div className="text-xs text-muted-foreground">{t(opt.descKey)}</div>
            </div>

            <OpenLoafSettingsField>
              <Switch
                checked={enabledFeatures.has(opt.value)}
                onCheckedChange={(checked) =>
                  handleToggleFeature(opt.value, checked)
                }
                disabled={!projectId || setFeaturesMutation.isPending}
              />
            </OpenLoafSettingsField>
          </div>
        ))}
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t("project.storageManagement")} cardProps={{ divided: true, padding: "x" }}>
        <div className="flex flex-wrap items-start gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">{t("project.storagePath")}</div>
            <div className="text-xs text-muted-foreground">{t("project.projectRoot")}</div>
          </div>

          <OpenLoafSettingsField className="gap-2">
            <button
              type="button"
              className={baseValueWrapClass}
              disabled={!storagePath}
              onClick={async () => {
                if (!displayStoragePath || displayStoragePath === "-") return;
                await copyToClipboard(displayStoragePath);
                toast.success(t("project.storageCopied"));
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
              aria-label={t("project.editStorage")}
              title={t("project.editStorage")}
            >
              <FilePenLine className="size-4" />
            </Button>
          </OpenLoafSettingsField>
        </div>

        <div className="flex flex-wrap items-start gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">{t("project.cacheUsage")}</div>
            <div className="text-xs text-muted-foreground">
              {t("project.cacheDescription")}
            </div>
          </div>

          <OpenLoafSettingsField className="gap-2">
            <div className={baseValueTruncateClass}>
              {cacheSizeQuery.isFetching
                ? t("project.calculating")
                : formatSize(cacheSizeQuery.data?.bytes)}
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!canManageCache || clearProjectCache.isPending}
              onClick={() => setClearCacheOpen(true)}
            >
              {t("project.clearCache")}
            </Button>
          </OpenLoafSettingsField>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t("project.aiChat")} cardProps={{ divided: true, padding: "x" }}>
        <div className="flex flex-wrap items-start gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">{t("project.chatCount")}</div>
            <div className="text-xs text-muted-foreground">{t("project.chatIrreversible")}</div>
          </div>

          <OpenLoafSettingsField className="gap-2">
            <button
              type="button"
              className={baseValueTruncateClass}
              disabled={typeof chatSessionCount !== "number"}
              onClick={async () => {
                if (typeof chatSessionCount !== "number") return;
                await copyToClipboard(String(chatSessionCount));
                toast.success(t("project.chatCountCopied"));
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
                <span>{clearProjectChat.isPending ? t("project.clearing") : t("project.clear")}</span>
              </Button>
            ) : null}
          </OpenLoafSettingsField>
        </div>
      </OpenLoafSettingsGroup>

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          if (!open && renameBusy) return;
          setRenameOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("project.rename")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="project-title">
              {t("project.nameLabel")}
            </Label>
            <Input
              id="project-title"
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              className="shadow-none focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleRename();
                }
              }}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={renameBusy}>
                {t("common:cancel")}
              </Button>
            </DialogClose>
            <Button
              className="bg-foreground/10 text-foreground hover:bg-foreground/20 shadow-none"
              onClick={() => void handleRename()}
              disabled={renameBusy}
            >
              {renameBusy ? t("common:saving") : t("common:save")}
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
            <DialogTitle>{t("project.selectParentDialog")}</DialogTitle>
            <DialogDescription>{t("project.selectParentDescription")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[360px] overflow-y-auto rounded-3xl border border-border/60 bg-card/60 p-3">
            {selectableProjects.length === 0 ? (
              <div className="text-xs text-muted-foreground">{t("project.noParents")}</div>
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
                {t("common:cancel")}
              </Button>
            </DialogClose>
            <Button
              autoFocus
              type="button"
              onClick={handleSubmitParentSelection}
              disabled={!selectedParentId || selectedParentId === currentParentId}
            >
              {t("project.next")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingParentMove)}
        onOpenChange={(open) => {
          if (!open) setPendingParentMove(null);
        }}
        title={t("project.confirmMove")}
        description={
          pendingParentMove
            ? pendingParentMove.targetParentId
              ? t("project.moveToMessage", {
                  title: project?.title ?? t("project.moveCurrentProject"),
                  parent: resolveProjectTitle(pendingParentMove.targetParentId),
                })
              : t("project.moveToRootMessage", {
                  title: project?.title ?? t("project.moveCurrentProject"),
                })
            : ""
        }
        confirmLabel={t("project.confirmMove")}
        cancelLabel={t("common:cancel")}
        loadingLabel={t("project.movingButton")}
        loading={moveParentBusy}
        onConfirm={handleConfirmParentMove}
      >
        <div className="text-xs text-muted-foreground">
          {t("project.childrenMoveNote")}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(moveTargetParentPath)}
        onOpenChange={handleMoveDialogOpenChange}
        title={t("project.confirmMove")}
        description={t("project.moveDescription")}
        confirmLabel={t("project.confirmMove")}
        cancelLabel={t("common:cancel")}
        loadingLabel={t("project.movingButton")}
        loading={moveBusy}
        onConfirm={handleConfirmMove}
      >
        <div className="space-y-3 text-xs text-muted-foreground">
          <div className="space-y-1">
            <div>{t("project.currentPath")}</div>
            <div className="text-foreground break-all">{displayStoragePath}</div>
          </div>
          <div className="space-y-1">
            <div>{t("project.targetParent")}</div>
            <div className="text-foreground break-all">
              {moveTargetParentPath ?? "-"}
            </div>
          </div>
          <div className="space-y-1">
            <div>{t("project.movedPath")}</div>
            <div className="text-foreground break-all">
              {moveTargetPath || "-"}
            </div>
          </div>
        </div>
        {moveBusy ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{t("project.moving")}</div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${moveProgress}%` }}
              />
            </div>
          </div>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={clearCacheOpen}
        onOpenChange={setClearCacheOpen}
        title={t("project.confirmClearCache")}
        description={t("project.clearCacheDescription")}
        confirmLabel={t("project.confirmClear")}
        cancelLabel={t("common:cancel")}
        loadingLabel={t("project.clearCacheButton")}
        variant="destructive"
        onConfirm={handleClearProjectCache}
      />

      <ConfirmDialog
        open={clearChatOpen}
        onOpenChange={setClearChatOpen}
        title={t("project.confirmClear")}
        description={
          <>
            {t("project.clearChatDescription")}
            {typeof chatSessionCount === "number"
              ? t("project.chatSessionCountNote", { count: chatSessionCount })
              : ""}
          </>
        }
        confirmLabel={t("project.confirmClear")}
        cancelLabel={t("common:cancel")}
        loadingLabel={t("project.clearing")}
        variant="destructive"
        onConfirm={handleClearProjectChat}
      />
    </div>
  );
});

export { ProjectBasicSettings };
