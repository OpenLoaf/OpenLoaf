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
  Eye,
  FolderOpen,
  Globe,
  Import,
  Loader2,
  FolderCog,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { useProject } from "@/hooks/use-project";
import {
  buildFileUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";
import { toast } from "sonner";
import {
  resolveSkillFolderUri,
  resolveSkillUri,
  resolveSkillsRootUri,
} from "./skill-utils";
import { useGlobalOverlay } from "@/lib/globalShortcuts";

type SkillScope = "project" | "global";

type SkillSummary = {
  name: string;
  description: string;
  path: string;
  folderName: string;
  ignoreKey: string;
  scope: SkillScope;
  isEnabled: boolean;
  isDeletable: boolean;
  ownerProjectId?: string;
  ownerProjectTitle?: string;
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
};

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

  /** Group skills: global first, then each project separately. */
  const skillGroups = useMemo((): SkillGroup[] => {
    const globalSkills = filteredSkills.filter((s) => s.scope === "global");
    const projectSkills = filteredSkills.filter((s) => s.scope === "project");
    const groups: SkillGroup[] = [];

    // Global group
    if (globalSkills.length > 0) {
      groups.push({
        key: "global",
        label: t('skills.scopeGlobal'),
        icon: Globe,
        skills: globalSkills,
      });
    }

    // Group project skills by ownerProjectId
    if (projectSkills.length > 0) {
      if (isProjectList) {
        // In project page, show all project skills as one group
        groups.push({
          key: "project",
          label: t('skills.scopeProject'),
          icon: FolderCog,
          skills: projectSkills,
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
          groups.push({
            key: `project:${pid}`,
            label: title,
            icon: FolderCog,
            skills,
          });
        }
      }
    }

    return groups;
  }, [filteredSkills, isProjectList, t]);

  const skillsRootUri = useMemo(() => {
    const baseRootUri = isProjectList ? projectData?.project?.rootUri : globalSkillsRootUri;
    if (!baseRootUri) return "";
    if (baseRootUri.startsWith("file://")) {
      return isProjectList
        ? buildFileUriFromRoot(baseRootUri, ".agents/skills")
        : baseRootUri;
    }
    const normalizedRoot = baseRootUri.replace(/[/\\]+$/, "");
    if (!normalizedRoot) return "";
    return isProjectList ? `${normalizedRoot}/.agents/skills` : normalizedRoot;
  }, [globalSkillsRootUri, isProjectList, projectData?.project?.rootUri]);

  const mkdirMutation = useMutation(
    trpc.fs.mkdir.mutationOptions({ onError: (error) => { toast.error(error.message) } }),
  );

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
  const handleOpenSkillsRoot = useCallback(async () => {
    if (!skillsRootUri) return;
    if (isProjectList && !projectId) { toast.error(t('skills.projectNotFound')); return }
    try { await mkdirMutation.mutateAsync({ projectId: isProjectList ? projectId : undefined, uri: ".agents/skills", recursive: true }) } catch { return }
    const api = window.openloafElectron;
    if (!api?.openPath) { toast.error(t('skills.webNotSupported')); return }
    const res = await api.openPath({ uri: skillsRootUri });
    if (!res?.ok) toast.error(res?.reason ?? t('skills.openDirFailed'));
  }, [isProjectList, mkdirMutation, projectId, skillsRootUri, t]);

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

  const handleInsertSkillCommand = useCallback((skill: SkillSummary) => {
    const skillName = skill.name.trim();
    if (!skillName) return;
    window.dispatchEvent(new CustomEvent("openloaf:chat-insert-skill", { detail: { skillName } }));
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

  /** Render a single skill card. */
  const renderSkillCard = (skill: SkillSummary) => {
    const baseRootUri = skill.scope === "global" ? undefined : skill.scope === "project" ? projectData?.project?.rootUri : undefined;
    const canOpenSkill = Boolean(resolveSkillFolderUri(skill.path, baseRootUri));

    return (
      <ContextMenu key={skill.ignoreKey || skill.path || `${skill.scope}:${skill.name}`}>
        <ContextMenuTrigger asChild>
          <div
            className="group relative flex flex-col rounded-2xl border border-border/70 bg-background/50 p-3.5 transition-colors duration-200 hover:border-ol-green/50 dark:bg-background/30 cursor-pointer"
            onClick={() => { if (canOpenSkill) handleOpenSkill(skill) }}
          >
            {/* Header: name + switch */}
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{skill.name}</div>
              </div>
              <Switch
                checked={skill.isEnabled}
                onCheckedChange={(checked) => handleToggleSkill(skill, checked)}
                className="border-ol-divider bg-ol-surface-muted data-[state=checked]:bg-ol-green/60 dark:data-[state=checked]:bg-ol-green/45"
                aria-label={t('skills.enableSkillAriaLabel', { name: skill.name })}
                disabled={updateSkillMutation.isPending}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Description */}
            <p className="mt-1.5 min-w-0 flex-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {skill.description?.trim() ? skill.description : skill.name}
            </p>

            {/* Footer: folder name + use button */}
            <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
              <span className="truncate text-[11px] text-muted-foreground/60">{skill.folderName}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 flex-none rounded-lg opacity-0 transition-opacity group-hover:opacity-100 hover:bg-ol-green/10 text-ol-green"
                onClick={(e) => { e.stopPropagation(); handleInsertSkillCommand(skill) }}
                aria-label={t('skills.useSkillAriaLabel', { name: skill.name })}
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem icon={Eye} onClick={() => handleOpenSkill(skill)} disabled={!canOpenSkill}>
            {t('skills.viewSkillDir')}
          </ContextMenuItem>
          <ContextMenuItem icon={ArrowRight} onClick={() => handleInsertSkillCommand(skill)}>
            {t('skills.useSkill')}
          </ContextMenuItem>
          {skill.isDeletable ? (
            <ContextMenuItem icon={Trash2} variant="destructive" onClick={() => void handleDeleteSkill(skill)} disabled={deleteSkillMutation.isPending}>
              {t('skills.deleteSkill')}
            </ContextMenuItem>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const totalCount = filteredSkills.length;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={(e) => void handleDrop(e)}
    >
      {/* Drag overlay */}
      {isDragOver ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-ol-green bg-ol-green/5 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-ol-green">
            <Import className="h-8 w-8" />
            <p className="text-sm font-medium">{t('skills.import.dropHint')}</p>
            <p className="text-xs text-muted-foreground">{t('skills.import.dropSubHint')}</p>
          </div>
        </div>
      ) : null}
      {isImporting ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">{t('skills.import.importing')}</span>
          </div>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        {/* Search */}
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('skills.searchPlaceholder')}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-8 rounded-md border-transparent bg-muted/40 pl-8 pr-7 text-sm focus:border-border"
          />
          {searchQuery ? (
            <Button type="button" variant="ghost" size="icon" className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2 rounded-md" onClick={() => setSearchQuery("")} aria-label={t('skills.clearSearch')}>
              <X className="h-3.5 w-3.5" />
            </Button>
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
                "h-7 rounded-md px-2.5 text-xs",
                statusFilter === value && "bg-ol-green/10 text-ol-green hover:bg-ol-green/20",
              )}
              onClick={() => setStatusFilter(value)}
            >
              {value === "all" ? t('skills.statusAll') : value === "enabled" ? t('skills.statusEnabled') : t('skills.statusDisabled')}
            </Button>
          ))}
        </div>

        {/* Count */}
        <span className="text-xs text-muted-foreground/60 tabular-nums whitespace-nowrap">{totalCount}</span>

        {/* Open folder */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-md"
              onClick={() => void handleOpenSkillsRoot()}
              disabled={!skillsRootUri || (isProjectList && !projectId)}
              aria-label={t('skills.openDirAriaLabel')}
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>{t('skills.openDirTooltip')}</TooltipContent>
        </Tooltip>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {skillsQuery.isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[104px] animate-pulse rounded-2xl bg-muted/40" />
            ))}
          </div>
        ) : skillsQuery.isError ? (
          <div className="py-9 text-center text-sm text-destructive">
            {t('skills.readFailed', { error: skillsQuery.error?.message ?? t('skills.unknownError') })}
          </div>
        ) : skills.length === 0 ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            {t('skills.empty')}
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
                    <h3 className="text-xs font-medium text-muted-foreground/70">
                      {group.label}
                      <span className="ml-1.5 tabular-nums">({group.skills.length})</span>
                    </h3>
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
    </div>
  );
}
