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

import { useState, useMemo, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery } from "@tanstack/react-query"
import { queryClient, trpc } from "@/utils/trpc"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Button } from "@openloaf/ui/button"
import { Switch } from "@openloaf/ui/switch"
import { Input } from "@openloaf/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu"
import {
  Globe,
  FolderCog,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  X,
  Plug,
  PlugZap,
  Loader2,
} from "lucide-react"
import { AddMCPServerDialog } from "./AddMCPServerDialog"

// ---------------------------------------------------------------------------
// Card accent styles — aligned with SkillsSettingsPanel gradient approach
// ---------------------------------------------------------------------------
const CARD_GRADIENTS = [
  "from-teal-100 to-cyan-50 dark:from-teal-900/40 dark:to-cyan-900/30",
  "from-violet-100 to-fuchsia-50 dark:from-violet-900/40 dark:to-fuchsia-900/30",
  "from-amber-100 to-orange-50 dark:from-amber-900/40 dark:to-orange-900/30",
  "from-sky-100 to-blue-50 dark:from-sky-900/40 dark:to-blue-900/30",
  "from-rose-100 to-pink-50 dark:from-rose-900/40 dark:to-pink-900/30",
  "from-emerald-100 to-green-50 dark:from-emerald-900/40 dark:to-green-900/30",
  "from-indigo-100 to-purple-50 dark:from-indigo-900/40 dark:to-purple-900/30",
  "from-lime-100 to-yellow-50 dark:from-lime-900/40 dark:to-yellow-900/30",
]

const ACCENT_BORDER_COLORS = [
  "border-l-teal-300 dark:border-l-teal-600",
  "border-l-violet-300 dark:border-l-violet-600",
  "border-l-amber-300 dark:border-l-amber-600",
  "border-l-sky-300 dark:border-l-sky-600",
  "border-l-rose-300 dark:border-l-rose-600",
  "border-l-emerald-300 dark:border-l-emerald-600",
  "border-l-indigo-300 dark:border-l-indigo-600",
  "border-l-lime-300 dark:border-l-lime-600",
]

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------
function StatusDot({ status }: { status: string }) {
  const color =
    status === "connected"
      ? "bg-foreground"
      : status === "connecting"
        ? "bg-foreground/50 animate-pulse"
        : status === "error"
          ? "bg-destructive"
          : "bg-muted-foreground/40"
  return <span className={cn("inline-block h-2 w-2 rounded-full", color)} />
}

