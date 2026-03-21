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
import { Input } from "@openloaf/ui/input";
import {
  Search, Trash2, X, FolderOpen, Eye, Plus, Pencil, RefreshCw,
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
import { useLayoutState } from "@/hooks/use-layout-state";
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

/** Build the scoped agents folder URI for project/global roots. */
function buildScopedAgentsUri(rootUri: string): string {
  const normalizedRoot = rootUri.trim().replace(/[/\\]+$/, "");
  if (!normalizedRoot) return "";
  if (normalizedRoot.endsWith("/.openloaf")) {
    return normalizedRoot.startsWith("file://")
      ? buildFileUriFromRoot(normalizedRoot, "agents")
      : `${normalizedRoot}/agents`;
  }
  return normalizedRoot.startsWith("file://")
    ? buildFileUriFromRoot(normalizedRoot, ".openloaf/agents")
    : `${normalizedRoot}/.openloaf/agents`;
}

const CAP_ICON_MAP: Record<string, { icon: LucideIcon; className: string }> = {
  browser: { icon: Globe, className: "text-foreground" },
  "file-read": { icon: FileSearch, className: "text-foreground" },
  "file-write": { icon: FilePen, className: "text-foreground" },
  shell: { icon: Terminal, className: "text-muted-foreground" },
  email: { icon: Mail, className: "text-foreground" },
  calendar: { icon: Calendar, className: "text-foreground" },
  "image-generate": { icon: Image, className: "text-foreground" },
  "video-generate": { icon: Video, className: "text-foreground" },
  widget: { icon: LayoutGrid, className: "text-foreground" },
  project: { icon: FolderKanban, className: "text-foreground" },
  web: { icon: Link, className: "text-foreground" },
  agent: { icon: Users, className: "text-foreground" },
  "code-interpreter": { icon: Code, className: "text-foreground" },
  system: { icon: Settings, className: "text-muted-foreground" },
};

const CAP_BG_MAP: Record<string, string> = {
  browser: "bg-secondary",
  "file-read": "bg-secondary",
  "file-write": "bg-secondary",
  shell: "bg-secondary",
  email: "bg-secondary",
  calendar: "bg-secondary",
  "image-generate": "bg-secondary",
  "video-generate": "bg-secondary",
  widget: "bg-secondary",
  project: "bg-secondary",
  web: "bg-secondary",
  agent: "bg-secondary",
  "code-interpreter": "bg-secondary",
  system: "bg-secondary",
};

/** Card color palette for the expert center grid. */
const CARD_COLOR_PALETTE = [
  { tag: "text-orange-600 dark:text-orange-400", tagBorder: "border-orange-400/60 dark:border-orange-500/40", avatar: "from-orange-100 to-amber-50 dark:from-orange-900/25 dark:to-amber-900/10", icon: "text-orange-500 dark:text-orange-400" },
  { tag: "text-purple-600 dark:text-purple-400", tagBorder: "border-purple-400/60 dark:border-purple-500/40", avatar: "from-purple-100 to-violet-50 dark:from-purple-900/25 dark:to-violet-900/10", icon: "text-purple-500 dark:text-purple-400" },
  { tag: "text-emerald-600 dark:text-emerald-400", tagBorder: "border-emerald-400/60 dark:border-emerald-500/40", avatar: "from-emerald-100 to-green-50 dark:from-emerald-900/25 dark:to-green-900/10", icon: "text-emerald-500 dark:text-emerald-400" },
  { tag: "text-blue-600 dark:text-blue-400", tagBorder: "border-blue-400/60 dark:border-blue-500/40", avatar: "from-blue-100 to-sky-50 dark:from-blue-900/25 dark:to-sky-900/10", icon: "text-blue-500 dark:text-blue-400" },
  { tag: "text-pink-600 dark:text-pink-400", tagBorder: "border-pink-400/60 dark:border-pink-500/40", avatar: "from-pink-100 to-rose-50 dark:from-pink-900/25 dark:to-rose-900/10", icon: "text-pink-500 dark:text-pink-400" },
  { tag: "text-teal-600 dark:text-teal-400", tagBorder: "border-teal-400/60 dark:border-teal-500/40", avatar: "from-teal-100 to-cyan-50 dark:from-teal-900/25 dark:to-cyan-900/10", icon: "text-teal-500 dark:text-teal-400" },
  { tag: "text-rose-600 dark:text-rose-400", tagBorder: "border-rose-400/60 dark:border-rose-500/40", avatar: "from-rose-100 to-pink-50 dark:from-rose-900/25 dark:to-pink-900/10", icon: "text-rose-500 dark:text-rose-400" },
  { tag: "text-indigo-600 dark:text-indigo-400", tagBorder: "border-indigo-400/60 dark:border-indigo-500/40", avatar: "from-indigo-100 to-blue-50 dark:from-indigo-900/25 dark:to-blue-900/10", icon: "text-indigo-500 dark:text-indigo-400" },
];

/** Simple string hash for consistent color assignment. */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

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
  bot: "text-foreground",
  sparkles: "text-foreground",
  "file-text": "text-foreground",
  terminal: "text-muted-foreground",
  globe: "text-foreground",
  mail: "text-foreground",
  calendar: "text-foreground",
  "layout-grid": "text-foreground",
  "folder-kanban": "text-foreground",
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
  return <GlobalAgentView />;
}

