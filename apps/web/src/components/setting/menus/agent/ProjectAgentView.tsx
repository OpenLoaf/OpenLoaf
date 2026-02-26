"use client"

import { useCallback, useMemo, useState } from "react"
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
import { useWorkspace } from "@/components/workspace/workspaceContext"
import { useTabs } from "@/hooks/use-tabs"
import { useTabRuntime } from "@/hooks/use-tab-runtime"
import { useSettingsValues } from "@/hooks/use-settings"
import { useCloudModels } from "@/hooks/use-cloud-models"
import { useInstalledCliProviderIds } from "@/hooks/use-cli-tools-installed"
import { buildChatModelOptions } from "@/lib/provider-models"
import { getModelLabel } from "@/lib/model-registry"
import { toast } from "sonner"

type AgentScope = "workspace" | "project" | "global"

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
}

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
}

const AGENT_ICON_MAP: Partial<Record<string, LucideIcon>> = {
  bot: Bot, sparkles: Sparkles, "file-text": FileText, terminal: Terminal,
  globe: Globe, mail: Mail, calendar: Calendar, "layout-grid": LayoutGrid,
  "folder-kanban": FolderKanban,
}

const AGENT_ICON_COLOR_MAP: Record<string, string> = {
  bot: "text-indigo-500", sparkles: "text-violet-500",
  "file-text": "text-emerald-500", terminal: "text-slate-500",
  globe: "text-sky-500", mail: "text-red-500",
  calendar: "text-orange-500", "layout-grid": "text-violet-500",
  "folder-kanban": "text-cyan-500",
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

/** 从工作空间复制 Agent 的选择对话框 */
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>选择要复制的工作空间 Agent助手</DialogTitle>
        </DialogHeader>
        <div className="max-h-[480px] space-y-1.5 overflow-y-auto py-2">
          {agents.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              工作空间暂无可用 Agent助手
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
                  <span className="shrink-0 rounded bg-violet-100 px-1 py-px text-[10px] text-violet-600 dark:bg-violet-900/50 dark:text-violet-400">
                    主助手
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

  // 逻辑：查询工作空间 agent（用于复制对话框）。
  const wsAgentsQuery = useQuery(
    trpc.settings.getAgents.queryOptions({ scopeFilter: "workspace" }),
  )
  const wsAgents = (wsAgentsQuery.data ?? []) as AgentSummary[]

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

  const activeTabId = useTabs((s) => s.activeTabId)
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)

  const masterAgent = useMemo(
    () => agents.find((a) => a.folderName === "master"),
    [agents],
  )
  const hasMaster = Boolean(masterAgent)
  const wsAgentFolderSet = useMemo(
    () => new Set(wsAgents.map((agent) => agent.folderName)),
    [wsAgents],
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
        toast.success("已删除 Agent助手")
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
        toast.success("已复制 Agent助手 到项目")
      },
      onError: (error) => toast.error(error.message),
    }),
  )

  const handleEditAgent = useCallback(
    (agent: AgentSummary) => {
      if (!activeTabId) return
      pushStackItem(activeTabId, {
        id: `agent-detail:${agent.scope}:${agent.name}`,
        sourceKey: `agent-detail:${agent.scope}:${agent.name}`,
        component: "agent-detail",
        title: `Agent助手 · ${agent.name}`,
        params: {
          agentPath: agent.path,
          scope: agent.scope,
          projectId,
          isSystem: agent.isSystem,
        },
      })
    },
    [activeTabId, projectId, pushStackItem],
  )

  const handleCreateBlank = useCallback(() => {
    if (!activeTabId) return
    pushStackItem(activeTabId, {
      id: `agent-detail:new:${Date.now()}`,
      sourceKey: "agent-detail:new",
      component: "agent-detail",
      title: "创建 Agent助手",
      params: { isNew: true, scope: "project", projectId },
    })
  }, [activeTabId, projectId, pushStackItem])

  const handleOpenWorkspaceAgents = useCallback(() => {
    if (!activeTabId) return
    pushStackItem(activeTabId, {
      id: "workspace-agents",
      sourceKey: "workspace-agents",
      component: "agent-management",
      title: "工作空间 Agent助手",
      params: {},
    })
  }, [activeTabId, pushStackItem])

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
        `确认删除 Agent助手「${agent.name}」？此操作不可撤销。`,
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

  const handleCopyFromWorkspace = useCallback(
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
            项目 Agent助手
          </h3>
          <p className="text-xs text-muted-foreground">
            管理当前项目的 Agent助手。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-full px-2.5 text-xs sm:px-3"
                disabled={!activeTabId}
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="ml-1.5 hidden sm:inline">创建 Agent助手</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {!hasMaster ? (
                <DropdownMenuItem onClick={handleStartCopyMaster}>
                  <Bot className="mr-2 h-4 w-4" />
                  创建项目主助手
                </DropdownMenuItem>
              ) : null}
              {!hasMaster ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem onClick={handleCreateBlank}>
                <Plus className="mr-2 h-4 w-4" />
                从空白创建
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleStartCopyNormal}>
                <Copy className="mr-2 h-4 w-4" />
                从工作空间复制
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
                onClick={handleOpenWorkspaceAgents}
                disabled={!activeTabId}
              >
                <ArrowRight className="h-3.5 w-3.5" />
                <span className="ml-1.5 hidden sm:inline">查看工作空间 Agent助手</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              查看工作空间 Agent助手
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
          <div className="flex items-center rounded-full border border-border/70 bg-muted/40">
            <FilterTab text="全部" selected={statusFilter === "all"} onSelect={() => setStatusFilter("all")} layoutId="project-agent-filter" />
            <FilterTab text="启用" selected={statusFilter === "enabled"} onSelect={() => setStatusFilter("enabled")} layoutId="project-agent-filter" />
            <FilterTab text="停用" selected={statusFilter === "disabled"} onSelect={() => setStatusFilter("disabled")} layoutId="project-agent-filter" />
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
                    className="group flex items-center gap-3 rounded-xl bg-sky-100 px-3 py-2.5 transition-[background-color] duration-200 hover:bg-sky-200/75 dark:bg-sky-900/55 dark:hover:bg-sky-800/70"
                    onDoubleClick={() => handleEditAgent(agent)}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <AgentIconDisplay icon={agent.icon} />
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">
                          {agent.name}
                        </span>
                        {agent.folderName === "master" ? (
                          <span className="shrink-0 rounded px-1 py-px text-[10px] bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-400">
                            主助手
                          </span>
                        ) : null}
                        {agent.isSystem ? (
                          <span className="shrink-0 rounded px-1 py-px text-[10px] bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
                            系统
                          </span>
                        ) : null}
                        {/* 逻辑：当前项目 Agent 与工作空间同名时显示覆盖标记。 */}
                        {!agent.isInherited && wsAgentFolderSet.has(agent.folderName) ? (
                          <span className="shrink-0 rounded px-1 py-px text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                            覆盖
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
                      className="shrink-0 border-zinc-300/70 bg-zinc-200/55 data-[state=checked]:bg-emerald-300/60 dark:border-zinc-600/80 dark:bg-zinc-700/45 dark:data-[state=checked]:bg-emerald-600/45"
                      aria-label={`启用 Agent助手 ${agent.name}`}
                      disabled={updateAgentMutation.isPending}
                    />
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-44">
                  <ContextMenuItem icon={Pencil} onClick={() => handleEditAgent(agent)}>
                    编辑 Agent助手
                  </ContextMenuItem>
                  <ContextMenuItem
                    icon={Trash2}
                    variant="destructive"
                    onClick={() => void handleDeleteAgent(agent)}
                    disabled={deleteAgentMutation.isPending}
                  >
                    删除 Agent助手
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        ) : null}

        {agentsQuery.isLoading ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            正在加载 Agent助手 列表...
          </div>
        ) : null}

        {!agentsQuery.isLoading && !agentsQuery.isError && !hasNonMasterAgents && !hasMaster ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            暂无项目 Agent助手。点击「创建 Agent助手」开始。
          </div>
        ) : null}

        {!agentsQuery.isLoading && !agentsQuery.isError && hasNonMasterAgents && filteredAgents.length === 0 ? (
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

      {/* 复制对话框 */}
      <CopyAgentDialog
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        agents={wsAgents}
        onSelect={handleCopyFromWorkspace}
      />
    </div>
  )
}
