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
import dynamic from "next/dynamic";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import { Button } from "@openloaf/ui/button";
import { Switch } from "@openloaf/ui/switch";
import { Checkbox } from "@openloaf/ui/checkbox";
import { Input } from "@openloaf/ui/input";
import { FilterTab } from "@openloaf/ui/filter-tab";
import {
  Search, Trash2, X, FolderOpen, Eye, Plus, Pencil,
  Globe, FileSearch, FilePen, Terminal, Mail, Calendar,
  Image, LayoutGrid, Link, Users, Code, Settings, FolderKanban, Blocks,
  Bot, Sparkles, FileText,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import {
  buildFileUriFromRoot,
  buildUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";
import { toast } from "sonner";

type AgentScope = "workspace" | "project" | "global";

type AgentSummary = {
  name: string;
  description: string;
  icon: string;
  model: string;
  toolIds: string[];
  skills: string[];
  path: string;
  folderName: string;
  ignoreKey: string;
  scope: AgentScope;
  isEnabled: boolean;
  isDeletable: boolean;
  isInherited: boolean;
  isChildProject: boolean;
  isSystem: boolean;
};

type StatusFilter = "all" | "enabled" | "disabled";

type CapabilityTool = {
  id: string;
  label: string;
  description: string;
};

type CapabilityGroup = {
  id: string;
  label: string;
  description: string;
  toolIds: string[];
  tools: CapabilityTool[];
};

const CAP_ICON_MAP: Record<string, { icon: LucideIcon; className: string }> = {
  browser: { icon: Globe, className: "text-blue-500" },
  "file-read": { icon: FileSearch, className: "text-emerald-500" },
  "file-write": { icon: FilePen, className: "text-green-600" },
  shell: { icon: Terminal, className: "text-slate-500" },
  email: { icon: Mail, className: "text-red-500" },
  calendar: { icon: Calendar, className: "text-orange-500" },
  "image-generate": { icon: Image, className: "text-pink-500" },
  "video-generate": { icon: Video, className: "text-purple-500" },
  widget: { icon: LayoutGrid, className: "text-violet-500" },
  project: { icon: FolderKanban, className: "text-cyan-500" },
  web: { icon: Link, className: "text-sky-500" },
  agent: { icon: Users, className: "text-indigo-500" },
  "code-interpreter": { icon: Code, className: "text-amber-500" },
  system: { icon: Settings, className: "text-slate-400" },
};

const CAP_BG_MAP: Record<string, string> = {
  browser: "bg-blue-50 dark:bg-blue-950/40",
  "file-read": "bg-emerald-50 dark:bg-emerald-950/40",
  "file-write": "bg-green-50 dark:bg-green-950/40",
  shell: "bg-slate-50 dark:bg-slate-950/40",
  email: "bg-red-50 dark:bg-red-950/40",
  calendar: "bg-orange-50 dark:bg-orange-950/40",
  "image-generate": "bg-pink-50 dark:bg-pink-950/40",
  "video-generate": "bg-purple-50 dark:bg-purple-950/40",
  widget: "bg-violet-50 dark:bg-violet-950/40",
  project: "bg-cyan-50 dark:bg-cyan-950/40",
  web: "bg-sky-50 dark:bg-sky-950/40",
  agent: "bg-indigo-50 dark:bg-indigo-950/40",
  "code-interpreter": "bg-amber-50 dark:bg-amber-950/40",
  system: "bg-gray-50 dark:bg-gray-950/40",
};

/** Fallback map for commonly used agent icons. */
const AGENT_ICON_MAP: Partial<Record<string, LucideIcon>> = {
  bot: Bot,
  sparkles: Sparkles,
  "file-text": FileText,
  terminal: Terminal,
  globe: Globe,
  mail: Mail,
  calendar: Calendar,
  "layout-grid": LayoutGrid,
  "folder-kanban": FolderKanban,
};

const AGENT_ICON_COLOR_MAP: Record<string, string> = {
  bot: "text-indigo-500",
  sparkles: "text-violet-500",
  "file-text": "text-emerald-500",
  terminal: "text-slate-500",
  globe: "text-sky-500",
  mail: "text-red-500",
  calendar: "text-orange-500",
  "layout-grid": "text-violet-500",
  "folder-kanban": "text-cyan-500",
};

/** Normalize path to use forward slashes. */
function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

/** Normalize icon name to kebab-case for lookup. */
function normalizeIconName(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

/** Cache for lazily loaded lucide icons. */
const LUCIDE_ICON_CACHE = new Map<string, LucideIcon>();
/** Resolve lucide icon component from a pascal-case name. */
function resolveLucideIcon(name: string): LucideIcon | null {
  if (!name) return null;
  const cached = LUCIDE_ICON_CACHE.get(name);
  if (cached) return cached;
  const importer = (dynamicIconImports as Record<string, () => Promise<{ default: LucideIcon }>>)[name];
  if (!importer) return null;
  const Component = dynamic(importer, { ssr: false }) as unknown as LucideIcon;
  LUCIDE_ICON_CACHE.set(name, Component);
  return Component;
}

function toFileUri(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("file://")) return trimmed;
  const normalized = normalizePath(trimmed);
  if (/^[A-Za-z]:\//.test(normalized)) return `file:///${encodeURI(normalized)}`;
  if (normalized.startsWith("/")) return `file://${encodeURI(normalized)}`;
  return `file:///${encodeURI(normalized)}`;
}

function resolveAgentFolderUri(
  agentPath: string,
  baseRootUri?: string,
): string | undefined {
  if (!agentPath) return undefined;
  const normalizedPath = normalizePath(agentPath).replace(/\/+$/, "");
  const lastSlash = normalizedPath.lastIndexOf("/");
  const dirPath = lastSlash >= 0 ? normalizedPath.slice(0, lastSlash) : "";
  if (!dirPath) return baseRootUri ?? toFileUri(normalizedPath);
  if (baseRootUri) {
    try {
      const rootUrl = new URL(baseRootUri);
      const rootPath = normalizePath(decodeURIComponent(rootUrl.pathname)).replace(/\/$/, "");
      if (dirPath.startsWith(rootPath)) {
        const relative = dirPath.slice(rootPath.length).replace(/^\/+/, "");
        return relative ? buildUriFromRoot(baseRootUri, relative) : baseRootUri;
      }
    } catch {
      // fallback
    }
  }
  return toFileUri(dirPath);
}

type AgentManagementProps = {
  projectId?: string;
};

export function AgentManagement({ projectId }: AgentManagementProps) {
  if (projectId) {
    return <ProjectAgentView projectId={projectId} />;
  }
  return <WorkspaceAgentView />;
}

/** Lazy-loaded ProjectAgentView to avoid circular imports. */
const ProjectAgentViewLazy = dynamic(
  () => import("./ProjectAgentView").then((m) => ({ default: m.ProjectAgentView })),
  { ssr: false },
);

function ProjectAgentView({ projectId }: { projectId: string }) {
  return <ProjectAgentViewLazy projectId={projectId} />;
}

function WorkspaceAgentView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showAllProjects, setShowAllProjects] = useState(true);

  const agentsQuery = useQuery(trpc.settings.getAgents.queryOptions({ includeAllProjects: true }));
  const agents = (agentsQuery.data ?? []) as AgentSummary[];
  const capGroupsQuery = useQuery(trpc.settings.getCapabilityGroups.queryOptions());
  const capGroups = useMemo(
    () => (capGroupsQuery.data ?? []) as CapabilityGroup[],
    [capGroupsQuery.data],
  );
  /** Resolve enabled capability groups from tool ids. */
  const resolveAgentGroups = useCallback(
    (toolIds: string[]) => {
      if (!toolIds?.length || capGroups.length === 0) return [];
      const toolIdSet = new Set(toolIds);
      return capGroups.filter((group) => {
        const groupToolIds = group.tools?.length
          ? group.tools.map((tool) => tool.id)
          : group.toolIds;
        return groupToolIds.some((toolId) => toolIdSet.has(toolId));
      });
    },
    [capGroups],
  );
  const { workspace } = useWorkspace();
  const activeTabId = useTabs((s) => s.activeTabId);
  const pushStackItem = useTabRuntime((s) => s.pushStackItem);
  const workspaceId = workspace?.id ?? "";

  const hasNonMasterAgents = useMemo(
    () =>
      agents.some((agent) => agent.folderName.toLowerCase() !== "master"),
    [agents],
  );
  const masterAgent = useMemo(
    () =>
      agents.find(
        (agent) =>
          agent.folderName === "master" && agent.scope === "workspace",
      ),
    [agents],
  );

  const filteredAgents = useMemo(() => {
    const filtered = agents.filter((agent) => {
      if (agent.folderName.toLowerCase() === "master") return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = agent.name.toLowerCase().includes(q);
        const matchDesc = agent.description.toLowerCase().includes(q);
        const agentGroups = resolveAgentGroups(agent.toolIds);
        const groupLabels = agentGroups
          .map((group) => `${group.label} ${group.id}`)
          .join(" ");
        const groupTools = agentGroups
          .flatMap((group) => group.tools ?? [])
          .map((tool) => tool.label || tool.id)
          .join(" ");
        const toolText = agent.toolIds.join(" ");
        const matchCaps = `${groupLabels} ${groupTools} ${toolText}`
          .toLowerCase()
          .includes(q);
        if (!matchName && !matchDesc && !matchCaps) return false;
      }
      if (statusFilter === "enabled" && !agent.isEnabled) return false;
      if (statusFilter === "disabled" && agent.isEnabled) return false;
      if (!showAllProjects && agent.scope === 'project') return false;
      return true;
    });
    // 逻辑：系统 Agent 排在列表顶部。
    return filtered.sort((a, b) => {
      if (a.isSystem && !b.isSystem) return -1;
      if (!a.isSystem && b.isSystem) return 1;
      return 0;
    });
  }, [
    agents,
    searchQuery,
    statusFilter,
    showAllProjects,
    resolveAgentGroups,
  ]);

  const mkdirMutation = useMutation(
    trpc.fs.mkdir.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );

  const updateAgentMutation = useMutation(
    trpc.settings.setAgentEnabled.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getAgents.queryOptions().queryKey,
        });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const deleteAgentMutation = useMutation(
    trpc.settings.deleteAgent.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getAgents.queryOptions().queryKey,
        });
        toast.success("已删除 Agent助手");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const handleOpenAgentsRoot = useCallback(async () => {
    const rootUri = workspace?.rootUri;
    if (!rootUri || !workspaceId) {
      toast.error("未找到工作空间");
      return;
    }
    try {
      await mkdirMutation.mutateAsync({
        workspaceId,
        uri: ".openloaf/agents",
        recursive: true,
      });
    } catch {
      return;
    }
    const api = window.openloafElectron;
    if (!api?.openPath) {
      if (activeTabId) {
        const agentsUri = rootUri.startsWith('file://')
          ? buildFileUriFromRoot(rootUri, '.openloaf/agents')
          : `${rootUri.replace(/[/\\]+$/, '')}/.openloaf/agents`
        pushStackItem(activeTabId, {
          id: `agents-root:workspace`,
          sourceKey: `agents-root:workspace`,
          component: 'folder-tree-preview',
          title: 'Agents',
          params: {
            rootUri: agentsUri,
            currentUri: '',
          },
        })
      }
      return;
    }
    const agentsUri = rootUri.startsWith("file://")
      ? buildFileUriFromRoot(rootUri, ".openloaf/agents")
      : `${rootUri.replace(/[/\\]+$/, "")}/.openloaf/agents`;
    const res = await api.openPath({ uri: agentsUri });
    if (!res?.ok) toast.error(res?.reason ?? "无法打开文件管理器");
  }, [activeTabId, mkdirMutation, pushStackItem, workspace?.rootUri, workspaceId]);

  const handleOpenAgent = useCallback(
    (agent: AgentSummary) => {
      if (!activeTabId) return;
      const baseRootUri =
        agent.scope === "global" ? undefined : workspace?.rootUri;
      const rootUri = resolveAgentFolderUri(agent.path, baseRootUri);
      if (!rootUri) return;
      const stackKey = agent.ignoreKey.trim() || agent.path || agent.name;
      const titlePrefix =
        agent.scope === "global"
          ? "全局 Agent助手"
          : agent.scope === "project"
            ? "项目 Agent助手"
            : "工作空间 Agent助手";
      pushStackItem(activeTabId, {
        id: `agent:${agent.scope}:${stackKey}`,
        sourceKey: `agent:${agent.scope}:${stackKey}`,
        component: "folder-tree-preview",
        title: `${titlePrefix} · ${agent.name}`,
        params: {
          rootUri,
          currentEntryKind: "file",
          projectTitle: agent.name,
          viewerRootUri: baseRootUri,
        },
      });
    },
    [activeTabId, pushStackItem, workspace?.rootUri],
  );

  const handleEditAgent = useCallback(
    (agent: AgentSummary) => {
      if (!activeTabId) return;
      pushStackItem(activeTabId, {
        id: `agent-detail:${agent.scope}:${agent.name}`,
        sourceKey: `agent-detail:${agent.scope}:${agent.name}`,
        component: "agent-detail",
        title: `Agent助手 · ${agent.name}`,
        params: {
          agentPath: agent.path,
          scope: agent.scope,
          isSystem: agent.isSystem,
        },
      });
    },
    [activeTabId, pushStackItem],
  );

  const handleEditMasterAgent = useCallback(() => {
    if (!masterAgent) return;
    handleEditAgent(masterAgent);
  }, [handleEditAgent, masterAgent]);

  const handleCreateAgent = useCallback(() => {
    if (!activeTabId) return;
    pushStackItem(activeTabId, {
      id: `agent-detail:new:${Date.now()}`,
      sourceKey: `agent-detail:new`,
      component: "agent-detail",
      title: "创建 Agent助手",
      params: {
        isNew: true,
        scope: "workspace",
      },
    });
  }, [activeTabId, pushStackItem]);

  const handleToggleAgent = useCallback(
    (agent: AgentSummary, nextEnabled: boolean) => {
      if (!agent.ignoreKey.trim()) return;
      updateAgentMutation.mutate({
        scope: "workspace",
        ignoreKey: agent.ignoreKey,
        enabled: nextEnabled,
      });
    },
    [updateAgentMutation],
  );

  const handleDeleteAgent = useCallback(
    async (agent: AgentSummary) => {
      if (!agent.isDeletable || !agent.ignoreKey.trim()) return;
      const confirmed = window.confirm(
        `确认删除 Agent助手「${agent.name}」？此操作不可撤销。`,
      );
      if (!confirmed) return;
      await deleteAgentMutation.mutateAsync({
        scope: "workspace",
        ignoreKey: agent.ignoreKey,
        agentPath: agent.path,
      });
    },
    [deleteAgentMutation],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2.5 border-b border-border/60 px-3 py-2.5">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Agent助手 管理
          </h3>
          <p className="text-xs text-muted-foreground">
            当前工作空间 Agent助手 目录。创建 `AGENT.md` 定义 Agent助手。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-full px-2.5 text-xs sm:px-3"
            onClick={handleCreateAgent}
            disabled={!activeTabId}
            aria-label="创建 Agent助手"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="ml-1.5 hidden sm:inline">创建 Agent助手</span>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 rounded-full border border-border/70 bg-background/85 px-2.5 text-xs transition-colors hover:bg-muted/55 sm:px-3"
                onClick={() => void handleOpenAgentsRoot()}
                disabled={!workspace?.rootUri || !workspaceId}
                aria-label="打开 Agent助手 目录"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span className="ml-1.5 hidden sm:inline">打开目录</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              打开 Agent助手 目录
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 rounded-full border border-border/70 bg-background/85 px-2.5 text-xs transition-colors hover:bg-muted/55 sm:px-3"
                onClick={handleEditMasterAgent}
                disabled={!activeTabId || !masterAgent?.path}
                aria-label="主助手设置"
              >
                <Bot className="h-3.5 w-3.5" />
                <span className="ml-1.5 hidden sm:inline">主助手设置</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              主助手设置
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="border-b border-border/60 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[160px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜索 Agent助手 名称或描述..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
            <Checkbox checked={showAllProjects} onCheckedChange={(v) => setShowAllProjects(v === true)} className="h-3.5 w-3.5" />
            全部项目
          </label>
          <div className="flex items-center rounded-full border border-border/70 bg-muted/40">
            <FilterTab text="全部" selected={statusFilter === 'all'} onSelect={() => setStatusFilter('all')} layoutId="agent-status-filter" />
            <FilterTab text="启用" selected={statusFilter === 'enabled'} onSelect={() => setStatusFilter('enabled')} layoutId="agent-status-filter" />
            <FilterTab text="停用" selected={statusFilter === 'disabled'} onSelect={() => setStatusFilter('disabled')} layoutId="agent-status-filter" />
          </div>
        </div>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {filteredAgents.length > 0 ? (
          <div className="flex flex-col gap-2 pb-1">
            {filteredAgents.map((agent) => {
              const baseRootUri =
                agent.scope === "global" ? undefined : workspace?.rootUri;
              const canOpen = Boolean(
                activeTabId && resolveAgentFolderUri(agent.path, baseRootUri),
              );

              return (
                <ContextMenu
                  key={
                    agent.ignoreKey ||
                    agent.path ||
                    `${agent.scope}:${agent.name}`
                  }
                >
                  <ContextMenuTrigger asChild>
                    <div
                      className="group flex items-center gap-3 rounded-xl bg-zinc-100 px-3 py-2.5 transition-[background-color] duration-200 hover:bg-zinc-200/75 dark:bg-zinc-800 dark:hover:bg-zinc-700/85"
                      onDoubleClick={() => {
                        handleEditAgent(agent);
                      }}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-background/70 text-foreground/80 shadow-sm">
                            {(() => {
                              const iconValue = agent.icon?.trim() ?? "";
                              if (iconValue && /[^a-z0-9-_]/i.test(iconValue)) {
                                return (
                                  <span className="text-sm leading-none text-foreground/80">
                                    {iconValue}
                                  </span>
                                );
                              }
                              const iconKey = normalizeIconName(iconValue || "bot");
                              const colorClass = AGENT_ICON_COLOR_MAP[iconKey] ?? "text-foreground/80";
                              const pascalName = iconKey
                                .split("-")
                                .filter(Boolean)
                                .map((part) => part[0]?.toUpperCase() + part.slice(1))
                                .join("");
                              const StaticIcon = AGENT_ICON_MAP[iconKey];
                              const DynamicIcon = StaticIcon ? null : resolveLucideIcon(pascalName);
                              const AgentIcon = StaticIcon ?? DynamicIcon ?? Bot;
                              return <AgentIcon className={`h-4 w-4 ${colorClass}`} />;
                            })()}
                          </span>
                          <span className="min-w-0 truncate text-sm font-medium text-foreground">
                            {agent.name}
                          </span>
                          {(() => {
                            const label = agent.scope === "project" ? "项目" : "工作空间";
                            const colorClass = agent.scope === "project"
                              ? "bg-sky-100 text-sky-600 dark:bg-sky-900/50 dark:text-sky-400"
                              : "bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-400";
                            return (
                              <span className={`shrink-0 rounded px-1 py-px text-[10px] ${colorClass}`}>
                                {label}
                              </span>
                            );
                          })()}
                          {agent.isSystem ? (
                            <span className="shrink-0 rounded px-1 py-px text-[10px] bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
                              系统
                            </span>
                          ) : null}
                          {agent.model ? (
                            <span className="shrink-0 rounded border border-border/60 bg-background/60 px-1 py-px font-mono text-[10px] text-foreground/70">
                              {agent.model}
                            </span>
                          ) : null}
                        </div>
                        {agent.description?.trim() ? (
                          <p className="truncate pl-1 text-xs text-muted-foreground">
                            {agent.description}
                          </p>
                        ) : null}
                        {agent.toolIds.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {resolveAgentGroups(agent.toolIds).map((group) => {
                              const capMeta = CAP_ICON_MAP[group.id];
                              const CapIcon = capMeta?.icon ?? Blocks;
                              const iconClass = capMeta?.className ?? "text-muted-foreground";
                              const bgClass = CAP_BG_MAP[group.id] ?? "bg-muted/30";
                              return (
                                <span
                                  key={group.id}
                                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] ${bgClass}`}
                                >
                                  <CapIcon className={`h-3 w-3 ${iconClass}`} />
                                  {group.label || group.id}
                                </span>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                      <Switch
                        checked={agent.isEnabled}
                        onCheckedChange={(checked) =>
                          handleToggleAgent(agent, checked)
                        }
                        className="shrink-0 border-zinc-300/70 bg-zinc-200/55 data-[state=checked]:bg-emerald-300/60 dark:border-zinc-600/80 dark:bg-zinc-700/45 dark:data-[state=checked]:bg-emerald-600/45"
                        aria-label={`启用 Agent助手 ${agent.name}`}
                        disabled={updateAgentMutation.isPending}
                      />
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-44">
                    <ContextMenuItem
                      icon={Pencil}
                      onClick={() => handleEditAgent(agent)}
                    >
                      编辑 Agent助手
                    </ContextMenuItem>
                    <ContextMenuItem
                      icon={Eye}
                      onClick={() => handleOpenAgent(agent)}
                      disabled={!canOpen}
                    >
                      查看 Agent助手 目录
                    </ContextMenuItem>
                    {agent.isDeletable ? (
                      <ContextMenuItem
                        icon={Trash2}
                        variant="destructive"
                        onClick={() => void handleDeleteAgent(agent)}
                        disabled={deleteAgentMutation.isPending}
                      >
                        删除 Agent助手
                      </ContextMenuItem>
                    ) : null}
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        ) : null}

        {agentsQuery.isLoading ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            正在加载 Agent助手 列表...
          </div>
        ) : null}

        {!agentsQuery.isLoading &&
        !agentsQuery.isError &&
        !hasNonMasterAgents ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            暂无可用 Agent助手，请创建 `AGENT.md` 来定义 Agent助手。
          </div>
        ) : null}

        {!agentsQuery.isLoading &&
        !agentsQuery.isError &&
        hasNonMasterAgents &&
        filteredAgents.length === 0 ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            没有匹配的 Agent助手，请调整筛选条件后重试。
          </div>
        ) : null}

        {agentsQuery.isError ? (
          <div className="py-9 text-center text-sm text-destructive">
            读取失败：{agentsQuery.error?.message ?? "未知错误"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
