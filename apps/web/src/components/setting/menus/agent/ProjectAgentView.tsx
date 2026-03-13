/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client"

import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import dynamic from "next/dynamic"
import { useMutation, useQuery } from "@tanstack/react-query"
import { queryClient, trpc } from "@/utils/trpc"
import { Button } from "@openloaf/ui/button"
import { Switch } from "@openloaf/ui/switch"
import { Input } from "@openloaf/ui/input"
import { FilterTab } from "@openloaf/ui/filter-tab"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip"
import {
  Search, Trash2, X, Plus, Pencil, Eye,
  Bot, Sparkles, FileText, Terminal, Globe, Mail, Calendar,
  LayoutGrid, FolderKanban, Blocks, ArrowRight,
  Copy, FileSearch, FilePen, Code, Link, Users, Settings,
  Image, Video,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import dynamicIconImports from "lucide-react/dynamicIconImports"
import { useLayoutState } from "@/hooks/use-layout-state"
import { useSettingsValues } from "@/hooks/use-settings"
import { useCloudModels } from "@/hooks/use-cloud-models"
import { useInstalledCliProviderIds } from "@/hooks/use-cli-tools-installed"
import { buildChatModelOptions } from "@/lib/provider-models"
import { getModelLabel } from "@/lib/model-registry"
import { toast } from "sonner"

type AgentScope = "project" | "global"

type AgentSummary = {
  name: string
  description: string
  icon: string
  model: string
  toolIds: string[]
  skills: string[]
  path: string
  folderName: string
  ignoreKey: string
  scope: AgentScope
  isEnabled: boolean
  isDeletable: boolean
  isInherited: boolean
  isChildProject: boolean
  isSystem: boolean
}

type StatusFilter = "all" | "enabled" | "disabled"

type CapabilityTool = { id: string; label: string; description: string }
type CapabilityGroup = {
  id: string
  label: string
  description: string
  toolIds: string[]
  tools: CapabilityTool[]
}

const CAP_ICON_MAP: Record<string, { icon: LucideIcon; className: string }> = {
  browser: { icon: Globe, className: "text-ol-blue" },
  "file-read": { icon: FileSearch, className: "text-ol-green" },
  "file-write": { icon: FilePen, className: "text-ol-green" },
  shell: { icon: Terminal, className: "text-ol-text-auxiliary" },
  email: { icon: Mail, className: "text-ol-red" },
  calendar: { icon: Calendar, className: "text-ol-amber" },
  "image-generate": { icon: Image, className: "text-ol-red" },
  "video-generate": { icon: Video, className: "text-ol-purple" },
  widget: { icon: LayoutGrid, className: "text-ol-purple" },
  project: { icon: FolderKanban, className: "text-ol-blue" },
  web: { icon: Link, className: "text-ol-blue" },
  agent: { icon: Users, className: "text-ol-purple" },
  "code-interpreter": { icon: Code, className: "text-ol-amber" },
  system: { icon: Settings, className: "text-ol-text-auxiliary" },
}

const CAP_BG_MAP: Record<string, string> = {
  browser: "bg-ol-blue-bg",
  "file-read": "bg-ol-green-bg",
  "file-write": "bg-ol-green-bg",
  shell: "bg-ol-surface-muted",
  email: "bg-ol-red-bg",
  calendar: "bg-ol-amber-bg",
  "image-generate": "bg-ol-red-bg",
  "video-generate": "bg-ol-purple-bg",
  widget: "bg-ol-purple-bg",
  project: "bg-ol-blue-bg",
  web: "bg-ol-blue-bg",
  agent: "bg-ol-purple-bg",
  "code-interpreter": "bg-ol-amber-bg",
  system: "bg-ol-surface-muted",
}

const AGENT_ICON_MAP: Partial<Record<string, LucideIcon>> = {
  bot: Bot, sparkles: Sparkles, "file-text": FileText, terminal: Terminal,
  globe: Globe, mail: Mail, calendar: Calendar, "layout-grid": LayoutGrid,
  "folder-kanban": FolderKanban,
}

const AGENT_ICON_COLOR_MAP: Record<string, string> = {
  bot: "text-ol-purple", sparkles: "text-ol-purple",
  "file-text": "text-ol-green", terminal: "text-ol-text-auxiliary",
  globe: "text-ol-blue", mail: "text-ol-red",
  calendar: "text-ol-amber", "layout-grid": "text-ol-purple",
  "folder-kanban": "text-ol-blue",
}

function normalizeIconName(value: string): string {
  return value.trim().replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase()
}

const LUCIDE_ICON_CACHE = new Map<string, LucideIcon>()
function resolveLucideIcon(name: string): LucideIcon | null {
  if (!name) return null
  const cached = LUCIDE_ICON_CACHE.get(name)
  if (cached) return cached
  const importer = (dynamicIconImports as Record<string, () => Promise<{ default: LucideIcon }>>)[name]
  if (!importer) return null
  const Component = dynamic(importer, { ssr: false }) as unknown as LucideIcon
  LUCIDE_ICON_CACHE.set(name, Component)
  return Component
}

/** 从全局范围复制 Agent 的选择对话框 */
function CopyAgentDialog({
  open,
  onOpenChange,
  agents,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  agents: AgentSummary[]
  onSelect: (agent: AgentSummary) => void
}) {
  const { t } = useTranslation(["settings"])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings:agent.copyDialogTitleGlobal")}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[480px] space-y-1.5 overflow-y-auto py-2">
          {agents.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("settings:agent.noGlobalAgents")}
            </p>
          ) : (
            agents.map((agent) => (
              <button
                key={agent.path}
                type="button"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60"
                onClick={() => onSelect(agent)}
              >
                <AgentIconDisplay icon={agent.icon} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{agent.name}</div>
                  {agent.description ? (
                    <div className="truncate text-xs text-muted-foreground">{agent.description}</div>
                  ) : null}
                </div>
                {agent.folderName === "master" ? (
                  <span className="shrink-0 rounded bg-ol-purple-bg px-1 py-px text-[10px] text-ol-purple">
                    {t("settings:agent.master")}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AgentIconDisplay({ icon }: { icon: string }) {
  const iconValue = icon?.trim() ?? ""
  if (iconValue && /[^a-z0-9-_]/i.test(iconValue)) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-background/70 text-foreground/80 shadow-sm">
        <span className="text-sm leading-none">{iconValue}</span>
      </span>
    )
  }
  const iconKey = normalizeIconName(iconValue || "bot")
  const colorClass = AGENT_ICON_COLOR_MAP[iconKey] ?? "text-foreground/80"
  const pascalName = iconKey.split("-").filter(Boolean).map((p) => p[0]?.toUpperCase() + p.slice(1)).join("")
  const StaticIcon = AGENT_ICON_MAP[iconKey]
  const DynamicIcon = StaticIcon ? null : resolveLucideIcon(pascalName)
  const AgentIcon = StaticIcon ?? DynamicIcon ?? Bot
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-background/70 text-foreground/80 shadow-sm">
      <AgentIcon className={`h-4 w-4 ${colorClass}`} />
    </span>
  )
}

export function ProjectAgentView({ projectId }: { projectId: string }) {
  const { t } = useTranslation(["settings", "common"])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [copyDialogOpen, setCopyDialogOpen] = useState(false)
  const [copyAsMaster, setCopyAsMaster] = useState(false)
  const { providerItems } = useSettingsValues()
  const { models: cloudModels } = useCloudModels()
  const installedCliProviderIds = useInstalledCliProviderIds()

  // 逻辑：仅查询项目级 agent。
  const agentsQuery = useQuery(
    trpc.settings.getAgents.queryOptions({ projectId, scopeFilter: "project" }),
  )
  const agents = (agentsQuery.data ?? []) as AgentSummary[]

  // 逻辑：查询全局 agent（用于复制对话框）。
  const globalAgentsQuery = useQuery(
    trpc.settings.getAgents.queryOptions({ scopeFilter: "global" }),
  )
  const globalAgents = (globalAgentsQuery.data ?? []) as AgentSummary[]

  const capGroupsQuery = useQuery(trpc.settings.getCapabilityGroups.queryOptions())
  const capGroups = useMemo(
    () => (capGroupsQuery.data ?? []) as CapabilityGroup[],
    [capGroupsQuery.data],
  )
  const resolveAgentGroups = useCallback(
    (toolIds: string[]) => {
      if (!toolIds?.length || capGroups.length === 0) return []
      const toolIdSet = new Set(toolIds)
      return capGroups.filter((group) => {
        const ids = group.tools?.length ? group.tools.map((t) => t.id) : group.toolIds
        return ids.some((id) => toolIdSet.has(id))
      })
    },
    [capGroups],
  )

  const pushStackItem = useLayoutState((s) => s.pushStackItem)

  const masterAgent = useMemo(
    () => agents.find((a) => a.folderName === "master"),
    [agents],
  )
  const hasMaster = Boolean(masterAgent)
  const globalAgentFolderSet = useMemo(
    () => new Set(globalAgents.map((agent) => agent.folderName)),
    [globalAgents],
  )
  // 逻辑：合并本地/云端模型配置，用于解析 Agent 的模型显示名。
  const agentModelMap = useMemo(() => {
    const localOptions = buildChatModelOptions(
      "local",
      providerItems,
      cloudModels,
      installedCliProviderIds,
    )
    const cloudOptions = buildChatModelOptions(
      "cloud",
      providerItems,
      cloudModels,
      installedCliProviderIds,
    )
    const merged = new Map<string, ReturnType<typeof buildChatModelOptions>[number]>()
    for (const option of [...cloudOptions, ...localOptions]) {
      if (merged.has(option.id)) continue
      merged.set(option.id, option)
    }
    return merged
  }, [providerItems, cloudModels, installedCliProviderIds])
  /** Resolve display label for agent model id. */
  const resolveModelLabel = useCallback(
    (modelId: string) => {
      const trimmed = modelId.trim()
      if (!trimmed) return ""
      const option = agentModelMap.get(trimmed)
      if (!option) return trimmed
      if (option.modelDefinition) {
        return getModelLabel(option.modelDefinition)
      }
      return option.modelId || trimmed
    },
    [agentModelMap],
  )

  const filteredAgents = useMemo(() => {
    const filtered = agents.filter((agent) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = agent.name.toLowerCase().includes(q)
        const matchDesc = agent.description.toLowerCase().includes(q)
        if (!matchName && !matchDesc) return false
      }
      if (statusFilter === "enabled" && !agent.isEnabled) return false
      if (statusFilter === "disabled" && agent.isEnabled) return false
      return true
    })
    // 逻辑：主助手排第一，系统 Agent 其次。
    return filtered.sort((a, b) => {
      if (a.folderName === "master" && b.folderName !== "master") return -1
      if (a.folderName !== "master" && b.folderName === "master") return 1
      if (a.isSystem && !b.isSystem) return -1
      if (!a.isSystem && b.isSystem) return 1
      return 0
    })
  }, [agents, searchQuery, statusFilter])

  const hasNonMasterAgents = useMemo(
    () => agents.some((a) => a.folderName !== "master"),
    [agents],
  )

  const updateAgentMutation = useMutation(
    trpc.settings.setAgentEnabled.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getAgents.queryOptions({ projectId, scopeFilter: "project" }).queryKey,
        })
      },
      onError: (error) => toast.error(error.message),
    }),
  )

  const deleteAgentMutation = useMutation(
    trpc.settings.deleteAgent.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getAgents.queryOptions({ projectId, scopeFilter: "project" }).queryKey,
        })
        toast.success(t("settings:agent.deleted"))
      },
      onError: (error) => toast.error(error.message),
    }),
  )

  const copyAgentMutation = useMutation(
    trpc.settings.copyAgentToProject.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getAgents.queryOptions({ projectId, scopeFilter: "project" }).queryKey,
        })
        toast.success(t("settings:agent.copied"))
      },
      onError: (error) => toast.error(error.message),
    }),
  )

  const handleEditAgent = useCallback(
    (agent: AgentSummary) => {
      pushStackItem({
        id: `agent-detail:${agent.scope}:${agent.name}`,
        sourceKey: `agent-detail:${agent.scope}:${agent.name}`,
        component: "agent-detail",
        title: t("settings:agent.tabTitle", { name: agent.name }),
        params: {
          agentPath: agent.path,
          scope: agent.scope,
          projectId,
          isSystem: agent.isSystem,
        },
      })
    },
    [projectId, pushStackItem],
  )

  const handleCreateBlank = useCallback(() => {
    pushStackItem({
      id: `agent-detail:new:${Date.now()}`,
      sourceKey: "agent-detail:new",
      component: "agent-detail",
      title: t("settings:agent.createTitle"),
      params: { isNew: true, scope: "project", projectId },
    })
  }, [projectId, pushStackItem])

  const handleOpenGlobalAgents = useCallback(() => {
    pushStackItem({
      id: "global-agents",
      sourceKey: "global-agents",
      component: "agent-management",
      title: t("settings:agent.globalTitle"),
      params: {},
    })
  }, [pushStackItem])

  const handleToggleAgent = useCallback(
    (agent: AgentSummary, nextEnabled: boolean) => {
      if (!agent.ignoreKey.trim()) return
      updateAgentMutation.mutate({
        scope: "project",
        projectId,
        ignoreKey: agent.ignoreKey,
        enabled: nextEnabled,
      })
    },
    [projectId, updateAgentMutation],
  )

  const handleDeleteAgent = useCallback(
    async (agent: AgentSummary) => {
      if (!agent.ignoreKey.trim()) return
      const confirmed = window.confirm(
        t("settings:agent.deleteConfirm", { name: agent.name }),
      )
      if (!confirmed) return
      await deleteAgentMutation.mutateAsync({
        scope: "project",
        projectId,
        ignoreKey: agent.ignoreKey,
        agentPath: agent.path,
      })
    },
    [deleteAgentMutation, projectId],
  )

  const handleCopyFromGlobal = useCallback(
    (agent: AgentSummary) => {
      setCopyDialogOpen(false)
      copyAgentMutation.mutate({
        sourceAgentPath: agent.path,
        projectId,
        asMaster: copyAsMaster,
      })
    },
    [copyAgentMutation, copyAsMaster, projectId],
  )

  const handleStartCopyMaster = useCallback(() => {
    setCopyAsMaster(true)
    setCopyDialogOpen(true)
  }, [])

  const handleStartCopyNormal = useCallback(() => {
    setCopyAsMaster(false)
    setCopyDialogOpen(true)
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 顶部操作栏 */}
      <div className="flex flex-wrap items-start justify-between gap-2.5 border-b border-border/60 px-3 py-2.5">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {t("settings:agent.projectTitle")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("settings:agent.projectDescription")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-full px-2.5 text-xs sm:px-3"

              >
                <Plus className="h-3.5 w-3.5" />
                <span className="ml-1.5 hidden sm:inline">{t("settings:agent.createBtn")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {!hasMaster ? (
                <DropdownMenuItem onClick={handleStartCopyMaster}>
                  <Bot className="mr-2 h-4 w-4" />
                  {t("settings:agent.createMaster")}
                </DropdownMenuItem>
              ) : null}
              {!hasMaster ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem onClick={handleCreateBlank}>
                <Plus className="mr-2 h-4 w-4" />
                {t("settings:agent.createBlank")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleStartCopyNormal}>
                <Copy className="mr-2 h-4 w-4" />
                {t("settings:agent.copyFromGlobal")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 rounded-full border border-border/70 bg-background/85 px-2.5 text-xs transition-colors hover:bg-muted/55 sm:px-3"
                onClick={handleOpenGlobalAgents}

              >
                <ArrowRight className="h-3.5 w-3.5" />
                <span className="ml-1.5 hidden sm:inline">{t("settings:agent.viewGlobal")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {t("settings:agent.viewGlobal")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* 搜索和过滤 */}
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
          <div className="flex items-center rounded-full border border-border/70 bg-muted/40">
            <FilterTab text={t("settings:agent.statusAll")} selected={statusFilter === "all"} onSelect={() => setStatusFilter("all")} layoutId="project-agent-filter" />
            <FilterTab text={t("settings:agent.statusEnabled")} selected={statusFilter === "enabled"} onSelect={() => setStatusFilter("enabled")} layoutId="project-agent-filter" />
            <FilterTab text={t("settings:agent.statusDisabled")} selected={statusFilter === "disabled"} onSelect={() => setStatusFilter("disabled")} layoutId="project-agent-filter" />
          </div>
        </div>
      </div>

      {/* Agent 列表 */}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {filteredAgents.length > 0 ? (
          <div className="flex flex-col gap-2 pb-1">
            {filteredAgents.map((agent) => (
              <ContextMenu key={agent.ignoreKey || agent.path || `${agent.scope}:${agent.name}`}>
                <ContextMenuTrigger asChild>
                  <div
                    className="group flex items-center gap-3 rounded-xl bg-ol-blue-bg px-3 py-2.5 transition-[background-color] duration-200 hover:bg-ol-blue-bg-hover"
                    onDoubleClick={() => handleEditAgent(agent)}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <AgentIconDisplay icon={agent.icon} />
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">
                          {agent.name}
                        </span>
                        {agent.folderName === "master" ? (
                          <span className="shrink-0 rounded px-1 py-px text-[10px] bg-ol-purple-bg text-ol-purple">
                            {t("settings:agent.master")}
                          </span>
                        ) : null}
                        {agent.isSystem ? (
                          <span className="shrink-0 rounded px-1 py-px text-[10px] bg-ol-blue-bg text-ol-blue">
                            {t("settings:agent.system")}
                          </span>
                        ) : null}
                        {/* 逻辑：当前项目 Agent 与全局同名时显示覆盖标记。 */}
                        {!agent.isInherited && globalAgentFolderSet.has(agent.folderName) ? (
                          <span className="shrink-0 rounded px-1 py-px text-[10px] bg-ol-amber-bg text-ol-amber">
                            {t("settings:agent.override")}
                          </span>
                        ) : null}
                        {agent.model ? (
                          <span className="shrink-0 rounded border border-border/60 bg-background/60 px-1 py-px font-mono text-[10px] text-foreground/70">
                            {resolveModelLabel(agent.model)}
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
                            const capMeta = CAP_ICON_MAP[group.id]
                            const CapIcon = capMeta?.icon ?? Blocks
                            const iconClass = capMeta?.className ?? "text-muted-foreground"
                            const bgClass = CAP_BG_MAP[group.id] ?? "bg-muted/30"
                            return (
                              <span key={group.id} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] ${bgClass}`}>
                                <CapIcon className={`h-3 w-3 ${iconClass}`} />
                                {group.label || group.id}
                              </span>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                    <Switch
                      checked={agent.isEnabled}
                      onCheckedChange={(checked) => handleToggleAgent(agent, checked)}
                      className="shrink-0 border-ol-divider bg-ol-surface-muted data-[state=checked]:bg-ol-green/60 dark:data-[state=checked]:bg-ol-green/45"
                      aria-label={t("settings:agent.enableLabel", { name: agent.name })}
                      disabled={updateAgentMutation.isPending}
                    />
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-44">
                  <ContextMenuItem icon={Pencil} onClick={() => handleEditAgent(agent)}>
                    {t("settings:agent.editBtn")}
                  </ContextMenuItem>
                  <ContextMenuItem
                    icon={Trash2}
                    variant="destructive"
                    onClick={() => void handleDeleteAgent(agent)}
                    disabled={deleteAgentMutation.isPending}
                  >
                    {t("settings:agent.deleteBtn")}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        ) : null}

        {agentsQuery.isLoading ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            {t("settings:agent.loading")}
          </div>
        ) : null}

        {!agentsQuery.isLoading && !agentsQuery.isError && !hasNonMasterAgents && !hasMaster ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            {t("settings:agent.noProjectAgents")}
          </div>
        ) : null}

        {!agentsQuery.isLoading && !agentsQuery.isError && hasNonMasterAgents && filteredAgents.length === 0 ? (
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

      {/* 复制对话框 */}
      <CopyAgentDialog
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        agents={globalAgents}
        onSelect={handleCopyFromGlobal}
      />
    </div>
  )
}
