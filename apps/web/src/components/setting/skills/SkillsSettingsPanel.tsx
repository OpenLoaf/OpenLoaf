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

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";
import { useLayoutState } from "@/hooks/use-layout-state";
import { Button } from "@openloaf/ui/button";
import { Switch } from "@openloaf/ui/switch";
import { Input } from "@openloaf/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@openloaf/ui/tabs";
import { ArrowRight, Eye, FolderOpen, Search, Trash2, X } from "lucide-react";
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
  buildUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";
import { toast } from "sonner";
import { useGlobalOverlay } from "@/lib/globalShortcuts";

type SkillScope = "project" | "global";

type SkillSummary = {
  /** Skill name. */
  name: string;
  /** Skill description. */
  description: string;
  /** Absolute skill file path. */
  path: string;
  /** Skill folder name. */
  folderName: string;
  /** Ignore key for toggling. */
  ignoreKey: string;
  /** Skill scope. */
  scope: SkillScope;
  /** Whether the skill is enabled in current scope. */
  isEnabled: boolean;
  /** Whether the skill can be deleted in current list. */
  isDeletable: boolean;
};

type SkillsSettingsPanelProps = {
  /** Project id for loading project-scoped skills. */
  projectId?: string;
};

/** Filter option for skill scope. */
type ScopeFilter = "all" | SkillScope;

/** Filter option for skill enabled status. */
type StatusFilter = "all" | "enabled" | "disabled";

/** Card styles per scope. */
const SCOPE_CARD_CLASS: Record<SkillScope, string> = {
  project:
    "bg-ol-blue-bg hover:bg-ol-blue-bg-hover",
  global:
    "bg-ol-surface-muted hover:bg-ol-divider",
};

/** Normalize a local path string for URI building. */
function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

/** Convert a local path into file:// uri. */
function toFileUri(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("file://")) return trimmed;
  const normalized = normalizePath(trimmed);
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`;
  }
  if (normalized.startsWith("/")) {
    return `file://${encodeURI(normalized)}`;
  }
  return `file:///${encodeURI(normalized)}`;
}

/** Resolve the skill folder uri from a skill file path. */
function resolveSkillFolderUri(
  skillPath: string,
  baseRootUri?: string,
): string | undefined {
  if (!skillPath) return undefined;
  if (skillPath.startsWith("file://")) {
    try {
      const url = new URL(skillPath);
      const filePath = decodeURIComponent(url.pathname);
      const dirPath = normalizePath(filePath).replace(/\/[^/]*$/, "");
      return dirPath ? toFileUri(dirPath) : skillPath;
    } catch {
      return skillPath;
    }
  }
  const normalizedSkillPath = normalizePath(skillPath).replace(/\/+$/, "");
  const lastSlashIndex = normalizedSkillPath.lastIndexOf("/");
  const directoryPath =
    lastSlashIndex >= 0 ? normalizedSkillPath.slice(0, lastSlashIndex) : "";
  const isAbsolutePath =
    normalizedSkillPath.startsWith("/") || /^[A-Za-z]:\//.test(normalizedSkillPath);
  if (!directoryPath) {
    return baseRootUri ?? toFileUri(normalizedSkillPath);
  }
  if (baseRootUri) {
    try {
      const rootUrl = new URL(baseRootUri);
      const rootPath = normalizePath(decodeURIComponent(rootUrl.pathname)).replace(/\/$/, "");
      // 技能路径落在 root 之下时，优先转换为相对路径拼接。
      if (directoryPath.startsWith(rootPath)) {
        const relative = directoryPath.slice(rootPath.length).replace(/^\/+/, "");
        return relative ? buildUriFromRoot(baseRootUri, relative) : baseRootUri;
      }
    } catch {
      // ignore and fallback to file uri
    }
  }
  if (!isAbsolutePath && baseRootUri) {
    return buildUriFromRoot(baseRootUri, directoryPath.replace(/^\/+/, ""));
  }
  return toFileUri(directoryPath);
}

function resolveSkillsRootUri(skillPath: string): string | undefined {
  if (!skillPath) return undefined;
  const normalizedPath = normalizePath(skillPath).replace(/\/+$/, "");
  const lastSlashIndex = normalizedPath.lastIndexOf("/");
  if (lastSlashIndex < 0) return undefined;
  const skillDirPath = normalizedPath.slice(0, lastSlashIndex);
  const parentSlashIndex = skillDirPath.lastIndexOf("/");
  if (parentSlashIndex < 0) return undefined;
  return toFileUri(skillDirPath.slice(0, parentSlashIndex));
}

