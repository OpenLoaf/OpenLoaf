"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";
import { TenasSettingsCard } from "@tenas-ai/ui/tenas/TenasSettingsCard";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { Button } from "@tenas-ai/ui/button";
import { Switch } from "@tenas-ai/ui/switch";
import { Input } from "@tenas-ai/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@tenas-ai/ui/tabs";
import { Eye, FolderOpen, Search, Sparkles, Trash2, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tenas-ai/ui/tooltip";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useProject } from "@/hooks/use-project";
import {
  buildFileUriFromRoot,
  buildUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";
import { toast } from "sonner";

type SkillScope = "workspace" | "project" | "global";

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

/** Label text for each skill scope. */
const SCOPE_LABELS: Record<SkillScope, string> = {
  workspace: "工作空间",
  project: "项目",
  global: "全局",
};

/** Tag styles per scope. */
const SCOPE_TAG_CLASS: Record<SkillScope, string> = {
  workspace:
    "border-sky-200/70 bg-sky-500/10 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300",
  project:
    "border-emerald-200/70 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  global:
    "border-amber-200/70 bg-amber-500/10 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
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
      // 否则 buildUriFromRoot 只返回裸相对路径，导致服务端解析到工作空间根目录。
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

/** Render a scope tag. */
function ScopeTag({ scope }: { scope: SkillScope }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px]",
        SCOPE_TAG_CLASS[scope],
      )}
    >
      {SCOPE_LABELS[scope]}
    </span>
  );
}

