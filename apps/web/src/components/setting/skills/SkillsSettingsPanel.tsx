"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { Button } from "@tenas-ai/ui/button";
import { Switch } from "@tenas-ai/ui/switch";
import { Input } from "@tenas-ai/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@tenas-ai/ui/tabs";
import { ArrowRight, Eye, FolderOpen, Search, Trash2, X } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@tenas-ai/ui/context-menu";
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

/** Card styles per scope. */
const SCOPE_CARD_CLASS: Record<SkillScope, string> = {
  workspace:
    "bg-zinc-100 hover:bg-zinc-200/75 dark:bg-zinc-800 dark:hover:bg-zinc-700/85",
  project:
    "bg-sky-100 hover:bg-sky-200/75 dark:bg-sky-900/55 dark:hover:bg-sky-800/70",
  global:
    "bg-slate-100 hover:bg-slate-200/78 dark:bg-slate-800 dark:hover:bg-slate-700/85",
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

  /** Text for current skill list source. */
  const scopeHintText = isProjectList ? "当前项目技能目录" : "当前工作空间技能目录";

  /** Skills root uri for system file manager open. */
  const skillsRootUri = useMemo(() => {
    const baseRootUri = isProjectList ? projectData?.project?.rootUri : workspace?.rootUri;
    if (!baseRootUri) return "";
    if (baseRootUri.startsWith("file://")) {
      return buildFileUriFromRoot(baseRootUri, ".agents/skills");
    }
    const normalizedRoot = baseRootUri.replace(/[/\\]+$/, "");
    return normalizedRoot ? `${normalizedRoot}/.agents/skills` : "";
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
        uri: ".agents/skills",
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2.5 border-b border-border/60 px-3 py-2.5">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">技能管理</h3>
          <p className="text-xs text-muted-foreground">
            {scopeHintText}。支持搜索、筛选、启用控制与快速调用。
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
              disabled={!skillsRootUri || !workspaceId || (isProjectList && !projectId)}
              aria-label="打开技能目录"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="ml-1.5 hidden sm:inline">打开目录</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            打开技能目录
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="border-b border-border/60 px-3 py-2.5">
        <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-center">
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜索技能名称或描述..."
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
                aria-label="清除搜索"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
              ) : null}
          </div>
          <div className="min-w-0 overflow-x-auto pb-0.5">
            <Tabs value={scopeFilter} onValueChange={(value) => setScopeFilter(value as ScopeFilter)}>
              <TabsList className="h-8 w-max rounded-full border border-border/70 bg-muted/40 p-1">
                <TabsTrigger value="all" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                  全部
                </TabsTrigger>
                {isProjectList ? (
                  <TabsTrigger value="project" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                    项目
                  </TabsTrigger>
                ) : null}
                <TabsTrigger
                  value="workspace"
                  className="h-6 rounded-full px-2 text-xs whitespace-nowrap"
                >
                  工作空间
                </TabsTrigger>
                <TabsTrigger value="global" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                  全局
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="min-w-0 overflow-x-auto pb-0.5">
            <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <TabsList className="h-8 w-max rounded-full border border-border/70 bg-muted/40 p-1">
                <TabsTrigger value="all" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                  全部
                </TabsTrigger>
                <TabsTrigger value="enabled" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                  开启中
                </TabsTrigger>
                <TabsTrigger value="disabled" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                  关闭中
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
                    : workspace?.rootUri;
              const canOpenSkill = Boolean(
                activeTabId && resolveSkillFolderUri(skill.path, baseRootUri),
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
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {skill.description?.trim() ? skill.description : skill.name}
                          </p>
                        </div>
                        <Switch
                          checked={skill.isEnabled}
                          onCheckedChange={(checked) => handleToggleSkill(skill, checked)}
                          className="border-zinc-300/70 bg-zinc-200/55 data-[state=checked]:bg-emerald-300/60 dark:border-zinc-600/80 dark:bg-zinc-700/45 dark:data-[state=checked]:bg-emerald-600/45"
                          aria-label={`启用技能 ${skill.name}`}
                          disabled={updateSkillMutation.isPending}
                        />
                      </div>

                      <div className="mt-auto flex items-center justify-end pt-3">
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="h-10 w-10 rounded-full border-0 bg-sky-200/85 text-sky-900 hover:bg-sky-300/85 dark:bg-sky-500/30 dark:text-sky-100 dark:hover:bg-sky-500/40"
                          onClick={() => handleInsertSkillCommand(skill)}
                          aria-label={`使用技能 ${skill.name}`}
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
                      查看技能目录
                    </ContextMenuItem>
                    {skill.isDeletable ? (
                      <ContextMenuItem
                        icon={Trash2}
                        variant="destructive"
                        onClick={() => void handleDeleteSkill(skill)}
                        disabled={deleteSkillMutation.isPending}
                      >
                        删除技能
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
            正在加载技能列表...
          </div>
        ) : null}

        {!skillsQuery.isLoading && !skillsQuery.isError && skills.length === 0 ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            暂无可用技能，请在 `.agents/skills` 或 `~/.agents/skills` 中添加 `SKILL.md`。
          </div>
        ) : null}

        {!skillsQuery.isLoading &&
        !skillsQuery.isError &&
        skills.length > 0 &&
        filteredSkills.length === 0 ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            没有匹配的技能，请调整筛选条件后重试。
          </div>
        ) : null}

        {skillsQuery.isError ? (
          <div className="py-9 text-center text-sm text-destructive">
            读取失败：{skillsQuery.error?.message ?? "未知错误"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