// Transport badge
function TransportBadge({ transport }: { transport: string }) {
  return (
    <span className="inline-flex items-center rounded-3xl border border-border/40 bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-none">
      {transport}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type StatusFilter = "all" | "enabled" | "disabled"

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function MCPSettingsPanel() {
  const { t } = useTranslation(["settings"])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  // --- Data queries ---
  const serversQuery = useQuery(
    trpc.mcp.getMcpServers.queryOptions({ projectRoot: undefined }),
  )
  const statusQuery = useQuery({
    ...trpc.mcp.getMcpServerStatus.queryOptions(),
    refetchInterval: 5000,
  })
  const servers = serversQuery.data ?? []
  const statusMap = useMemo(() => {
    const map = new Map<string, { status: string; toolCount: number; error?: string }>()
    for (const s of statusQuery.data ?? []) {
      map.set(s.id, { status: s.status, toolCount: s.toolCount, error: s.error })
    }
    return map
  }, [statusQuery.data])

  // --- Mutations ---
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: trpc.mcp.getMcpServers.queryOptions({}).queryKey,
    })
    queryClient.invalidateQueries({
      queryKey: trpc.mcp.getMcpServerStatus.queryOptions().queryKey,
    })
  }, [])

  const enableMutation = useMutation(
    trpc.mcp.setMcpServerEnabled.mutationOptions({
      onSuccess: () => invalidate(),
      onError: (err) => toast.error(err.message),
    }),
  )

  const removeMutation = useMutation(
    trpc.mcp.removeMcpServer.mutationOptions({
      onSuccess: () => {
        invalidate()
        toast.success(t("settings:mcp.deleteSuccess"))
      },
      onError: (err) => toast.error(err.message),
    }),
  )

  const testMutation = useMutation(
    trpc.mcp.testMcpConnection.mutationOptions({
      onSuccess: (data) => {
        invalidate()
        if (data.ok) {
          toast.success(
            t("settings:mcp.testSuccess", { count: data.toolCount }),
          )
        } else {
          toast.error(data.error ?? t("settings:mcp.testFailed"))
        }
      },
      onError: (err) => toast.error(err.message),
    }),
  )

  // --- Reconnect all enabled servers ---
  async function handleReconnectAll() {
    const enabled = servers.filter((s) => s.enabled)
    if (enabled.length === 0) return
    setReconnecting(true)
    let ok = 0
    let fail = 0
    for (const s of enabled) {
      try {
        const res = await testMutation.mutateAsync({ id: s.id })
        if (res.ok) ok++; else fail++
      } catch { fail++ }
    }
    setReconnecting(false)
    invalidate()
    if (ok > 0) toast.success(t("settings:mcp.reconnectSuccess", { count: ok }))
    if (fail > 0) toast.error(t("settings:mcp.reconnectFail", { count: fail }))
  }

  // --- Filtering ---
  const filtered = useMemo(() => {
    let list = servers
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q),
      )
    }
    if (statusFilter === "enabled") list = list.filter((s) => s.enabled)
    if (statusFilter === "disabled") list = list.filter((s) => !s.enabled)
    return list
  }, [servers, searchQuery, statusFilter])

  // --- Grouping ---
  const globalServers = filtered.filter((s) => s.scope === "global")
  const projectServers = filtered.filter((s) => s.scope === "project")

  const groups = useMemo(() => {
    const g: Array<{
      key: string
      label: string
      Icon: typeof Globe
      servers: typeof filtered
    }> = []
    if (globalServers.length > 0) {
      g.push({
        key: "global",
        label: t("settings:mcp.scopeGlobal"),
        Icon: Globe,
        servers: globalServers,
      })
    }
    if (projectServers.length > 0) {
      g.push({
        key: "project",
        label: t("settings:mcp.scopeProject"),
        Icon: FolderCog,
        servers: projectServers,
      })
    }
    return g
  }, [globalServers, projectServers, t])

  const totalCount = filtered.length

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Header — aligned with SkillsSettingsPanel */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* Search */}
          <div className="relative max-w-52">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              type="text"
              placeholder={t("settings:mcp.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 rounded-3xl border-transparent bg-muted/40 pl-8 pr-7 text-sm focus:border-border"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {/* Status filter pills */}
          <div className="flex items-center gap-1">
            {(["all", "enabled", "disabled"] as StatusFilter[]).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={statusFilter === value ? "secondary" : "ghost"}
                className={cn(
                  "h-7 rounded-3xl px-2.5 text-xs",
                  statusFilter === value && "bg-secondary text-foreground hover:bg-accent",
                )}
                onClick={() => setStatusFilter(value)}
              >
                {t(`settings:mcp.status${value.charAt(0).toUpperCase() + value.slice(1)}`)}
              </Button>
            ))}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t("settings:mcp.totalCount", { count: totalCount, defaultValue: `${totalCount} 个服务` })}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-3xl text-muted-foreground hover:text-foreground"
                disabled={reconnecting || servers.filter((s) => s.enabled).length === 0}
                onClick={handleReconnectAll}
              >
                {reconnecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className={cn("h-3.5 w-3.5", serversQuery.isFetching && "animate-spin")} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("settings:mcp.reconnectAll")}</TooltipContent>
          </Tooltip>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-3xl bg-secondary text-secondary-foreground hover:bg-accent"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t("settings:mcp.addServer")}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {serversQuery.isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[104px] animate-pulse rounded-3xl bg-muted/40" />
            ))}
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <PlugZap className="h-10 w-10 text-muted-foreground/30" />
            <div className="text-sm text-muted-foreground">
              {t("settings:mcp.emptyTitle")}
            </div>
            <div className="text-xs text-muted-foreground/70">
              {t("settings:mcp.emptyDescription")}
            </div>
            <Button
              size="sm"
              className="mt-2 gap-1 rounded-3xl bg-secondary px-4 text-xs text-secondary-foreground shadow-none hover:bg-accent transition-colors duration-150"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("settings:mcp.addServer")}
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-9 text-center text-sm text-muted-foreground">
            {t("settings:mcp.noMatch", { defaultValue: "没有匹配的服务" })}
          </div>
        ) : groups.length > 0 ? (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.key}>
                {groups.length > 1 ? (
                  <div className="mb-3 flex items-center gap-1.5 px-1">
                    <group.Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
                    <h3 className="flex-1 text-xs font-medium text-muted-foreground/70">
                      {group.label}
                      <span className="ml-1.5 tabular-nums">({group.servers.length})</span>
                    </h3>
                  </div>
                ) : null}

                {/* Card grid */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3.5">
                  {group.servers.map((server) => {
                    const colorIdx = hashCode(server.id) % CARD_GRADIENTS.length
                    const info = statusMap.get(server.id)
                    const status = info?.status ?? "disconnected"
                    const toolCount = info?.toolCount ?? 0

                    return (
                      <ContextMenu key={server.id}>
                        <ContextMenuTrigger asChild>
                          <div
                            className={cn(
                              "group relative flex flex-col overflow-hidden rounded-3xl border-l-[3px] border border-border/70 shadow-none transition-all duration-200 hover:shadow-none hover:border-foreground/40",
                              ACCENT_BORDER_COLORS[colorIdx],
                            )}
                          >
                            {/* Gradient header strip */}
                            <div className={cn("px-3.5 pt-3 pb-2 bg-gradient-to-r", CARD_GRADIENTS[colorIdx])}>
                              <div className="flex min-w-0 items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                                    <Plug className="h-3.5 w-3.5 shrink-0 text-foreground/70" />
                                    <span className="truncate">{server.name}</span>
                                  </div>
                                </div>
                                <Switch
                                  checked={server.enabled}
                                  onCheckedChange={(checked) =>
                                    enableMutation.mutate({
                                      id: server.id,
                                      enabled: checked,
                                    })
                                  }
                                  className="border-border bg-secondary data-[state=checked]:bg-foreground dark:data-[state=checked]:bg-foreground"
                                  disabled={enableMutation.isPending}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            </div>

                            {/* Body */}
                            <div className="flex flex-1 flex-col px-3.5 pb-3 pt-1.5 bg-background/50 dark:bg-background/30">
                              {/* Status + transport + tool count */}
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <StatusDot status={status} />
                                <span>
                                  {status === "connected"
                                    ? t("settings:mcp.statusConnected")
                                    : status === "connecting"
                                      ? t("settings:mcp.statusConnecting")
                                      : status === "error"
                                        ? t("settings:mcp.statusError")
                                        : t("settings:mcp.statusDisconnected")}
                                </span>
                                <TransportBadge transport={server.transport} />
                                {toolCount > 0 && (
                                  <span className="text-[10px] text-muted-foreground/60">
                                    {toolCount} {t("settings:mcp.tools")}
                                  </span>
                                )}
                              </div>

                              {/* Description */}
                              <p className="mt-1 min-w-0 flex-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                {server.description?.trim() || server.name}
                              </p>

                              {/* Error message */}
                              {info?.error ? (
                                <p className="mt-1 line-clamp-1 text-[10px] text-destructive">
                                  {info.error}
                                </p>
                              ) : null}

                              {/* Footer: transport label */}
                              <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                                <span className="truncate text-[11px] text-muted-foreground/60">{server.id}</span>
                              </div>
                            </div>
                          </div>
                        </ContextMenuTrigger>

                        <ContextMenuContent className="w-48">
                          <ContextMenuItem
                            icon={RefreshCw}
                            onClick={() =>
                              testMutation.mutate({ id: server.id })
                            }
                          >
                            {t("settings:mcp.testConnection")}
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            icon={Trash2}
                            variant="destructive"
                            onClick={() =>
                              removeMutation.mutate({ id: server.id })
                            }
                          >
                            {t("settings:mcp.deleteServer")}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Add Dialog */}
      <AddMCPServerDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={invalidate}
      />
    </div>
  )
}