/** Lazy-loaded ProjectAgentView to avoid circular imports. */
const ProjectAgentViewLazy = dynamic(
  () => import("./ProjectAgentView").then((m) => ({ default: m.ProjectAgentView })),
  { ssr: false },
);

function ProjectAgentView({ projectId }: { projectId: string }) {
  return <ProjectAgentViewLazy projectId={projectId} />;
}

function GlobalAgentView() {
  const { t } = useTranslation(["settings", "common"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const agentsQuery = useQuery(trpc.settings.getAgents.queryOptions({ includeAllProjects: true }));
  const agents = (agentsQuery.data ?? []) as AgentSummary[];
  const capGroupsQuery = useQuery(trpc.settings.getCapabilityGroups.queryOptions());
  const capGroups = useMemo(
    () => (capGroupsQuery.data ?? []) as CapabilityGroup[],
    [capGroupsQuery.data],
  );
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
  const pushStackItem = useLayoutState((s) => s.pushStackItem);
  const globalAgentsRootUri = useMemo(() => {
    const globalAgent = agents.find(
      (agent) => agent.scope === "global" && typeof agent.path === "string" && agent.path.trim(),
    );
    return globalAgent ? resolveAgentsRootUri(globalAgent.path) : undefined;
  }, [agents]);

  const hasNonMasterAgents = useMemo(
    () => agents.some((agent) => agent.folderName.toLowerCase() !== "master"),
    [agents],
  );

  /** Non-master agents for category computation. */
  const nonMasterAgents = useMemo(
    () => agents.filter((a) => a.folderName.toLowerCase() !== "master"),
    [agents],
  );

  /** Category tabs derived from capability groups. */
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const agent of nonMasterAgents) {
      const groups = resolveAgentGroups(agent.toolIds);
      for (const group of groups) {
        counts.set(group.id, (counts.get(group.id) || 0) + 1);
      }
    }
    return [
      { id: "all", label: t("settings:agent.categoryAll"), count: nonMasterAgents.length },
      ...capGroups
        .filter((g) => counts.has(g.id))
        .map((g) => ({
          id: g.id,
          label: t(`settings:capabilityGroups.${g.id}`, { defaultValue: g.label || g.id }),
          count: counts.get(g.id) || 0,
        })),
    ];
  }, [nonMasterAgents, capGroups, resolveAgentGroups, t]);

  const filteredAgents = useMemo(() => {
    const filtered = nonMasterAgents.filter((agent) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = agent.name.toLowerCase().includes(q);
        const matchDesc = agent.description.toLowerCase().includes(q);
        const agentGroups = resolveAgentGroups(agent.toolIds);
        const groupLabels = agentGroups.map((group) => `${group.label} ${group.id}`).join(" ");
        const matchCaps = groupLabels.toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchCaps) return false;
      }
      if (selectedCategory !== "all") {
        const groups = resolveAgentGroups(agent.toolIds);
        if (!groups.some((g) => g.id === selectedCategory)) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => {
      if (a.isSystem && !b.isSystem) return -1;
      if (!a.isSystem && b.isSystem) return 1;
      return 0;
    });
  }, [nonMasterAgents, searchQuery, selectedCategory, resolveAgentGroups]);

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
      toast.error(t("settings:agent.projectSpaceNotFound"));
      return;
    }
    try {
      await mkdirMutation.mutateAsync({ uri: ".openloaf/agents", recursive: true });
    } catch {
      return;
    }
    const api = window.openloafElectron;
    if (!api?.openPath) {
      const agentsUri = buildScopedAgentsUri(rootUri);
      pushStackItem({
        id: `agents-root:global`,
        sourceKey: `agents-root:global`,
        component: "folder-tree-preview",
        title: "Agents",
        params: { rootUri: agentsUri, currentUri: "" },
      });
      return;
    }
    const agentsUri = buildScopedAgentsUri(rootUri);
    const res = await api.openPath({ uri: agentsUri });
    if (!res?.ok) toast.error(res?.reason ?? t("settings:agent.openFolderFailed"));
  }, [globalAgentsRootUri, mkdirMutation, pushStackItem, t]);

  const handleOpenAgent = useCallback(
    (agent: AgentSummary) => {
      const rootUri = resolveAgentFolderUri(agent.path);
      if (!rootUri) return;
      const stackKey = agent.ignoreKey.trim() || agent.path || agent.name;
      const titlePrefix =
        agent.scope === "global" ? t("settings:agent.scopeGlobal") : t("settings:agent.scopeProject");
      pushStackItem({
        id: `agent:${agent.scope}:${stackKey}`,
        sourceKey: `agent:${agent.scope}:${stackKey}`,
        component: "folder-tree-preview",
        title: `${titlePrefix} · ${agent.name}`,
        params: { rootUri, currentEntryKind: "file", projectTitle: agent.name },
      });
    },
    [pushStackItem, t],
  );

  const handleEditAgent = useCallback(
    (agent: AgentSummary) => {
      pushStackItem({
        id: `agent-detail:${agent.scope}:${agent.name}`,
        sourceKey: `agent-detail:${agent.scope}:${agent.name}`,
        component: "agent-detail",
        title: t("settings:agent.tabTitle", { name: agent.name }),
        params: { agentPath: agent.path, scope: agent.scope, isSystem: agent.isSystem },
      });
    },
    [pushStackItem, t],
  );

  const handleCreateAgent = useCallback(() => {
    pushStackItem({
      id: `agent-detail:new:${Date.now()}`,
      sourceKey: `agent-detail:new`,
      component: "agent-detail",
      title: t("settings:agent.createTitle"),
      params: { isNew: true, scope: "global" },
    });
  }, [pushStackItem, t]);

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
      const confirmed = window.confirm(t("settings:agent.deleteConfirm", { name: agent.name }));
      if (!confirmed) return;
      await deleteAgentMutation.mutateAsync({
        scope: "global",
        ignoreKey: agent.ignoreKey,
        agentPath: agent.path,
      });
    },
    [deleteAgentMutation, t],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5 pb-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {t("settings:agent.expertCenter")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("settings:agent.expertCenterDesc")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("settings:agent.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-56 rounded-3xl border-border/70 bg-background/90 pl-9 pr-9 text-sm"
            />
            {searchQuery ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-3xl"
                onClick={() => setSearchQuery("")}
                aria-label={t("common:clear")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-3xl text-muted-foreground hover:text-foreground"
                onClick={handleCreateAgent}
                aria-label={t("settings:agent.createBtn")}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {t("settings:agent.createBtn")}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-3xl text-muted-foreground hover:text-foreground"
                onClick={() => void handleOpenAgentsRoot()}
                disabled={!globalAgentsRootUri}
                aria-label={t("settings:agent.openDirTooltip")}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {t("settings:agent.openDirTooltip")}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-3xl text-muted-foreground hover:text-foreground"
                onClick={() =>
                  queryClient.invalidateQueries({
                    queryKey: trpc.settings.getAgents.queryOptions().queryKey,
                  })
                }
              >
                <RefreshCw
                  className={`h-4 w-4 ${agentsQuery.isFetching ? "animate-spin" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {t("settings:agent.refresh", { defaultValue: "刷新" })}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-border/40 px-5">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors ${
              selectedCategory === cat.id
                ? "border-b-2 border-purple-500 text-purple-600 dark:border-purple-400 dark:text-purple-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.label}
            <span className="ml-1 text-xs opacity-60">({cat.count})</span>
          </button>
        ))}
      </div>

      {/* Agent grid */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {filteredAgents.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredAgents.map((agent) => {
              const canOpen = Boolean(resolveAgentFolderUri(agent.path));
              const colorIdx = simpleHash(agent.name) % CARD_COLOR_PALETTE.length;
              const palette = CARD_COLOR_PALETTE[colorIdx]!;
              const agentGroups = resolveAgentGroups(agent.toolIds);
              const primaryGroup = agentGroups[0];
              const tagLabel = primaryGroup
                ? t(`settings:capabilityGroups.${primaryGroup.id}`, {
                    defaultValue: primaryGroup.label || primaryGroup.id,
                  })
                : agent.scope === "project"
                  ? t("settings:agent.badgeProject")
                  : t("settings:agent.scopeGlobal");
              const displayName = agent.isSystem
                ? t(`settings:agentTemplates.${agent.folderName}.name`, { defaultValue: agent.name })
                : agent.name;
              const displayDesc = agent.isSystem
                ? t(`settings:agentTemplates.${agent.folderName}.description`, {
                    defaultValue: agent.description,
                  })
                : agent.description;

              return (
                <ContextMenu
                  key={agent.ignoreKey || agent.path || `${agent.scope}:${agent.name}`}
                >
                  <ContextMenuTrigger asChild>
                    <div
                      className="group relative flex cursor-pointer flex-col items-center gap-2.5 rounded-3xl border border-dashed border-border/60 px-4 pb-5 pt-6 transition-all duration-200 hover:border-purple-400 hover:shadow-none dark:hover:border-purple-500/60"
                      onDoubleClick={() => handleEditAgent(agent)}
                    >
                      {/* Disabled overlay */}
                      {!agent.isEnabled ? (
                        <div className="absolute inset-0 z-10 rounded-3xl bg-background/50" />
                      ) : null}

                      {/* Circular avatar */}
                      <div
                        className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${palette.avatar}`}
                      >
                        {(() => {
                          const iconValue = agent.icon?.trim() ?? "";
                          if (iconValue && /[^a-z0-9-_]/i.test(iconValue)) {
                            return (
                              <span className="text-2xl leading-none">{iconValue}</span>
                            );
                          }
                          const iconKey = normalizeIconName(iconValue || "bot");
                          const pascalName = iconKey
                            .split("-")
                            .filter(Boolean)
                            .map((part) => part[0]?.toUpperCase() + part.slice(1))
                            .join("");
                          const StaticIcon = AGENT_ICON_MAP[iconKey];
                          const DynamicIcon = StaticIcon ? null : resolveLucideIcon(pascalName);
                          const AgentIcon = StaticIcon ?? DynamicIcon ?? Bot;
                          return <AgentIcon className={`h-9 w-9 ${palette.icon}`} />;
                        })()}
                      </div>

                      {/* Name */}
                      <span className="max-w-full truncate text-sm font-semibold text-foreground">
                        {displayName}
                      </span>

                      {/* Tag badge */}
                      <span
                        className={`rounded-full border border-dashed px-3 py-0.5 text-xs font-medium ${palette.tag} ${palette.tagBorder}`}
                      >
                        {tagLabel}
                      </span>

                      {/* Description */}
                      {displayDesc?.trim() ? (
                        <p className="line-clamp-2 w-full text-center text-xs leading-relaxed text-muted-foreground">
                          {displayDesc}
                        </p>
                      ) : null}

                      {/* Hover: summon button */}
                      <div className="absolute inset-x-3 bottom-3 z-20 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <Button
                          type="button"
                          className="h-9 w-full rounded-3xl bg-foreground text-sm font-medium text-background shadow-none hover:bg-foreground/90"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditAgent(agent);
                          }}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          {t("settings:agent.summonBtn")}
                        </Button>
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48">
                    <ContextMenuItem icon={Pencil} onClick={() => handleEditAgent(agent)}>
                      {t("settings:agent.editBtn")}
                    </ContextMenuItem>
                    <ContextMenuItem
                      icon={Eye}
                      onClick={() => handleOpenAgent(agent)}
                      disabled={!canOpen}
                    >
                      {t("settings:agent.viewDir")}
                    </ContextMenuItem>
                    <ContextMenuItem
                      icon={agent.isEnabled ? X : Plus}
                      onClick={() => handleToggleAgent(agent, !agent.isEnabled)}
                      disabled={updateAgentMutation.isPending || !agent.ignoreKey.trim()}
                    >
                      {agent.isEnabled
                        ? t("settings:agent.statusDisabled")
                        : t("settings:agent.statusEnabled")}
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
          <div className="py-16 text-center text-sm text-muted-foreground">
            {t("settings:agent.loading")}
          </div>
        ) : null}

        {!agentsQuery.isLoading && !agentsQuery.isError && !hasNonMasterAgents ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {t("settings:agent.noAgents")}
          </div>
        ) : null}

        {!agentsQuery.isLoading &&
        !agentsQuery.isError &&
        hasNonMasterAgents &&
        filteredAgents.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {t("settings:agent.noMatch")}
          </div>
        ) : null}

        {agentsQuery.isError ? (
          <div className="py-16 text-center text-sm text-destructive">
            {t("settings:agent.loadError", { error: agentsQuery.error?.message ?? "" })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
