"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";
import { TenasSettingsGroup } from "@tenas-ai/ui/tenas/TenasSettingsGroup";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { Button } from "@tenas-ai/ui/button";
import { Switch } from "@tenas-ai/ui/switch";
import { Eye, FolderOpen, Trash2 } from "lucide-react";
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

/** Label text for each skill scope. */
const SCOPE_LABELS: Record<SkillScope, string> = {
  workspace: "工作空间",
  project: "项目",
  global: "全局",
};

/** Tag styles per scope. */
const SCOPE_TAG_CLASS: Record<SkillScope, string> = {
  workspace: "border-border bg-muted text-muted-foreground",
  project: "border-border bg-background text-foreground/80",
  global: "border-border bg-muted/60 text-muted-foreground/80",
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

/** Build summary text for the current skills list. */
function buildSkillSummaryText(input: {
  skills: SkillSummary[];
  projectId?: string;
  isLoading: boolean;
  isError: boolean;
}): string {
  const { skills, projectId, isLoading, isError } = input;
  if (isLoading) return "读取中...";
  if (isError) return "读取失败";
  if (!skills.length) return "未发现技能";
  // 统计 workspace/project/global 的数量，输出摘要信息。
  const counts = skills.reduce(
    (acc, skill) => {
      if (skill.scope === "project") {
        acc.project += 1;
      } else if (skill.scope === "global") {
        acc.global += 1;
      } else {
        acc.workspace += 1;
      }
      return acc;
    },
    { workspace: 0, project: 0, global: 0 },
  );
  if (projectId) {
    return `共 ${skills.length} 条（全局 ${counts.global} / 工作空间 ${counts.workspace} / 项目 ${counts.project}）`;
  }
  if (counts.global > 0) {
    return `共 ${skills.length} 条（全局 ${counts.global} / 工作空间 ${counts.workspace}）`;
  }
  return `共 ${skills.length} 条`;
}

/** Shared skills settings panel. */
export function SkillsSettingsPanel({ projectId }: SkillsSettingsPanelProps) {
  const isProjectList = Boolean(projectId);
  const queryOptions = projectId
    ? trpc.settings.getSkills.queryOptions({ projectId })
    : trpc.settings.getSkills.queryOptions();
  const skillsQuery = useQuery(queryOptions);
  const skills = (skillsQuery.data ?? []) as SkillSummary[];
  const { workspace } = useWorkspace();
  const { data: projectData } = useProject(projectId);
  const activeTabId = useTabs((state) => state.activeTabId);
  const pushStackItem = useTabRuntime((state) => state.pushStackItem);
  const workspaceId = workspace?.id ?? "";
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

  const summaryText = useMemo(
    () =>
      buildSkillSummaryText({
        skills,
        projectId,
        isLoading: skillsQuery.isLoading,
        isError: skillsQuery.isError,
      }),
    [projectId, skills, skillsQuery.isLoading, skillsQuery.isError],
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
      <TenasSettingsGroup
        title="技能列表"
        subtitle={summaryText}
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => void handleOpenSkillsRoot()}
                disabled={!skillsRootUri || !workspaceId || (isProjectList && !projectId)}
                aria-label="打开技能目录"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              打开技能目录
            </TooltipContent>
          </Tooltip>
        }
      >
        <div className="divide-y divide-border">
          {skills.map((skill) => (
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
                    {skill.isDeletable ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="删除技能"
                        title="删除技能"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDeleteSkill(skill)}
                        disabled={deleteSkillMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="查看技能目录"
                          className="h-8 w-8"
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
                          <Eye className="h-4 w-4" />
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
                <div className="text-xs text-muted-foreground line-clamp-2">
                  {skill.description}
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

          {skillsQuery.isError ? (
            <div className="p-6 text-sm text-destructive">
              读取失败：{skillsQuery.error?.message ?? "未知错误"}
            </div>
          ) : null}
        </div>
      </TenasSettingsGroup>
    </div>
  );
}
