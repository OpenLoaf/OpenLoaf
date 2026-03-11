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
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import {
  buildFileUriFromRoot,
  buildUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";
import { toast } from "sonner";

type AgentScope = "project" | "global";

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

function resolveAgentsRootUri(agentPath: string): string | undefined {
  if (!agentPath) return undefined;
  const normalizedPath = normalizePath(agentPath).replace(/\/+$/, "");
  const lastSlash = normalizedPath.lastIndexOf("/");
  if (lastSlash < 0) return undefined;
  const agentDirPath = normalizedPath.slice(0, lastSlash);
  const parentSlash = agentDirPath.lastIndexOf("/");
  if (parentSlash < 0) return undefined;
  return toFileUri(agentDirPath.slice(0, parentSlash));
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
  const { t } = useTranslation(["settings", "common"]);
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
  const activeTabId = useTabs((s) => s.activeTabId);
  const pushStackItem = useTabRuntime((s) => s.pushStackItem);
  const globalAgentsRootUri = useMemo(() => {
    const globalAgent = agents.find(
      (agent) => agent.scope === "global" && typeof agent.path === "string" && agent.path.trim(),
    );
    return globalAgent ? resolveAgentsRootUri(globalAgent.path) : undefined;
  }, [agents]);

  const hasNonMasterAgents = useMemo(
    () =>
      agents.some((agent) => agent.folderName.toLowerCase() !== "master"),
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
        toast.success(t("settings:agent.deleted"));
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const handleOpenAgentsRoot = useCallback(async () => {
    const rootUri = globalAgentsRootUri;
    if (!rootUri) {
      toast.error(t("settings:agent.workspaceNotFound"));
      return;
    }
    try {
      await mkdirMutation.mutateAsync({
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
    if (!res?.ok) toast.error(res?.reason ?? t("settings:agent.openFolderFailed"));
  }, [activeTabId, globalAgentsRootUri, mkdirMutation, pushStackItem, t]);

  const handleOpenAgent = useCallback(
    (agent: AgentSummary) => {
      if (!activeTabId) return;
      const rootUri = resolveAgentFolderUri(agent.path);
      if (!rootUri) return;
      const stackKey = agent.ignoreKey.trim() || agent.path || agent.name;
      const titlePrefix =
        agent.scope === "global"
          ? t("settings:agent.scopeGlobal")
          : t("settings:agent.scopeProject");
      pushStackItem(activeTabId, {
        id: `agent:${agent.scope}:${stackKey}`,
        sourceKey: `agent:${agent.scope}:${stackKey}`,
        component: "folder-tree-preview",
        title: `${titlePrefix} · ${agent.name}`,
        params: {
          rootUri,
          currentEntryKind: "file",
          projectTitle: agent.name,
        },
      });
    },
    [activeTabId, pushStackItem, t],
  );

  const handleEditAgent = useCallback(
    (agent: AgentSummary) => {
      if (!activeTabId) return;
      pushStackItem(activeTabId, {
        id: `agent-detail:${agent.scope}:${agent.name}`,
        sourceKey: `agent-detail:${agent.scope}:${agent.name}`,
        component: "agent-detail",
        title: t("settings:agent.tabTitle", { name: agent.name }),
        params: {
          agentPath: agent.path,
          scope: agent.scope,
          isSystem: agent.isSystem,
        },
      });
    },
    [activeTabId, pushStackItem],
  );

  const handleCreateAgent = useCallback(() => {
    if (!activeTabId) return;
    pushStackItem(activeTabId, {
      id: `agent-detail:new:${Date.now()}`,
      sourceKey: `agent-detail:new`,
      component: "agent-detail",
      title: t("settings:agent.createTitle"),
      params: {
        isNew: true,
        scope: "global",
      },
    });
  }, [activeTabId, pushStackItem]);

  const handleToggleAgent = useCallback(
    (agent: AgentSummary, nextEnabled: boolean) => {
      if (!agent.ignoreKey.trim()) return;
      updateAgentMutation.mutate({
        scope: "global",
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
        t("settings:agent.deleteConfirm", { name: agent.name }),
      );
      if (!confirmed) return;
      await deleteAgentMutation.mutateAsync({
        scope: "global",
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
            {t("settings:agent.management")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("settings:agent.workspaceDescription")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-full px-2.5 text-xs sm:px-3"
            onClick={handleCreateAgent}
            disabled={!activeTabId}
            aria-label={t("settings:agent.createBtn")}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="ml-1.5 hidden sm:inline">{t("settings:agent.createBtn")}</span>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 rounded-full border border-border/70 bg-background/85 px-2.5 text-xs transition-colors hover:bg-muted/55 sm:px-3"
                onClick={() => void handleOpenAgentsRoot()}
                disabled={!globalAgentsRootUri}
                aria-label={t("settings:agent.openDirTooltip")}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span className="ml-1.5 hidden sm:inline">{t("settings:agent.openDir")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {t("settings:agent.openDirTooltip")}
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
              placeholder={t("settings:agent.searchPlaceholder")}
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
                aria-label={t("common:clear")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
            <Checkbox checked={showAllProjects} onCheckedChange={(v) => setShowAllProjects(v === true)} className="h-3.5 w-3.5" />
            {t("settings:agent.allProjects")}
          </label>
          <div className="flex items-center rounded-full border border-border/70 bg-muted/40">
            <FilterTab text={t("settings:agent.statusAll")} selected={statusFilter === 'all'} onSelect={() => setStatusFilter('all')} layoutId="agent-status-filter" />
            <FilterTab text={t("settings:agent.statusEnabled")} selected={statusFilter === 'enabled'} onSelect={() => setStatusFilter('enabled')} layoutId="agent-status-filter" />
            <FilterTab text={t("settings:agent.statusDisabled")} selected={statusFilter === 'disabled'} onSelect={() => setStatusFilter('disabled')} layoutId="agent-status-filter" />
          </div>
        </div>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {filteredAgents.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 pb-1">
            {filteredAgents.map((agent) => {
              const canOpen = Boolean(
                activeTabId && resolveAgentFolderUri(agent.path),
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
                      className="group flex flex-col gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 transition-[background-color] duration-200 hover:bg-zinc-200/75 dark:bg-zinc-800 dark:hover:bg-zinc-700/85"
                      onDoubleClick={() => {
                        handleEditAgent(agent);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background/70 text-foreground/80 shadow-sm">
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
                            {agent.isSystem
                              ? t(`settings:agentTemplates.${agent.folderName}.name`, { defaultValue: agent.name })
                              : agent.name}
                          </span>
                        </div>
                        <Switch
                          checked={agent.isEnabled}
                          onCheckedChange={(checked) =>
                            handleToggleAgent(agent, checked)
                          }
                          className="shrink-0 border-zinc-300/70 bg-zinc-200/55 data-[state=checked]:bg-emerald-300/60 dark:border-zinc-600/80 dark:bg-zinc-700/45 dark:data-[state=checked]:bg-emerald-600/45"
                          aria-label={t("settings:agent.enableLabel", { name: agent.name })}
                          disabled={updateAgentMutation.isPending}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(() => {
                          const label = agent.scope === "project" ? t("settings:agent.badgeProject") : t("settings:agent.badgeGlobal", { defaultValue: t("settings:agent.badgeWorkspace") });
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
                            {t("settings:agent.system")}
                          </span>
                        ) : null}
                        {agent.model ? (
                          <span className="shrink-0 rounded border border-border/60 bg-background/60 px-1 py-px font-mono text-[10px] text-foreground/70">
                            {agent.model}
                          </span>
                        ) : null}
                        {agent.toolIds.length > 0 ? resolveAgentGroups(agent.toolIds).map((group) => {
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
                              {t(`settings:capabilityGroups.${group.id}`, { defaultValue: group.label || group.id })}
                            </span>
                          );
                        }) : null}
                      </div>
                      {agent.description?.trim() ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {agent.isSystem
                            ? t(`settings:agentTemplates.${agent.folderName}.description`, { defaultValue: agent.description })
                            : agent.description}
                        </p>
                      ) : null}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-44">
                    <ContextMenuItem
                      icon={Pencil}
                      onClick={() => handleEditAgent(agent)}
                    >
                      {t("settings:agent.editBtn")}
                    </ContextMenuItem>
                    <ContextMenuItem
                      icon={Eye}
                      onClick={() => handleOpenAgent(agent)}
                      disabled={!canOpen}
                    >
                      {t("settings:agent.viewDir")}
                    </ContextMenuItem>
                    {agent.isDeletable ? (
                      <ContextMenuItem
                        icon={Trash2}
                        variant="destructive"
                        onClick={() => void handleDeleteAgent(agent)}
                        disabled={deleteAgentMutation.isPending}
                      >
                        {t("settings:agent.deleteBtn")}
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
            {t("settings:agent.loading")}
          </div>
        ) : null}

        {!agentsQuery.isLoading &&
        !agentsQuery.isError &&
        !hasNonMasterAgents ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            {t("settings:agent.noAgents")}
          </div>
        ) : null}

        {!agentsQuery.isLoading &&
        !agentsQuery.isError &&
        hasNonMasterAgents &&
        filteredAgents.length === 0 ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            {t("settings:agent.noMatch")}
          </div>
        ) : null}

        {agentsQuery.isError ? (
          <div className="py-9 text-center text-sm text-destructive">
            {t("settings:agent.loadError", { error: agentsQuery.error?.message ?? "" })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
