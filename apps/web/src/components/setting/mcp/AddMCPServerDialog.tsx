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

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { trpc } from "@/utils/trpc"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@openloaf/ui/button"
import { Input } from "@openloaf/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select"
import {
  Loader2,
  Plus,
  Trash2,
  TerminalSquare,
  Globe,
  Radio,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Transport = "stdio" | "http" | "sse"
type Scope = "global" | "project"

type EnvEntry = { key: string; value: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

// ---------------------------------------------------------------------------
// Transport tab icons
// ---------------------------------------------------------------------------
const TRANSPORT_TABS: { value: Transport; label: string; Icon: typeof TerminalSquare }[] = [
  { value: "stdio", label: "Stdio", Icon: TerminalSquare },
  { value: "http", label: "HTTP", Icon: Globe },
  { value: "sse", label: "SSE", Icon: Radio },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AddMCPServerDialog({ open, onOpenChange, onSuccess }: Props) {
  const { t } = useTranslation(["settings"])

  // --- Form state ---
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [transport, setTransport] = useState<Transport>("stdio")
  const [scope, setScope] = useState<Scope>("global")

  // stdio
  const [command, setCommand] = useState("")
  const [args, setArgs] = useState("")
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>([])
  const [cwd, setCwd] = useState("")

  // http/sse
  const [url, setUrl] = useState("")
  const [headerEntries, setHeaderEntries] = useState<EnvEntry[]>([])

  // --- Mutations ---
  const addMutation = useMutation(
    trpc.mcp.addMcpServer.mutationOptions({
      onSuccess: () => {
        toast.success(t("settings:mcp.addSuccess"))
        onSuccess()
        resetForm()
        onOpenChange(false)
      },
      onError: (err) => toast.error(err.message),
    }),
  )

  function resetForm() {
    setName("")
    setDescription("")
    setTransport("stdio")
    setScope("global")
    setCommand("")
    setArgs("")
    setEnvEntries([])
    setCwd("")
    setUrl("")
    setHeaderEntries([])
  }

  function handleSubmit() {
    if (!name.trim()) {
      toast.error(t("settings:mcp.nameRequired"))
      return
    }

    const envObj =
      envEntries.length > 0
        ? Object.fromEntries(envEntries.filter((e) => e.key.trim()).map((e) => [e.key, e.value]))
        : undefined
    const headersObj =
      headerEntries.length > 0
        ? Object.fromEntries(headerEntries.filter((e) => e.key.trim()).map((e) => [e.key, e.value]))
        : undefined

    addMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      transport,
      scope,
      enabled: true,
      // stdio fields
      ...(transport === "stdio"
        ? {
            command: command.trim() || undefined,
            args: args.trim() ? args.split(/\s+/) : undefined,
            env: envObj,
            cwd: cwd.trim() || undefined,
          }
        : {}),
      // http/sse fields
      ...(transport !== "stdio"
        ? {
            url: url.trim() || undefined,
            headers: headersObj,
          }
        : {}),
    })
  }

  // --- Key-value pair helpers ---
  function addEnvEntry() {
    setEnvEntries((prev) => [...prev, { key: "", value: "" }])
  }
  function removeEnvEntry(idx: number) {
    setEnvEntries((prev) => prev.filter((_, i) => i !== idx))
  }
  function updateEnvEntry(idx: number, field: "key" | "value", val: string) {
    setEnvEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, [field]: val } : e)),
    )
  }

  function addHeaderEntry() {
    setHeaderEntries((prev) => [...prev, { key: "", value: "" }])
  }
  function removeHeaderEntry(idx: number) {
    setHeaderEntries((prev) => prev.filter((_, i) => i !== idx))
  }
  function updateHeaderEntry(idx: number, field: "key" | "value", val: string) {
    setHeaderEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, [field]: val } : e)),
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("settings:mcp.addServerTitle")}</DialogTitle>
          <DialogDescription>{t("settings:mcp.addServerDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("settings:mcp.serverName")}</label>
            <Input
              placeholder={t("settings:mcp.serverNamePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("settings:mcp.description")}</label>
            <Input
              placeholder={t("settings:mcp.descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Transport tabs */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("settings:mcp.transport")}</label>
            <div className="flex items-center gap-1 rounded-md bg-muted/40 p-1">
              {TRANSPORT_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setTransport(tab.value)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    transport === tab.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <tab.Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Transport-specific fields */}
          {transport === "stdio" ? (
            <>
              {/* Command */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("settings:mcp.command")}</label>
                <Input
                  placeholder="npx, node, uvx, python..."
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                />
              </div>

              {/* Args */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("settings:mcp.args")}</label>
                <Input
                  placeholder="-y @modelcontextprotocol/server-github"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground/60">
                  {t("settings:mcp.argsHint")}
                </p>
              </div>

              {/* Env vars */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{t("settings:mcp.envVars")}</label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-xs"
                    onClick={addEnvEntry}
                  >
                    <Plus className="h-3 w-3" />
                    {t("settings:mcp.addEnvVar")}
                  </Button>
                </div>
                {envEntries.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      className="h-8 flex-1 text-xs"
                      placeholder="KEY"
                      value={entry.key}
                      onChange={(e) => updateEnvEntry(idx, "key", e.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">=</span>
                    <Input
                      className="h-8 flex-1 text-xs"
                      placeholder="value"
                      value={entry.value}
                      onChange={(e) => updateEnvEntry(idx, "value", e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => removeEnvEntry(idx)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Working directory */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("settings:mcp.cwd")}</label>
                <Input
                  placeholder={t("settings:mcp.cwdPlaceholder")}
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              {/* URL */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("settings:mcp.url")}</label>
                <Input
                  placeholder="http://localhost:3000/mcp"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>

              {/* Headers */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{t("settings:mcp.headers")}</label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-xs"
                    onClick={addHeaderEntry}
                  >
                    <Plus className="h-3 w-3" />
                    {t("settings:mcp.addHeader")}
                  </Button>
                </div>
                {headerEntries.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      className="h-8 flex-1 text-xs"
                      placeholder="Authorization"
                      value={entry.key}
                      onChange={(e) => updateHeaderEntry(idx, "key", e.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">:</span>
                    <Input
                      className="h-8 flex-1 text-xs"
                      placeholder="Bearer token..."
                      value={entry.value}
                      onChange={(e) => updateHeaderEntry(idx, "value", e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => removeHeaderEntry(idx)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Scope */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("settings:mcp.scope")}</label>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">{t("settings:mcp.scopeGlobal")}</SelectItem>
                <SelectItem value="project">{t("settings:mcp.scopeProject")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("settings:mcp.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={addMutation.isPending}
          >
            {addMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            {t("settings:mcp.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