/** Shared skills settings panel. */
export function SkillsSettingsPanel({ projectId }: SkillsSettingsPanelProps) {
  const isProjectList = Boolean(projectId);
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const queryOptions = projectId
    ? trpc.settings.getSkills.queryOptions({ projectId })
    : trpc.settings.getSkills.queryOptions();
  const skillsQuery = useQuery(queryOptions);
  const skills = (skillsQuery.data ?? []) as SkillSummary[];
  const { workspace } = useWorkspace();
  const { data: projectData } = useProject(projectId);
  const activeTabId = useTabs((state) => state.activeTabId);
  const pushStackItem = useTabRuntime((state) => state.pushStackItem);
  const setTabRightChatCollapsed = useTabRuntime((state) => state.setTabRightChatCollapsed);
  const workspaceId = workspace?.id ?? "";

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

  /** Whether any filter is active. */
  const hasActiveFilter = searchQuery.trim() || scopeFilter !== "all" || statusFilter !== "all";

  /** Clear all filters. */
  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setScopeFilter("all");
    setStatusFilter("all");
  }, []);

  /** Skills root uri for system file manager open. */
  const skillsRootUri = useMemo(() => {
    const baseRootUri = isProjectList ? projectData?.project?.rootUri : workspace?.rootUri;
    if (!baseRootUri) return "";
    if (baseRootUri.startsWith("file://")) {
      return buildFileUriFromRoot(baseRootUri, ".tenas/skills");
    }
    const normalizedRoot = baseRootUri.replace(/[/\\]+$/, "");
    return normalizedRoot ? `${normalizedRoot}/.tenas/skills` : "";
  }, [isProjectList, projectData?.project?.rootUri, workspace?.rootUri]);

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
        toast.success("已删除技能");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  /** Open skills folder in system file manager. */
  const handleOpenSkillsRoot = useCallback(async () => {
    if (!skillsRootUri) return;
    if (!workspaceId) {
      toast.error("未找到工作空间");
      return;
    }
    if (isProjectList && !projectId) {
      toast.error("未找到项目");
      return;
    }
    try {
      await mkdirMutation.mutateAsync({
        workspaceId,
        projectId: isProjectList ? projectId : undefined,
        uri: ".tenas/skills",
        recursive: true,
      });
    } catch {
      return;
    }
    const api = window.tenasElectron;
    if (!api?.openPath) {
      toast.error("网页版不支持打开文件管理器");
      return;
    }
    const res = await api.openPath({ uri: skillsRootUri });
    if (!res?.ok) {
      toast.error(res?.reason ?? "无法打开文件管理器");
    }
  }, [isProjectList, mkdirMutation, projectId, skillsRootUri, workspaceId]);

  /** Open a skill folder tree in stack. */
  const handleOpenSkill = useCallback(
    (skill: SkillSummary) => {
      if (!activeTabId) return;
      const isProjectSkill = skill.scope === "project";
      const isGlobalSkill = skill.scope === "global";
      // 全局技能路径为绝对路径，不依赖 workspace/project rootUri。
      const baseRootUri = isGlobalSkill
        ? undefined
        : isProjectSkill
          ? projectData?.project?.rootUri
          : workspace?.rootUri;
      const rootUri = resolveSkillFolderUri(skill.path, baseRootUri);
      if (!rootUri) return;
      const currentUri = resolveSkillUri(skill.path, rootUri);
      const stackKey = skill.ignoreKey.trim() || skill.path || skill.name;
      const titlePrefix = isGlobalSkill
        ? "全局技能"
        : isProjectSkill
          ? "项目技能"
          : "工作空间技能";
      // 打开左侧 stack 的文件系统预览，根目录固定为技能所在目录。
      pushStackItem(activeTabId, {
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
    },
    [activeTabId, projectData?.project?.rootUri, projectId, pushStackItem, workspace?.rootUri],
  );

  /** Toggle skill enable state for current scope. */
  const handleToggleSkill = useCallback(
    (skill: SkillSummary, nextEnabled: boolean) => {
      if (!skill.ignoreKey.trim()) return;
      const scope = isProjectList ? "project" : "workspace";
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
        new CustomEvent("tenas:chat-insert-skill", {
          detail: { skillName },
        })
      );
      window.dispatchEvent(new CustomEvent("tenas:chat-focus-input"));
      if (activeTabId) {
        setTabRightChatCollapsed(activeTabId, false);
      }
    },
    [activeTabId, setTabRightChatCollapsed],
  );

  /** Delete a skill folder with confirmation. */
  const handleDeleteSkill = useCallback(
    async (skill: SkillSummary) => {
      if (!skill.isDeletable || !skill.ignoreKey.trim()) return;
      const confirmed = window.confirm(`确认删除技能「${skill.name}」？此操作不可撤销。`);
      if (!confirmed) return;
      const scope = isProjectList ? "project" : "workspace";
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
    <div className="space-y-4">
      <TenasSettingsCard className="border-0 bg-transparent" padding="none">
        {/* 搜索和过滤栏 */}
        <div className="flex flex-col gap-3 px-3 py-3 border-b border-border">
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜索技能名称或描述..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 h-9"
            />
            {searchQuery && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery("")}
                aria-label="清除搜索"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* 过滤器 */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 作用域过滤 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">作用域:</span>
              <Tabs
                value={scopeFilter}
                onValueChange={(v) => setScopeFilter(v as ScopeFilter)}
              >
                <TabsList className="h-7">
                  <TabsTrigger value="all" className="text-xs px-2 h-6">
                    全部
                  </TabsTrigger>
                  {isProjectList ? (
                    <TabsTrigger value="project" className="text-xs px-2 h-6">
                      项目
                    </TabsTrigger>
                  ) : null}
                  <TabsTrigger value="workspace" className="text-xs px-2 h-6">
                    工作空间
                  </TabsTrigger>
                  <TabsTrigger value="global" className="text-xs px-2 h-6">
                    全局
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* 启用状态过滤 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">状态:</span>
              <Tabs
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <TabsList className="h-7">
                  <TabsTrigger value="all" className="text-xs px-2 h-6">
                    全部
                  </TabsTrigger>
                  <TabsTrigger value="enabled" className="text-xs px-2 h-6">
                    已启用
                  </TabsTrigger>
                  <TabsTrigger value="disabled" className="text-xs px-2 h-6">
                    已禁用
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* 清除过滤按钮 */}
            {hasActiveFilter ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={clearFilters}
              >
                清除过滤
              </Button>
            ) : null}

            <div className="ml-auto flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() => void handleOpenSkillsRoot()}
                    disabled={!skillsRootUri || !workspaceId || (isProjectList && !projectId)}
                    aria-label="打开技能目录"
                  >
                    <FolderOpen className="h-4 w-4" />
                    <span className="ml-1.5">打开文件夹</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  打开技能目录
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* 过滤结果提示 */}
          {hasActiveFilter && !skillsQuery.isLoading ? (
            <div className="text-xs text-muted-foreground">
              显示 {filteredSkills.length} / {skills.length} 条结果
            </div>
          ) : null}
        </div>

        <div className="divide-y divide-border">
          {filteredSkills.map((skill) => (
            <div
              key={skill.ignoreKey || skill.path || `${skill.scope}:${skill.name}`}
              className="flex flex-wrap items-start gap-3 px-3 py-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className="min-w-0 truncate text-sm font-medium">
                      {skill.name}
                    </div>
                    <ScopeTag scope={skill.scope} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => handleInsertSkillCommand(skill)}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      使用此技能
                    </Button>
                  </div>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-muted-foreground line-clamp-2 flex-1">
                    {skill.description?.trim() ? skill.description : skill.name}
                  </div>
                  <div className="flex items-center gap-2">
                    {skill.isDeletable ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="删除技能"
                        title="删除技能"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDeleteSkill(skill)}
                        disabled={deleteSkillMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="查看技能目录"
                          className="h-7 w-7"
                          onClick={() => handleOpenSkill(skill)}
                          disabled={
                            !activeTabId ||
                            !resolveSkillFolderUri(
                              skill.path,
                              skill.scope === "global"
                                ? undefined
                                : skill.scope === "project"
                                  ? projectData?.project?.rootUri
                                  : workspace?.rootUri,
                            )
                          }
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={6}>
                        查看技能目录
                      </TooltipContent>
                    </Tooltip>
                    <Switch
                      checked={skill.isEnabled}
                      onCheckedChange={(checked) => handleToggleSkill(skill, checked)}
                      aria-label="启用技能"
                      disabled={updateSkillMutation.isPending}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}

          {skillsQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">加载中...</div>
          ) : null}

          {!skillsQuery.isLoading &&
          !skillsQuery.isError &&
          skills.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              暂无可用技能，请在 .tenas/skills 或 ~/.agents/skills 中添加 SKILL.md。
            </div>
          ) : null}

          {!skillsQuery.isLoading &&
          !skillsQuery.isError &&
          skills.length > 0 &&
          filteredSkills.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              没有匹配的技能
            </div>
          ) : null}

          {skillsQuery.isError ? (
            <div className="p-6 text-sm text-destructive">
              读取失败：{skillsQuery.error?.message ?? "未知错误"}
            </div>
          ) : null}
        </div>
      </TenasSettingsCard>
    </div>
  );
}
