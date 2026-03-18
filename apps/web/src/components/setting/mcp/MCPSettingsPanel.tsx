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
  Settings2,
  Loader2,
  Wifi,
  WifiOff,
  TerminalSquare,
  ExternalLink,
} from "lucide-react"
import { AddMCPServerDialog } from "./AddMCPServerDialog"

// ---------------------------------------------------------------------------
// Card gradients (match Skills panel style)
// ---------------------------------------------------------------------------
const CARD_GRADIENTS = [
  "from-indigo-100 to-blue-50 dark:from-indigo-900/40 dark:to-blue-900/30",
  "from-teal-100 to-cyan-50 dark:from-teal-900/40 dark:to-cyan-900/30",
  "from-violet-100 to-fuchsia-50 dark:from-violet-900/40 dark:to-fuchsia-900/30",
  "from-amber-100 to-orange-50 dark:from-amber-900/40 dark:to-orange-900/30",
  "from-rose-100 to-pink-50 dark:from-rose-900/40 dark:to-pink-900/30",
  "from-emerald-100 to-green-50 dark:from-emerald-900/40 dark:to-green-900/30",
  "from-sky-100 to-cyan-50 dark:from-sky-900/40 dark:to-cyan-900/30",
  "from-lime-100 to-yellow-50 dark:from-lime-900/40 dark:to-yellow-900/30",
] as const

const ACCENT_BORDER_COLORS = [
  "border-l-indigo-300 dark:border-l-indigo-600",
  "border-l-teal-300 dark:border-l-teal-600",
  "border-l-violet-300 dark:border-l-violet-600",
  "border-l-amber-300 dark:border-l-amber-600",
  "border-l-rose-300 dark:border-l-rose-600",
  "border-l-emerald-300 dark:border-l-emerald-600",
  "border-l-sky-300 dark:border-l-sky-600",
  "border-l-lime-300 dark:border-l-lime-600",
] as const

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------
function StatusDot({ status }: { status: string }) {
  const color =
    status === "connected"
      ? "bg-emerald-500"
      : status === "connecting"
        ? "bg-amber-500 animate-pulse"
        : status === "error"
          ? "bg-red-500"
          : "bg-gray-400"
  return <span className={cn("inline-block h-2 w-2 rounded-full", color)} />
}

// Transport badge
function TransportBadge({ transport }: { transport: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
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

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-1 pb-3">
        {/* Search */}
        <div className="relative max-w-52">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            type="text"
            placeholder={t("settings:mcp.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 rounded-md border-transparent bg-muted/40 pl-8 pr-7 text-sm focus:border-border"
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

        <div className="flex items-center gap-2">
          {/* Status filters */}
          <div className="flex items-center gap-1">
            {(["all", "enabled", "disabled"] as StatusFilter[]).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={statusFilter === value ? "secondary" : "ghost"}
                className={cn(
                  "h-7 rounded-md px-2.5 text-xs",
                  statusFilter === value &&
                    "bg-ol-purple/10 text-ol-purple hover:bg-ol-purple/20",
                )}
                onClick={() => setStatusFilter(value)}
              >
                {t(`settings:mcp.status${value.charAt(0).toUpperCase() + value.slice(1)}`)}
              </Button>
            ))}
          </div>

          {/* Add button */}
          <Button
            size="sm"
            className="h-7 gap-1 rounded-md bg-ol-purple/10 px-2.5 text-xs text-ol-purple hover:bg-ol-purple/20"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("settings:mcp.addServer")}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto pr-2">
        {servers.length === 0 ? (
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
              className="mt-2 gap-1 rounded-full bg-ol-purple/10 px-4 text-xs text-ol-purple hover:bg-ol-purple/20"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("settings:mcp.addServer")}
            </Button>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="mb-5">
              {/* Group header */}
              <div className="mb-2 flex items-center gap-2 px-1">
                <group.Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  {group.label}
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  ({group.servers.length})
                </span>
              </div>

              {/* Card grid */}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3.5">
                {group.servers.map((server) => {
                  const colorIdx = hashCode(server.id) % 8
                  const info = statusMap.get(server.id)
                  const status = info?.status ?? "disconnected"
                  const toolCount = info?.toolCount ?? 0

                  return (
                    <ContextMenu key={server.id}>
                      <ContextMenuTrigger asChild>
                        <div
                          className={cn(
                            "group relative flex flex-col overflow-hidden rounded-2xl border-l-[3px] border border-border/70 shadow-none transition-all duration-200 hover:shadow-sm",
                            ACCENT_BORDER_COLORS[colorIdx],
                          )}
                        >
                          {/* Gradient header */}
                          <div
                            className={cn(
                              "flex items-center justify-between px-3.5 pt-3 pb-2 bg-gradient-to-r",
                              CARD_GRADIENTS[colorIdx],
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Plug className="h-4 w-4 shrink-0 text-foreground/70" />
                              <span className="truncate text-sm font-medium text-foreground">
                                {server.name}
                              </span>
                            </div>
                            <Switch
                              checked={server.enabled}
                              onCheckedChange={(checked) =>
                                enableMutation.mutate({
                                  id: server.id,
                                  enabled: checked,
                                })
                              }
                              className="shrink-0"
                            />
                          </div>

                          {/* Body */}
                          <div className="flex flex-1 flex-col gap-2 px-3.5 pb-3 pt-2 bg-background/50 dark:bg-background/30">
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
                            {server.description ? (
                              <p className="line-clamp-2 text-xs text-muted-foreground/80">
                                {server.description}
                              </p>
                            ) : null}

                            {/* Error message */}
                            {info?.error ? (
                              <p className="line-clamp-1 text-[10px] text-red-500">
                                {info.error}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </ContextMenuTrigger>

                      <ContextMenuContent className="w-48">
                        <ContextMenuItem
                          onClick={() =>
                            testMutation.mutate({ id: server.id })
                          }
                        >
                          <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          {t("settings:mcp.testConnection")}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() =>
                            removeMutation.mutate({ id: server.id })
                          }
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          {t("settings:mcp.deleteServer")}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                })}
              </div>
            </div>
          ))
        )}
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
