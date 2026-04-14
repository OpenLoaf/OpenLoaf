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

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";
import { useLayoutState } from "@/hooks/use-layout-state";
import { Button } from "@openloaf/ui/button";
import { Switch } from "@openloaf/ui/switch";
import { Input } from "@openloaf/ui/input";
import {
  ArrowRight,
  Copy,
  Download,
  Eye,
  FolderOpen,
  Globe,
  Import,
  Languages,
  Loader2,
  FolderCog,
  MoveRight,
  RefreshCw,
  RotateCcw,
  Search,
  Store,
  Trash2,
  X,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { useProject } from "@/hooks/use-project";
import {
  buildFileUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";
import { toast } from "sonner";
import {
  exportSkillAsZip,
  resolveSkillFolderUri,
  resolveSkillUri,
  resolveSkillsRootUri,
} from "./skill-utils";
import { useGlobalOverlay } from "@/lib/globalShortcuts";
import { ColorPickerSubMenu } from "@/components/shared/ColorPickerSubMenu";
import { TranslateTitlesDialog } from "./TranslateTitlesDialog";
import { SkillUpdateBanner } from "./SkillUpdateBanner";
import { ExternalSkillsBanner, ExternalSkillsIconButton } from "./ExternalSkillsBanner";
import { ExternalSkillsImportDialog } from "./ExternalSkillsImportDialog";
import { useInstallMarketSkill, useSkillUpdateCheck } from "@/hooks/use-skill-market";

type SkillScope = "builtin" | "project" | "global";

type SkillSummary = {
  name: string;
  originalName: string;
  description: string;
  path: string;
  folderName: string;
  ignoreKey: string;
  scope: SkillScope;
  isEnabled: boolean;
  isDeletable: boolean;
  ownerProjectId?: string;
  ownerProjectTitle?: string;
  colorIndex?: number | null;
  hasMeta?: boolean;
  icon?: string;
};

type SkillsSettingsPanelProps = {
  projectId?: string;
};

type StatusFilter = "all" | "enabled" | "disabled";

/** Group of skills under a scope section. */
type SkillGroup = {
  key: string;
  label: string;
  icon: typeof Globe;
  skills: SkillSummary[];
  /** Skills root folder URI for this group (for "open folder" action). */
  folderUri?: string;
};

/** Deterministic pastel gradient for skill cards. */
const CARD_GRADIENTS = [
  "from-teal-100 to-cyan-50 dark:from-teal-900/40 dark:to-cyan-900/30",
  "from-violet-100 to-fuchsia-50 dark:from-violet-900/40 dark:to-fuchsia-900/30",
  "from-amber-100 to-orange-50 dark:from-amber-900/40 dark:to-orange-900/30",
  "from-sky-100 to-blue-50 dark:from-sky-900/40 dark:to-blue-900/30",
  "from-rose-100 to-pink-50 dark:from-rose-900/40 dark:to-pink-900/30",
  "from-emerald-100 to-green-50 dark:from-emerald-900/40 dark:to-green-900/30",
  "from-indigo-100 to-purple-50 dark:from-indigo-900/40 dark:to-purple-900/30",
  "from-lime-100 to-yellow-50 dark:from-lime-900/40 dark:to-yellow-900/30",
];

const ACCENT_BORDER_COLORS = [
  "border-l-teal-300 dark:border-l-teal-600",
  "border-l-violet-300 dark:border-l-violet-600",
  "border-l-amber-300 dark:border-l-amber-600",
  "border-l-sky-300 dark:border-l-sky-600",
  "border-l-rose-300 dark:border-l-rose-600",
  "border-l-emerald-300 dark:border-l-emerald-600",
  "border-l-indigo-300 dark:border-l-indigo-600",
  "border-l-lime-300 dark:border-l-lime-600",
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const EMPTY_SKILLS: SkillSummary[] = [];

/** Shared skills settings panel. */
export function SkillsSettingsPanel({ projectId }: SkillsSettingsPanelProps) {
  const { t } = useTranslation('settings');
  const isProjectList = Boolean(projectId);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const queryOptions = projectId
    ? trpc.settings.getSkills.queryOptions({ projectId })
    : trpc.settings.getSkills.queryOptions();
  const skillsQuery = useQuery(queryOptions);
  const skills = (skillsQuery.data ?? EMPTY_SKILLS) as SkillSummary[];
  const { data: projectData } = useProject(projectId);
  const pushStackItem = useLayoutState((state) => state.pushStackItem);
  const setSettingsOpen = useGlobalOverlay((s) => s.setSettingsOpen);
  const globalSkillsRootUri = useMemo(() => {
    const globalSkill = skills.find(
      (skill) => skill.scope === "global" && typeof skill.path === "string" && skill.path.trim(),
    );
    return globalSkill ? resolveSkillsRootUri(globalSkill.path) : "";
  }, [skills]);

  /** Filtered skills. */
  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = skill.name.toLowerCase().includes(query);
        const matchDesc = skill.description.toLowerCase().includes(query);
        if (!matchName && !matchDesc) return false;
      }
      if (statusFilter === "enabled" && !skill.isEnabled) return false;
      if (statusFilter === "disabled" && skill.isEnabled) return false;
      return true;
    });
  }, [skills, searchQuery, statusFilter]);

  /** Group skills: project first, then global. */
  const skillGroups = useMemo((): SkillGroup[] => {
    const globalSkills = filteredSkills.filter((s) => s.scope === "global");
    const projectSkills = filteredSkills.filter((s) => s.scope === "project");
    const groups: SkillGroup[] = [];

    // Group project skills by ownerProjectId
    if (projectSkills.length > 0) {
      if (isProjectList) {
        // In project page, show all project skills as one group
        const projectRootUri = projectData?.project?.rootUri;
        groups.push({
          key: "project",
          label: t('skills.scopeProject'),
          icon: FolderCog,
          skills: projectSkills,
          folderUri: projectRootUri ? buildFileUriFromRoot(projectRootUri, ".openloaf/skills") : undefined,
        });
      } else {
        // In global page, group by each project
        const byProject = new Map<string, SkillSummary[]>();
        const projectOrder: string[] = [];
        for (const skill of projectSkills) {
          const pid = skill.ownerProjectId || "_unknown";
          if (!byProject.has(pid)) {
            byProject.set(pid, []);
            projectOrder.push(pid);
          }
          byProject.get(pid)!.push(skill);
        }
        for (const pid of projectOrder) {
          const skills = byProject.get(pid)!;
          const title = skills[0]?.ownerProjectTitle || pid;
          // Derive folder URI from the first skill's path
          const firstSkillPath = skills[0]?.path;
          const groupFolderUri = firstSkillPath ? resolveSkillsRootUri(firstSkillPath) : undefined;
          groups.push({
            key: `project:${pid}`,
            label: title,
            icon: FolderCog,
            skills,
            folderUri: groupFolderUri,
          });
        }
      }
    }

    // Global group
    if (globalSkills.length > 0) {
      groups.push({
        key: "global",
        label: t('skills.scopeGlobal'),
        icon: Globe,
        skills: globalSkills,
        folderUri: globalSkillsRootUri || undefined,
      });
    }

    return groups;
  }, [filteredSkills, isProjectList, globalSkillsRootUri, projectData?.project?.rootUri, t]);

  const updateSkillMutation = useMutation(
    trpc.settings.setSkillEnabled.mutationOptions({
      onSuccess: () => { invalidateSkillQueries() },
      onError: (error) => { toast.error(error.message) },
    }),
  );
  const deleteSkillMutation = useMutation(
    trpc.settings.deleteSkill.mutationOptions({
      onSuccess: () => {
        invalidateSkillQueries();
        toast.success(t('skills.deletedSuccess'));
      },
      onError: (error) => { toast.error(error.message) },
    }),
  );
  const setSkillColorMutation = useMutation(
    trpc.settings.setSkillColor.mutationOptions({
      onSuccess: () => { invalidateSkillQueries() },
      onError: (error) => { toast.error(error.message) },
    }),
  );
  const resetSkillMutation = useMutation(
    trpc.settings.resetSkill.mutationOptions({
      onSuccess: () => {
        invalidateSkillQueries();
        toast.success(t('skills.resetSuccess', { defaultValue: '技能已初始化' }));
      },
      onError: (error) => { toast.error(error.message) },
    }),
  );
  const [translateDialogOpen, setTranslateDialogOpen] = useState(false);
  const [emptyImportDialogOpen, setEmptyImportDialogOpen] = useState(false);

  // --- Marketplace update banner ---
  const updateCheckQuery = useSkillUpdateCheck(projectId);
  const updatableSkills = useMemo(() =>
    (updateCheckQuery.data?.updates ?? [])
      .filter((u) => u.hasUpdate)
      .map((u) => {
        const local = skills.find(
          (s) => (s as any).marketplace?.skillId === u.skillId,
        )
        return {
          id: u.skillId,
          folderName: local?.folderName ?? u.skillId,
          name: local?.name ?? u.skillId,
          description: local?.description ?? '',
          tags: [] as string[],
          repoLabel: '',
          isOfficial: false,
          downloadCount: 0,
          rating: 0,
          ratingCount: 0,
          version: '',
          updatedAt: '',
          hasUpdate: true,
        }
      }),
  [updateCheckQuery.data?.updates, skills]);
  const installMarketSkill = useInstallMarketSkill();
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const handleUpdateOneMarket = (skillId: string) => {
    setUpdatingIds((prev) => new Set(prev).add(skillId));
    installMarketSkill.mutate(
      { skillId, scope: projectId ? 'project' : 'global', projectId },
      {
        onSettled: () => {
          setUpdatingIds((prev) => {
            const next = new Set(prev);
            next.delete(skillId);
            return next;
          });
        },
      },
    );
  };
  const handleUpdateAllMarket = async () => {
    setIsUpdatingAll(true);
    for (const skill of updatableSkills) {
      try {
        await installMarketSkill.mutateAsync({
          skillId: skill.id,
          scope: projectId ? 'project' : 'global',
          projectId,
        });
      } catch { /* continue */ }
    }
    setIsUpdatingAll(false);
  };

  // --- Transfer (copy/move) skill dialog ---
  const { data: projectList } = useQuery({
    ...trpc.project.listFlat.queryOptions(),
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferMode, setTransferMode] = useState<"copy" | "move">("copy");
  const [transferSkill, setTransferSkill] = useState<SkillSummary | null>(null);
  const [transferTargetId, setTransferTargetId] = useState<string>("__global__");
  const transferSkillMutation = useMutation(
    trpc.settings.transferSkill.mutationOptions({
      onError: (error) => { toast.error(error.message ?? t('skills.transfer.failed')) },
    }),
  );

  // --- Drag-and-drop ---
  const ARCHIVE_EXTENSIONS = useMemo(() => ['.zip', '.skill', '.tar', '.tar.gz', '.tgz'], []);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  const importSkillMutation = useMutation(
    trpc.settings.importSkill.mutationOptions({
      onSuccess: (data) => {
        if (data.ok) {
          toast.success(t('skills.import.success', { count: data.importedSkills.length, names: data.importedSkills.join(', ') }));
          invalidateSkillQueries();
        } else {
          toast.error(data.error ?? t('skills.import.failed'));
        }
      },
      onError: (error) => { toast.error(error.message ?? t('skills.import.failed')) },
    }),
  );
  const importArchiveMutation = useMutation(
    trpc.settings.importSkillFromArchive.mutationOptions({
      onSuccess: (data) => {
        if (data.ok) {
          toast.success(t('skills.import.success', { count: data.importedSkills.length, names: data.importedSkills.join(', ') }));
          invalidateSkillQueries();
        } else {
          toast.error(data.error ?? t('skills.import.failed'));
        }
      },
      onError: (error) => { toast.error(error.message ?? t('skills.import.failed')) },
    }),
  );
  const isImporting = importSkillMutation.isPending || importArchiveMutation.isPending;

  const invalidateSkillQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: trpc.settings.getSkills.queryOptions().queryKey });
    if (projectId) {
      queryClient.invalidateQueries({ queryKey: trpc.settings.getSkills.queryOptions({ projectId }).queryKey });
    }
    // Also invalidate external skills detection so the import dialog reflects current state
    queryClient.invalidateQueries({ queryKey: trpc.settings.detectExternalSkills.queryOptions({ projectId }).queryKey });
  }, [projectId]);

  const resolveFilePath = useCallback((file: File): string | null => {
    const candidate = (file as File & { path?: string }).path;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (window.openloafElectron?.getPathForFile) {
      try { const r = window.openloafElectron.getPathForFile(file); if (r) return String(r) } catch { /* */ }
    }
    return null;
  }, []);

  const isArchiveFile = useCallback((name: string) => {
    const lower = name.toLowerCase();
    return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }, [ARCHIVE_EXTENSIONS]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (dragCounter.current === 1) setIsDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragOver(false) }
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0; setIsDragOver(false);
    if (isImporting) return;
    const scope = isProjectList ? "project" as const : "global" as const;
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const isElectron = Boolean(window.openloafElectron?.getPathForFile);
    for (const file of files) {
      if (isElectron) {
        const localPath = resolveFilePath(file);
        if (localPath) { importSkillMutation.mutate({ sourcePath: localPath, scope, projectId: scope === "project" ? projectId : undefined }); continue }
      }
      if (isArchiveFile(file.name)) {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        importArchiveMutation.mutate({ contentBase64: base64, fileName: file.name, scope, projectId: scope === "project" ? projectId : undefined });
      } else {
        toast.error(t('skills.import.unsupportedFormat'));
      }
    }
  }, [isImporting, isProjectList, projectId, resolveFilePath, isArchiveFile, importSkillMutation, importArchiveMutation, t]);

  // --- Actions ---
  const handleOpenGroupFolder = useCallback(async (folderUri: string) => {
    const api = window.openloafElectron;
    if (!api?.openPath) { toast.error(t('skills.webNotSupported')); return }
    const res = await api.openPath({ uri: folderUri });
    if (!res?.ok) toast.error(res?.reason ?? t('skills.openDirFailed'));
  }, [t]);

  const handleOpenSkill = useCallback((skill: SkillSummary) => {
    const isProjectSkill = skill.scope === "project";
    const isGlobalSkill = skill.scope === "global";
    const baseRootUri = isGlobalSkill ? undefined : isProjectSkill ? projectData?.project?.rootUri : undefined;
    const rootUri = resolveSkillFolderUri(skill.path, baseRootUri);
    if (!rootUri) return;
    const currentUri = resolveSkillUri(skill.path, rootUri);
    const stackKey = skill.ignoreKey.trim() || skill.path || skill.name;
    const titlePrefix = isGlobalSkill ? t('skills.scopeGlobal') : t('skills.scopeProject');
    pushStackItem({
      id: `skill:${skill.scope}:${stackKey}`,
      sourceKey: `skill:${skill.scope}:${stackKey}`,
      component: "folder-tree-preview",
      title: `${titlePrefix} · ${skill.name}`,
      params: { rootUri, currentUri, currentEntryKind: "file", projectId: isProjectSkill ? projectId : undefined, projectTitle: skill.name, viewerRootUri: baseRootUri, __skillFolderPath: skill.path.replace(/[/\\]SKILL\.md$/i, '') },
    });
    setSettingsOpen(false);
  }, [projectData?.project?.rootUri, projectId, pushStackItem, setSettingsOpen, t]);

  const handleToggleSkill = useCallback((skill: SkillSummary, nextEnabled: boolean) => {
    if (!skill.ignoreKey.trim()) return;
    const scope = isProjectList ? "project" : "global";
    updateSkillMutation.mutate({ scope, projectId: scope === "project" ? projectId : undefined, ignoreKey: skill.ignoreKey, enabled: nextEnabled });
  }, [isProjectList, projectId, updateSkillMutation]);

  const handleChangeSkillColor = useCallback((skill: SkillSummary, colorIndex: number | null) => {
    const skillFolderPath = skill.path.replace(/[/\\]SKILL\.md$/i, '');
    setSkillColorMutation.mutate({ skillFolderPath, colorIndex });
  }, [setSkillColorMutation]);

  const handleInsertSkillCommand = useCallback((skill: SkillSummary) => {
    const skillName = skill.originalName.trim();
    if (!skillName) return;
    const displayName = skill.name !== skill.originalName ? skill.name : undefined;
    window.dispatchEvent(new CustomEvent("openloaf:chat-insert-skill", { detail: { skillName, displayName } }));
    window.dispatchEvent(new CustomEvent("openloaf:chat-focus-input"));
    useLayoutState.getState().setRightChatCollapsed(false);
  }, []);

  const handleDeleteSkill = useCallback(async (skill: SkillSummary) => {
    if (!skill.isDeletable || !skill.ignoreKey.trim()) return;
    const confirmed = window.confirm(t('skills.confirmDelete', { name: skill.name }));
    if (!confirmed) return;
    const scope = skill.scope === "global" ? "global" : "project";
    await deleteSkillMutation.mutateAsync({ scope, projectId: scope === "project" ? projectId : undefined, ignoreKey: skill.ignoreKey, skillPath: skill.path });
  }, [deleteSkillMutation, projectId, t]);

  const handleExportSkill = useCallback(async (skill: SkillSummary) => {
    const skillFolderPath = skill.path.replace(/[/\\]SKILL\.md$/i, '');
    try {
      const ok = await exportSkillAsZip(skillFolderPath);
      if (!ok) toast.error(t('skills.export.failed', { defaultValue: '导出失败' }));
    } catch (err: any) {
      toast.error(err?.message ?? t('skills.export.failed', { defaultValue: '导出失败' }));
    }
  }, [t]);

  const handleOpenTransferDialog = useCallback((skill: SkillSummary, mode: "copy" | "move") => {
    setTransferSkill(skill);
    setTransferMode(mode);
    setTransferTargetId("__global__");
    setTransferDialogOpen(true);
  }, []);

  const handleTransferConfirm = useCallback(async () => {
    if (!transferSkill) return;
    const skillFolderPath = transferSkill.path.replace(/[/\\]SKILL\.md$/i, '');
    const data = await transferSkillMutation.mutateAsync({
      skillFolderPath,
      mode: transferMode,
      targetScope: transferTargetId === "__global__" ? "global" : "project",
      targetProjectId: transferTargetId === "__global__" ? undefined : transferTargetId,
    });
    if (!data.ok) {
      toast.error(data.error ?? t('skills.transfer.failed'));
      throw new Error(data.error ?? 'transfer-failed');
    }
    const label = transferMode === "copy" ? t('skills.transfer.copied') : t('skills.transfer.moved');
    toast.success(`${label}：${data.folderName}`);
    invalidateSkillQueries();
  }, [transferSkill, transferMode, transferTargetId, transferSkillMutation, t, invalidateSkillQueries]);

  const handleResetSkill = useCallback(async (skill: SkillSummary) => {
    const confirmed = window.confirm(t('skills.confirmReset', { name: skill.name, defaultValue: `确定要初始化「${skill.name}」吗？\n\n将删除 openloaf.json 和翻译文件，技能原始内容不受影响。` }));
    if (!confirmed) return;
    const skillFolderPath = skill.path.replace(/[/\\]SKILL\.md$/i, '');
    await resetSkillMutation.mutateAsync({ skillFolderPath });
  }, [resetSkillMutation, t]);

  /** Render a single skill card. */
  const renderSkillCard = (skill: SkillSummary) => {
    const baseRootUri = skill.scope === "global" ? undefined : skill.scope === "project" ? projectData?.project?.rootUri : undefined;
    const canOpenSkill = Boolean(resolveSkillFolderUri(skill.path, baseRootUri));
    const colorIdx = skill.colorIndex != null
      ? skill.colorIndex % CARD_GRADIENTS.length
      : hashCode(skill.ignoreKey || skill.path || skill.name) % CARD_GRADIENTS.length;

    return (
      <ContextMenu key={skill.ignoreKey || skill.path || `${skill.scope}:${skill.name}`}>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "group relative flex flex-col overflow-hidden rounded-3xl border-l-[3px] border border-border/70 shadow-none transition-all duration-200 hover:shadow-none hover:border-foreground/40 cursor-pointer",
              ACCENT_BORDER_COLORS[colorIdx],
            )}
            onClick={() => { if (canOpenSkill) handleOpenSkill(skill) }}
          >
            {/* Gradient header strip */}
            <div className={cn("px-3.5 pt-3 pb-2 bg-gradient-to-r", CARD_GRADIENTS[colorIdx])}>
              {/* Header: name + switch */}
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                    {skill.icon ? <span className="text-sm leading-none shrink-0">{skill.icon}</span> : null}
                    <span className="truncate">{skill.name}</span>
                  </div>
                </div>
                <Switch
                  checked={skill.isEnabled}
                  onCheckedChange={(checked) => handleToggleSkill(skill, checked)}
                  className="border-border bg-secondary data-[state=checked]:bg-foreground dark:data-[state=checked]:bg-foreground"
                  aria-label={t('skills.enableSkillAriaLabel', { name: skill.name })}
                  disabled={updateSkillMutation.isPending}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            {/* Body */}
            <div className="flex flex-1 flex-col px-3.5 pb-3 pt-1.5 bg-background/50 dark:bg-background/30">
              {/* Description */}
              <p className="min-w-0 flex-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {skill.description?.trim() ? skill.description : skill.name}
              </p>

              {/* Footer: folder name + use button */}
              <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-[11px] text-muted-foreground/60">{skill.folderName}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 flex-none rounded-3xl opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent text-foreground"
                  onClick={(e) => { e.stopPropagation(); handleInsertSkillCommand(skill) }}
                  aria-label={t('skills.useSkillAriaLabel', { name: skill.name })}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem icon={Eye} onClick={() => handleOpenSkill(skill)} disabled={!canOpenSkill}>
            {t('skills.viewSkillDir')}
          </ContextMenuItem>
          <ContextMenuItem icon={ArrowRight} onClick={() => handleInsertSkillCommand(skill)}>
            {t('skills.useSkill')}
          </ContextMenuItem>
          <ContextMenuItem icon={Download} onClick={() => void handleExportSkill(skill)}>
            {t('skills.exportSkill', { defaultValue: '导出' })}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem icon={Copy} onClick={() => handleOpenTransferDialog(skill, "copy")}>
            {t('skills.transfer.copyTo', { defaultValue: '复制到其他项目' })}
          </ContextMenuItem>
          <ContextMenuItem icon={MoveRight} onClick={() => handleOpenTransferDialog(skill, "move")}>
            {t('skills.transfer.moveTo', { defaultValue: '移动到其他项目' })}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ColorPickerSubMenu
            currentIndex={skill.colorIndex}
            onSelect={(ci) => handleChangeSkillColor(skill, ci)}
            label={t('skills.changeColor', { defaultValue: '更改颜色' })}
          />
          <ContextMenuItem icon={RotateCcw} onClick={() => void handleResetSkill(skill)} disabled={resetSkillMutation.isPending}>
            {t('skills.resetSkill', { defaultValue: '初始化' })}
          </ContextMenuItem>
          {skill.isDeletable ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem icon={Trash2} variant="destructive" onClick={() => void handleDeleteSkill(skill)} disabled={deleteSkillMutation.isPending}>
                {t('skills.deleteSkill')}
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const totalCount = filteredSkills.length;

  const openMarketplace = useCallback(() => {
    pushStackItem({
      id: 'skill-marketplace',
      sourceKey: 'skill-marketplace',
      component: 'skill-marketplace',
      title: t('skills.marketplace.tabMarketplace', { defaultValue: 'Marketplace' }),
      params: { projectId },
    })
    setSettingsOpen(false)
  }, [pushStackItem, setSettingsOpen, t, projectId])

  return (
    <div className="flex h-full min-h-0 flex-col">
        <div
          className="relative flex h-full min-h-0 flex-col"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={(e) => void handleDrop(e)}
        >
          {/* Drag overlay */}
          {isDragOver ? (
            <div className="absolute inset-0 z-50 flex items-center justify-center rounded-3xl border-2 border-dashed border-foreground bg-secondary/50 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2 text-foreground">
                <Import className="h-8 w-8" />
                <p className="text-sm font-medium">{t('skills.import.dropHint')}</p>
                <p className="text-xs text-muted-foreground">{t('skills.import.dropSubHint')}</p>
              </div>
            </div>
          ) : null}
          {isImporting ? (
            <div className="absolute inset-0 z-50 flex items-center justify-center rounded-3xl bg-background/60 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">{t('skills.import.importing')}</span>
              </div>
            </div>
          ) : null}

          {/* Update banner */}
          <SkillUpdateBanner
            updatableSkills={updatableSkills}
            onUpdateOne={handleUpdateOneMarket}
            onUpdateAll={() => void handleUpdateAllMarket()}
            updatingIds={updatingIds}
            isUpdatingAll={isUpdatingAll}
          />

          {/* Header */}
          <div className="border-b">
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex min-w-0 items-center gap-3">
                {/* Search */}
                <div className="relative max-w-52">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                  <Input
                    type="text"
                    placeholder={t('skills.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="h-8 rounded-3xl border-transparent bg-muted/40 pl-8 pr-7 text-sm focus:border-border"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>

                {/* Status filter pills */}
                <div className="flex items-center gap-1">
                  {(["all", "enabled", "disabled"] as StatusFilter[]).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={statusFilter === value ? "secondary" : "ghost"}
                      className={cn(
                        "h-7 rounded-3xl px-2.5 text-xs",
                        statusFilter === value && "bg-secondary text-foreground hover:bg-accent",
                      )}
                      onClick={() => setStatusFilter(value)}
                    >
                      {value === "all" ? t('skills.statusAll') : value === "enabled" ? t('skills.statusEnabled') : t('skills.statusDisabled')}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Right side */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t('skills.totalCount', { count: totalCount, defaultValue: `${totalCount} 个技能` })}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-3xl text-muted-foreground hover:text-foreground"
                      onClick={() => invalidateSkillQueries()}
                      disabled={skillsQuery.isLoading}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", skillsQuery.isFetching && "animate-spin")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('skills.refresh', { defaultValue: '刷新' })}</TooltipContent>
                </Tooltip>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-3xl bg-secondary text-secondary-foreground hover:bg-accent"
                  onClick={() => setTranslateDialogOpen(true)}
                  disabled={skills.length === 0}
                >
                  <Languages className="mr-1.5 h-4 w-4" />
                  {t('skills.translateTitles.button', { defaultValue: '翻译标题' })}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-3xl bg-secondary text-secondary-foreground hover:bg-accent"
                  onClick={openMarketplace}
                >
                  <Store className="mr-1.5 h-3.5 w-3.5" />
                  {t('skills.marketplace.tabMarketplace', { defaultValue: 'Marketplace' })}
                </Button>
                <ExternalSkillsIconButton projectId={projectId} />
              </div>
            </div>

            {/* External skills detection banner */}
            <ExternalSkillsBanner projectId={projectId} />
          </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {skillsQuery.isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[104px] animate-pulse rounded-3xl bg-muted/40" />
            ))}
          </div>
        ) : skillsQuery.isError ? (
          <div className="py-9 text-center text-sm text-destructive">
            {t('skills.readFailed', { error: skillsQuery.error?.message ?? t('skills.unknownError') })}
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-6 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/60">
              <FolderCog className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <div className="space-y-1.5 text-center">
              <p className="text-sm font-medium text-foreground">{t('skills.emptyTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('skills.emptyDesc')}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={openMarketplace}
              >
                <Store className="mr-1.5 h-3.5 w-3.5" />
                {t('skills.emptyMarketplace')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setEmptyImportDialogOpen(true)}
              >
                <Import className="mr-1.5 h-3.5 w-3.5" />
                {t('skills.emptyImport')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/60">{t('skills.emptyDragHint')}</p>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            {t('skills.noMatch')}
          </div>
        ) : skillGroups.length > 0 ? (
          <div className="space-y-6">
            {skillGroups.map((group) => (
              <div key={group.key}>
                {skillGroups.length > 1 ? (
                  <div className="mb-3 flex items-center gap-1.5 px-1">
                    <group.icon className="h-3.5 w-3.5 text-muted-foreground/50" />
                    <h3 className="flex-1 text-xs font-medium text-muted-foreground/70">
                      {group.label}
                      <span className="ml-1.5 tabular-nums">({group.skills.length})</span>
                    </h3>
                    {group.folderUri ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 rounded-3xl text-muted-foreground/50 hover:text-muted-foreground"
                            onClick={() => void handleOpenGroupFolder(group.folderUri!)}
                            aria-label={t('skills.openDirAriaLabel')}
                          >
                            <FolderOpen className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={4}>{t('skills.openDirTooltip')}</TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                ) : null}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3.5">
                  {group.skills.map(renderSkillCard)}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <TranslateTitlesDialog
        open={translateDialogOpen}
        onOpenChange={setTranslateDialogOpen}
        skills={skills.filter((s) => !s.hasMeta)}
        allSkills={skills}
        invalidateSkillQueries={invalidateSkillQueries}
      />
      <ExternalSkillsImportDialog
        open={emptyImportDialogOpen}
        onOpenChangeAction={setEmptyImportDialogOpen}
        projectId={projectId}
      />

      {/* Transfer (copy/move) skill dialog */}
      <ConfirmDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        contentClassName="sm:max-w-md"
        title={
          transferMode === "copy"
            ? t('skills.transfer.copyTitle', { defaultValue: '复制技能' })
            : t('skills.transfer.moveTitle', { defaultValue: '移动技能' })
        }
        description={
          transferMode === "copy"
            ? t('skills.transfer.copyDesc', { name: transferSkill?.name, defaultValue: `将「${transferSkill?.name}」复制到目标位置` })
            : t('skills.transfer.moveDesc', { name: transferSkill?.name, defaultValue: `将「${transferSkill?.name}」移动到目标位置` })
        }
        confirmLabel={
          transferMode === "copy"
            ? t('skills.transfer.confirmCopy', { defaultValue: '复制' })
            : t('skills.transfer.confirmMove', { defaultValue: '移动' })
        }
        cancelLabel={t('skills.transfer.cancel', { defaultValue: '取消' })}
        loadingLabel={t('skills.transfer.processing', { defaultValue: '处理中...' })}
        onConfirm={handleTransferConfirm}
      >
        <div className="space-y-2">
          <Select value={transferTargetId} onValueChange={setTransferTargetId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__global__">
                <span className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('skills.scopeGlobal')}
                </span>
              </SelectItem>
              {projectList?.map((p) => (
                <SelectItem key={p.projectId} value={p.projectId}>
                  {p.icon ? `${p.icon} ` : ""}{p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </ConfirmDialog>
        </div>
    </div>
  );
}
