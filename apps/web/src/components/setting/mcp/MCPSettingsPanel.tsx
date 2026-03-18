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
  Loader2,
} from "lucide-react"
import { AddMCPServerDialog } from "./AddMCPServerDialog"

// ---------------------------------------------------------------------------
// Card accent styles — using ol-* design tokens (no hardcoded Tailwind colors)
// ---------------------------------------------------------------------------
const CARD_ACCENT_STYLES = [
  { bg: "bg-ol-blue-bg", border: "border-l-ol-blue" },
  { bg: "bg-ol-green-bg", border: "border-l-ol-green" },
  { bg: "bg-ol-purple-bg", border: "border-l-ol-purple" },
  { bg: "bg-ol-amber-bg", border: "border-l-ol-amber" },
  { bg: "bg-ol-red-bg", border: "border-l-ol-red" },
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
      ? "bg-ol-green"
      : status === "connecting"
        ? "bg-ol-amber animate-pulse"
        : status === "error"
          ? "bg-ol-red"
          : "bg-ol-text-auxiliary/40"
  return <span className={cn("inline-block h-2 w-2 rounded-full", color)} />
}

// Transport badge
function TransportBadge({ transport }: { transport: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/40 bg-ol-surface-muted px-1.5 py-0.5 text-[10px] text-ol-text-auxiliary shadow-none">
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
            className="h-8 rounded-md border-transparent bg-ol-surface-input pl-8 pr-7 text-sm shadow-none focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70"
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
                  "h-7 rounded-full px-2.5 text-xs shadow-none transition-colors duration-150",
                  statusFilter === value &&
                    "bg-ol-purple-bg text-ol-purple hover:bg-ol-purple-bg-hover",
                )}
                onClick={() => setStatusFilter(value)}
              >
                {t(`settings:mcp.status${value.charAt(0).toUpperCase() + value.slice(1)}`)}
              </Button>
            ))}
          </div>

          {/* Reconnect all */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 rounded-full p-0 shadow-none transition-colors duration-150"
            disabled={reconnecting || servers.filter((s) => s.enabled).length === 0}
            onClick={handleReconnectAll}
            title={t("settings:mcp.reconnectAll")}
          >
            {reconnecting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-ol-text-auxiliary" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 text-ol-text-auxiliary" />
            )}
          </Button>

          {/* Add button */}
          <Button
            size="sm"
            className="h-7 gap-1 rounded-full bg-ol-purple-bg px-2.5 text-xs text-ol-purple shadow-none hover:bg-ol-purple-bg-hover transition-colors duration-150"
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
              className="mt-2 gap-1 rounded-full bg-ol-purple-bg px-4 text-xs text-ol-purple shadow-none hover:bg-ol-purple-bg-hover transition-colors duration-150"
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
                  const colorIdx = hashCode(server.id) % CARD_ACCENT_STYLES.length
                  const accent = CARD_ACCENT_STYLES[colorIdx]!
                  const info = statusMap.get(server.id)
                  const status = info?.status ?? "disconnected"
                  const toolCount = info?.toolCount ?? 0

                  return (
                    <ContextMenu key={server.id}>
                      <ContextMenuTrigger asChild>
                        <div
                          className={cn(
                            "group relative flex flex-col overflow-hidden rounded-xl border-l-[3px] border border-border/40 shadow-none transition-colors duration-200",
                            accent.border,
                          )}
                        >
                          {/* Header */}
                          <div
                            className={cn(
                              "flex items-center justify-between px-3.5 pt-3 pb-2",
                              accent.bg,
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
                              <p className="line-clamp-1 text-[10px] text-ol-red">
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
