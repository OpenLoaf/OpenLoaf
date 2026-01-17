"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";
import { TenasSettingsGroup } from "@/components/ui/tenas/TenasSettingsGroup";
import { useTabs } from "@/hooks/use-tabs";
import { Button } from "@/components/ui/button";
import { FolderOpen } from "lucide-react";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useProject } from "@/hooks/use-project";
import { buildUriFromRoot } from "@/components/project/filesystem/utils/file-system-utils";

type SkillScope = "workspace" | "project";

type SkillSummary = {
  /** Skill name. */
  name: string;
  /** Skill description. */
  description: string;
  /** Absolute skill file path. */
  path: string;
  /** Skill scope. */
  scope: SkillScope;
};

type SkillsSettingsPanelProps = {
  /** Project id for loading project-scoped skills. */
  projectId?: string;
};

/** Label text for each skill scope. */
const SCOPE_LABELS: Record<SkillScope, string> = {
  workspace: "工作空间",
  project: "项目",
};

/** Tag styles per scope. */
const SCOPE_TAG_CLASS: Record<SkillScope, string> = {
  workspace: "border-border bg-muted text-muted-foreground",
  project: "border-border bg-background text-foreground/80",
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
      // 中文注释：优先使用 rootUri + 相对路径拼接，保持 URI 编码一致。
      const relative = normalizedSkillPath.slice(rootPath.length).replace(/^\/+/, "");
      if (!relative) return rootUri;
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
  // 中文注释：统计 workspace/project 的数量，输出摘要信息。
  const counts = skills.reduce(
    (acc, skill) => {
      if (skill.scope === "project") {
        acc.project += 1;
      } else {
        acc.workspace += 1;
      }
      return acc;
    },
    { workspace: 0, project: 0 },
  );
  if (projectId) {
    return `共 ${skills.length} 条（工作空间 ${counts.workspace} / 项目 ${counts.project}）`;
  }
  return `共 ${skills.length} 条`;
}

/** Shared skills settings panel. */
export function SkillsSettingsPanel({ projectId }: SkillsSettingsPanelProps) {
  const queryOptions = projectId
    ? trpc.settings.getSkills.queryOptions({ projectId })
    : trpc.settings.getSkills.queryOptions();
  const skillsQuery = useQuery(queryOptions);
  const skills = (skillsQuery.data ?? []) as SkillSummary[];
  const { workspace } = useWorkspace();
  const { data: projectData } = useProject(projectId);
  const activeTabId = useTabs((state) => state.activeTabId);
  const pushStackItem = useTabs((state) => state.pushStackItem);

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

  /** Open a skill folder tree in stack. */
  const handleOpenSkill = useCallback(
    (skill: SkillSummary) => {
      if (!activeTabId) return;
      const isProjectSkill = skill.scope === "project";
      const baseRootUri = isProjectSkill ? projectData?.project?.rootUri : workspace?.rootUri;
      const rootUri = resolveSkillFolderUri(skill.path, baseRootUri);
      if (!rootUri) return;
      const currentUri = resolveSkillUri(skill.path, rootUri);
      const titlePrefix = isProjectSkill ? "项目技能" : "工作空间技能";
      // 中文注释：打开左侧 stack 的文件系统预览，根目录固定为技能所在目录。
      pushStackItem(activeTabId, {
        id: `skill:${skill.scope}:${skill.name}`,
        sourceKey: `skill:${skill.scope}:${skill.name}`,
        component: "folder-tree-preview",
        title: `${titlePrefix} · ${skill.name}`,
        params: {
          rootUri,
          currentUri,
          projectId: isProjectSkill ? projectId : undefined,
          projectTitle: skill.name,
          viewerRootUri: baseRootUri,
        },
      });
    },
    [activeTabId, projectData?.project?.rootUri, projectId, pushStackItem, workspace?.rootUri],
  );

  return (
    <div className="space-y-4">
      <TenasSettingsGroup title="技能列表" subtitle={summaryText}>
        <div className="divide-y divide-border">
          {skills.map((skill) => (
            <div
              key={`${skill.scope}:${skill.name}`}
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
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="打开技能目录"
                    title="打开技能目录"
                    className="h-8 w-8"
                    onClick={() => handleOpenSkill(skill)}
                    disabled={
                      !activeTabId ||
                      !resolveSkillFolderUri(
                        skill.path,
                        skill.scope === "project"
                          ? projectData?.project?.rootUri
                          : workspace?.rootUri,
                      )
                    }
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
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
              暂无可用技能，请在 .tenas/skills 中添加 SKILL.md。
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