/** Resolve skill file uri for preview. */
function resolveSkillUri(skillPath: string, rootUri?: string): string | undefined {
  if (!skillPath) return undefined;
  if (skillPath.startsWith("file://")) return skillPath;
  if (!rootUri) return toFileUri(skillPath);
  try {
    const rootUrl = new URL(rootUri);
    const rootPath = normalizePath(decodeURIComponent(rootUrl.pathname)).replace(/\/$/, "");
    const normalizedSkillPath = normalizePath(skillPath);
    if (normalizedSkillPath.startsWith(rootPath)) {
      // 优先使用 rootUri + 相对路径拼接，保持 URI 编码一致。
      const relative = normalizedSkillPath.slice(rootPath.length).replace(/^\/+/, "");
      if (!relative) return rootUri;
      // file:// URI 需要用 buildFileUriFromRoot 拼接完整 URI，
      // 否则 buildUriFromRoot 只返回裸相对路径，导致服务端解析到全局根目录。
      if (rootUri.startsWith("file://")) {
        return buildFileUriFromRoot(rootUri, relative);
      }
      return buildUriFromRoot(rootUri, relative);
    }
  } catch {
    return toFileUri(skillPath);
  }
  return toFileUri(skillPath);
}

/** Shared skills settings panel. */
export function SkillsSettingsPanel({ projectId }: SkillsSettingsPanelProps) {
  const { t } = useTranslation('settings');
  const isProjectList = Boolean(projectId);
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const queryOptions = projectId
    ? trpc.settings.getSkills.queryOptions({ projectId })
    : trpc.settings.getSkills.queryOptions();
  const skillsQuery = useQuery(queryOptions);
  const skills = (skillsQuery.data ?? []) as SkillSummary[];
  const { data: projectData } = useProject(projectId);
  const pushStackItem = useLayoutState((state) => state.pushStackItem);
  const setSettingsOpen = useGlobalOverlay((s) => s.setSettingsOpen);
  const globalSkillsRootUri = useMemo(() => {
    const globalSkill = skills.find(
      (skill) => skill.scope === "global" && typeof skill.path === "string" && skill.path.trim(),
    );
    return globalSkill ? resolveSkillsRootUri(globalSkill.path) : "";
  }, [skills]);

  /** Filtered skills based on search query and filters. */
  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      // 搜索过滤：匹配名称或描述
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = skill.name.toLowerCase().includes(query);
        const matchDesc = skill.description.toLowerCase().includes(query);
        if (!matchName && !matchDesc) return false;
      }
      // 作用域过滤
      if (scopeFilter !== "all" && skill.scope !== scopeFilter) return false;
      // 启用状态过滤
      if (statusFilter === "enabled" && !skill.isEnabled) return false;
      if (statusFilter === "disabled" && skill.isEnabled) return false;
      return true;
    });
  }, [skills, searchQuery, scopeFilter, statusFilter]);

  /** Text for current skill list source. */
  const scopeHintText = isProjectList ? t('skills.scopeHintProject') : t('skills.scopeHintGlobal');

  /** Skills root uri for system file manager open. */
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
    trpc.fs.mkdir.mutationOptions({
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const updateSkillMutation = useMutation(
    trpc.settings.setSkillEnabled.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getSkills.queryOptions().queryKey,
        });
        if (projectId) {
          queryClient.invalidateQueries({
            queryKey: trpc.settings.getSkills.queryOptions({ projectId }).queryKey,
          });
        }
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );
  const deleteSkillMutation = useMutation(
    trpc.settings.deleteSkill.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getSkills.queryOptions().queryKey,
        });
        if (projectId) {
          queryClient.invalidateQueries({
            queryKey: trpc.settings.getSkills.queryOptions({ projectId }).queryKey,
          });
        }
        toast.success(t('skills.deletedSuccess'));
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  /** Open skills folder in system file manager. */
  const handleOpenSkillsRoot = useCallback(async () => {
    if (!skillsRootUri) return;
    if (isProjectList && !projectId) {
      toast.error(t('skills.projectNotFound'));
      return;
    }
    try {
      await mkdirMutation.mutateAsync({
        projectId: isProjectList ? projectId : undefined,
        uri: ".agents/skills",
        recursive: true,
      });
    } catch {
      return;
    }
    const api = window.openloafElectron;
    if (!api?.openPath) {
      toast.error(t('skills.webNotSupported'));
      return;
    }
    const res = await api.openPath({ uri: skillsRootUri });
    if (!res?.ok) {
      toast.error(res?.reason ?? t('skills.openDirFailed'));
    }
  }, [isProjectList, mkdirMutation, projectId, skillsRootUri, t]);

  /** Open a skill folder tree in stack. */
  const handleOpenSkill = useCallback(
    (skill: SkillSummary) => {
      const isProjectSkill = skill.scope === "project";
      const isGlobalSkill = skill.scope === "global";
      // 全局技能路径为绝对路径，不依赖全局或项目 rootUri。
      const baseRootUri = isGlobalSkill
        ? undefined
        : isProjectSkill
          ? projectData?.project?.rootUri
          : undefined;
      const rootUri = resolveSkillFolderUri(skill.path, baseRootUri);
      if (!rootUri) return;
      const currentUri = resolveSkillUri(skill.path, rootUri);
      const stackKey = skill.ignoreKey.trim() || skill.path || skill.name;
      const titlePrefix = isGlobalSkill
        ? t('skills.scopeGlobal')
        : t('skills.scopeProject');
      // 打开左侧 stack 的文件系统预览，根目录固定为技能所在目录。
      pushStackItem({
        id: `skill:${skill.scope}:${stackKey}`,
        sourceKey: `skill:${skill.scope}:${stackKey}`,
        component: "folder-tree-preview",
        title: `${titlePrefix} · ${skill.name}`,
        params: {
          rootUri,
          currentUri,
          currentEntryKind: "file",
          projectId: isProjectSkill ? projectId : undefined,
          projectTitle: skill.name,
          viewerRootUri: baseRootUri,
        },
      });
      // 关闭设置对话框，避免对话框遮挡 stack 预览面板。
      setSettingsOpen(false);
    },
    [
      projectData?.project?.rootUri,
      projectId,
      pushStackItem,
      setSettingsOpen,
    ],
  );

  /** Toggle skill enable state for current scope. */
  const handleToggleSkill = useCallback(
    (skill: SkillSummary, nextEnabled: boolean) => {
      if (!skill.ignoreKey.trim()) return;
      const scope = isProjectList ? "project" : "global";
      updateSkillMutation.mutate({
        scope,
        projectId: scope === "project" ? projectId : undefined,
        ignoreKey: skill.ignoreKey,
        enabled: nextEnabled,
      });
    },
    [isProjectList, projectId, updateSkillMutation],
  );

  /** Insert skill command into chat input. */
  const handleInsertSkillCommand = useCallback(
    (skill: SkillSummary) => {
      const skillName = skill.name.trim();
      if (!skillName) return;
      window.dispatchEvent(
        new CustomEvent("openloaf:chat-insert-skill", {
          detail: { skillName },
        })
      );
      window.dispatchEvent(new CustomEvent("openloaf:chat-focus-input"));
      useLayoutState.getState().setRightChatCollapsed(false);
    },
    [],
  );

  /** Delete a skill folder with confirmation. */
  const handleDeleteSkill = useCallback(
    async (skill: SkillSummary) => {
      if (!skill.isDeletable || !skill.ignoreKey.trim()) return;
      const confirmed = window.confirm(t('skills.confirmDelete', { name: skill.name }));
      if (!confirmed) return;
      const scope = isProjectList ? "project" : "global";
      await deleteSkillMutation.mutateAsync({
        scope,
        projectId: scope === "project" ? projectId : undefined,
        ignoreKey: skill.ignoreKey,
        skillPath: skill.path,
      });
    },
    [deleteSkillMutation, isProjectList, projectId],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2.5 border-b border-border/60 px-3 py-2.5">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{t('skills.title')}</h3>
          <p className="text-xs text-muted-foreground">
            {scopeHintText}。{t('skills.subtitle')}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 rounded-full border border-border/70 bg-background/85 px-2.5 text-xs transition-colors hover:bg-muted/55 sm:px-3"
              onClick={() => void handleOpenSkillsRoot()}
              disabled={!skillsRootUri || (isProjectList && !projectId)}
              aria-label={t('skills.openDirAriaLabel')}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="ml-1.5 hidden sm:inline">{t('skills.openDirButton')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {t('skills.openDirTooltip')}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="border-b border-border/60 px-3 py-2.5">
        <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-center">
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('skills.searchPlaceholder')}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-9 rounded-xl border-border/70 bg-background/90 pl-9 pr-9 text-sm"
            />
            {searchQuery ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full"
                onClick={() => setSearchQuery("")}
                aria-label={t('skills.clearSearch')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
              ) : null}
          </div>
          <div className="min-w-0 overflow-x-auto pb-0.5">
            <Tabs value={scopeFilter} onValueChange={(value) => setScopeFilter(value as ScopeFilter)}>
              <TabsList className="h-8 w-max rounded-full border border-border/70 bg-muted/40 p-1">
                <TabsTrigger value="all" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                  {t('skills.filterAll')}
                </TabsTrigger>
                {isProjectList ? (
                  <TabsTrigger value="project" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                    {t('skills.filterProject')}
                  </TabsTrigger>
                ) : null}
                <TabsTrigger value="global" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                  {t('skills.filterGlobal')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="min-w-0 overflow-x-auto pb-0.5">
            <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <TabsList className="h-8 w-max rounded-full border border-border/70 bg-muted/40 p-1">
                <TabsTrigger value="all" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                  {t('skills.statusAll')}
                </TabsTrigger>
                <TabsTrigger value="enabled" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                  {t('skills.statusEnabled')}
                </TabsTrigger>
                <TabsTrigger value="disabled" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                  {t('skills.statusDisabled')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {filteredSkills.length > 0 ? (
          <div className="grid gap-3 pb-1 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
            {filteredSkills.map((skill) => {
              const baseRootUri =
                skill.scope === "global"
                  ? undefined
                  : skill.scope === "project"
                    ? projectData?.project?.rootUri
                    : undefined;
              const canOpenSkill = Boolean(
                resolveSkillFolderUri(skill.path, baseRootUri),
              );

              return (
                <ContextMenu key={skill.ignoreKey || skill.path || `${skill.scope}:${skill.name}`}>
                  <ContextMenuTrigger asChild>
                    <div
                      className={cn(
                        "group flex h-full flex-col rounded-[22px] p-3.5 transition-[background-color] duration-200 sm:rounded-[26px] sm:p-4",
                        SCOPE_CARD_CLASS[skill.scope],
                      )}
                      onDoubleClick={() => {
                        if (!canOpenSkill) return;
                        handleOpenSkill(skill);
                      }}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{skill.name}</div>
                        </div>
                        <Switch
                          checked={skill.isEnabled}
                          onCheckedChange={(checked) => handleToggleSkill(skill, checked)}
                          className="border-ol-divider bg-ol-surface-muted data-[state=checked]:bg-ol-green/60 dark:data-[state=checked]:bg-ol-green/45"
                          aria-label={t('skills.enableSkillAriaLabel', { name: skill.name })}
                          disabled={updateSkillMutation.isPending}
                        />
                      </div>
                      <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
                        <p className="min-w-0 flex-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {skill.description?.trim() ? skill.description : skill.name}
                        </p>
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="h-8 w-8 flex-none rounded-full border-0 bg-ol-blue-bg text-ol-blue hover:bg-ol-blue-bg-hover"
                          onClick={() => handleInsertSkillCommand(skill)}
                          aria-label={t('skills.useSkillAriaLabel', { name: skill.name })}
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-44">
                    <ContextMenuItem
                      icon={Eye}
                      onClick={() => handleOpenSkill(skill)}
                      disabled={!canOpenSkill}
                    >
                      {t('skills.viewSkillDir')}
                    </ContextMenuItem>
                    {skill.isDeletable ? (
                      <ContextMenuItem
                        icon={Trash2}
                        variant="destructive"
                        onClick={() => void handleDeleteSkill(skill)}
                        disabled={deleteSkillMutation.isPending}
                      >
                        {t('skills.deleteSkill')}
                      </ContextMenuItem>
                    ) : null}
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        ) : null}

        {skillsQuery.isLoading ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            {t('skills.loading')}
          </div>
        ) : null}

        {!skillsQuery.isLoading && !skillsQuery.isError && skills.length === 0 ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            {t('skills.empty')}
          </div>
        ) : null}

        {!skillsQuery.isLoading &&
        !skillsQuery.isError &&
        skills.length > 0 &&
        filteredSkills.length === 0 ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            {t('skills.noMatch')}
          </div>
        ) : null}

        {skillsQuery.isError ? (
          <div className="py-9 text-center text-sm text-destructive">
            {t('skills.readFailed', { error: skillsQuery.error?.message ?? t('skills.unknownError') })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
