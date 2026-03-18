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

import { useState, useMemo } from "react"
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
  ClipboardPaste,
  FormInput,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Transport = "stdio" | "http" | "sse"
type Scope = "global" | "project"
type Mode = "form" | "json"

type EnvEntry = { key: string; value: string }

type ParsedServer = {
  name: string
  transport: Transport
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

// ---------------------------------------------------------------------------
// JSON parser — supports Claude Desktop, Cursor, VS Code, Cline, Windsurf
// ---------------------------------------------------------------------------

/**
 * Parse MCP server configs from various JSON formats:
 *
 * 1. Claude Desktop / Cursor / Cline / Windsurf:
 *    { "mcpServers": { "name": { "command": "...", "args": [...] } } }
 *
 * 2. VS Code:
 *    { "servers": { "name": { "type": "stdio", "command": "..." } } }
 *
 * 3. Single server (no wrapper):
 *    { "command": "npx", "args": [...] }
 *
 * 4. Windsurf HTTP:
 *    { "mcpServers": { "name": { "serverUrl": "https://..." } } }
 */
function parseMcpJson(text: string): ParsedServer[] {
  const json = JSON.parse(text)
  if (!json || typeof json !== 'object') throw new Error('Invalid JSON')

  // Detect root key
  const serversObj: Record<string, any> =
    json.mcpServers ?? json.servers ?? null

  // Case: wrapped format (mcpServers or servers)
  if (serversObj && typeof serversObj === 'object' && !Array.isArray(serversObj)) {
    return Object.entries(serversObj).map(([name, cfg]) =>
      parseSingleServer(name, cfg as Record<string, any>),
    )
  }

  // Case: single server object (has command or url or serverUrl)
  if (json.command || json.url || json.serverUrl) {
    return [parseSingleServer('imported-server', json)]
  }

  throw new Error('Unrecognized MCP config format')
}

function parseSingleServer(name: string, cfg: Record<string, any>): ParsedServer {
  // Detect transport
  let transport: Transport = 'stdio'
  if (cfg.type === 'http' || cfg.type === 'sse') {
    transport = cfg.type
  } else if (cfg.serverUrl || cfg.url) {
    transport = 'http'
  }

  const result: ParsedServer = { name, transport }

  // stdio fields
  if (typeof cfg.command === 'string') result.command = cfg.command
  if (Array.isArray(cfg.args)) result.args = cfg.args.map(String)
  if (cfg.env && typeof cfg.env === 'object') {
    result.env = Object.fromEntries(
      Object.entries(cfg.env).map(([k, v]) => [k, String(v)]),
    )
  }
  if (typeof cfg.cwd === 'string') result.cwd = cfg.cwd

  // http/sse fields
  const urlValue = cfg.url ?? cfg.serverUrl
  if (typeof urlValue === 'string') result.url = urlValue
  if (cfg.headers && typeof cfg.headers === 'object') {
    result.headers = Object.fromEntries(
      Object.entries(cfg.headers).map(([k, v]) => [k, String(v)]),
    )
  }

  return result
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
  const [mode, setMode] = useState<Mode>("json") // default to JSON paste

  // --- Form state ---
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [transport, setTransport] = useState<Transport>("stdio")
  const [scope, setScope] = useState<Scope>("global")
  const [command, setCommand] = useState("")
  const [args, setArgs] = useState("")
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>([])
  const [cwd, setCwd] = useState("")
  const [url, setUrl] = useState("")
  const [headerEntries, setHeaderEntries] = useState<EnvEntry[]>([])

  // --- JSON paste state ---
  const [jsonText, setJsonText] = useState("")
  const [importing, setImporting] = useState(false)

  // Live parse preview
  const parseResult = useMemo(() => {
    if (!jsonText.trim()) return null
    try {
      const servers = parseMcpJson(jsonText)
      return { ok: true as const, servers }
    } catch (err: any) {
      return { ok: false as const, error: err.message as string }
    }
  }, [jsonText])

  // --- Mutations ---
  const addMutation = useMutation(
    trpc.mcp.addMcpServer.mutationOptions({
      onSuccess: () => {
        onSuccess()
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
    setJsonText("")
  }

  // --- Form submit ---
  function handleFormSubmit() {
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
      ...(transport === "stdio"
        ? {
            command: command.trim() || undefined,
            args: args.trim() ? args.split(/\s+/) : undefined,
            env: envObj,
            cwd: cwd.trim() || undefined,
          }
        : {
            url: url.trim() || undefined,
            headers: headersObj,
          }),
    }, {
      onSuccess: () => {
        toast.success(t("settings:mcp.addSuccess"))
        resetForm()
        onOpenChange(false)
      },
    })
  }

  // --- JSON batch import ---
  async function handleJsonImport() {
    if (!parseResult?.ok) return
    const servers = parseResult.servers
    setImporting(true)

    let successCount = 0
    let failCount = 0

    for (const server of servers) {
      try {
        await addMutation.mutateAsync({
          name: server.name,
          transport: server.transport,
          scope,
          enabled: true,
          command: server.command,
          args: server.args,
          env: server.env,
          cwd: server.cwd,
          url: server.url,
          headers: server.headers,
        })
        successCount++
      } catch {
        failCount++
      }
    }

    setImporting(false)

    if (successCount > 0) {
      toast.success(t("settings:mcp.importSuccess", { count: successCount }))
      onSuccess()
      resetForm()
      onOpenChange(false)
    }
    if (failCount > 0) {
      toast.error(t("settings:mcp.importPartialFail", { count: failCount }))
    }
  }

  // --- KV helpers ---
  function addEnvEntry() {
    setEnvEntries((prev) => [...prev, { key: "", value: "" }])
  }
  function removeEnvEntry(idx: number) {
    setEnvEntries((prev) => prev.filter((_, i) => i !== idx))
  }
  function updateEnvEntry(idx: number, field: "key" | "value", val: string) {
    setEnvEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: val } : e)))
  }
  function addHeaderEntry() {
    setHeaderEntries((prev) => [...prev, { key: "", value: "" }])
  }
  function removeHeaderEntry(idx: number) {
    setHeaderEntries((prev) => prev.filter((_, i) => i !== idx))
  }
  function updateHeaderEntry(idx: number, field: "key" | "value", val: string) {
    setHeaderEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: val } : e)))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("settings:mcp.addServerTitle")}</DialogTitle>
          <DialogDescription>{t("settings:mcp.addServerDesc")}</DialogDescription>
        </DialogHeader>

        {/* Mode toggle — fixed at top */}
        <div className="flex items-center gap-1 rounded-md bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setMode("json")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "json"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
            {t("settings:mcp.modeJsonPaste")}
          </button>
          <button
            type="button"
            onClick={() => setMode("form")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "form"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <FormInput className="h-3.5 w-3.5" />
            {t("settings:mcp.modeForm")}
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto show-scrollbar pr-1">
        {mode === "json" ? (
          /* ================================================================
           * JSON Paste Mode
           * ================================================================ */
          <div className="space-y-3">
            <textarea
              className="h-48 w-full rounded-xl border border-border/40 bg-ol-surface-input p-3 font-mono text-xs text-foreground shadow-none placeholder:text-ol-text-auxiliary/50 focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70 focus:outline-none"
              placeholder={`${t("settings:mcp.jsonPlaceholder")}\n\n{\n  "mcpServers": {\n    "server-name": {\n      "command": "npx",\n      "args": ["-y", "package-name"],\n      "env": { "API_KEY": "..." }\n    }\n  }\n}`}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
            />

            {/* Parse preview */}
            {parseResult ? (
              parseResult.ok ? (
                <div className="rounded-xl border border-border/40 bg-ol-green-bg p-2.5 shadow-none">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-ol-green">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t("settings:mcp.jsonParsed", { count: parseResult.servers.length })}
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {parseResult.servers.map((s) => (
                      <div key={s.name} className="flex items-center gap-2 text-[11px] text-ol-green">
                        <span className="font-medium">{s.name}</span>
                        <span className="rounded-full bg-ol-green-bg-hover px-1.5 py-0.5 text-[10px]">
                          {s.transport}
                        </span>
                        {s.command ? (
                          <span className="truncate text-ol-text-auxiliary">
                            {s.command} {s.args?.join(" ")}
                          </span>
                        ) : s.url ? (
                          <span className="truncate text-ol-text-auxiliary">{s.url}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 rounded-xl border border-border/40 bg-ol-red-bg p-2.5 text-xs text-ol-red shadow-none">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {parseResult.error}
                </div>
              )
            ) : null}

            <p className="text-[10px] text-muted-foreground/60">
              {t("settings:mcp.jsonHint")}
            </p>

            {/* Scope selector */}
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
        ) : (
          /* ================================================================
           * Form Mode (original)
           * ================================================================ */
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("settings:mcp.serverName")}</label>
              <Input
                placeholder={t("settings:mcp.serverNamePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("settings:mcp.description")}</label>
              <Input
                placeholder={t("settings:mcp.descriptionPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
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

            {transport === "stdio" ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("settings:mcp.command")}</label>
                  <Input placeholder="npx, node, uvx, python..." value={command} onChange={(e) => setCommand(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("settings:mcp.args")}</label>
                  <Input placeholder="-y @modelcontextprotocol/server-github" value={args} onChange={(e) => setArgs(e.target.value)} />
                  <p className="text-[10px] text-muted-foreground/60">{t("settings:mcp.argsHint")}</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">{t("settings:mcp.envVars")}</label>
                    <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={addEnvEntry}>
                      <Plus className="h-3 w-3" />{t("settings:mcp.addEnvVar")}
                    </Button>
                  </div>
                  {envEntries.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input className="h-8 flex-1 text-xs" placeholder="KEY" value={entry.key} onChange={(e) => updateEnvEntry(idx, "key", e.target.value)} />
                      <span className="text-xs text-muted-foreground">=</span>
                      <Input className="h-8 flex-1 text-xs" placeholder="value" value={entry.value} onChange={(e) => updateEnvEntry(idx, "value", e.target.value)} />
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeEnvEntry(idx)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("settings:mcp.cwd")}</label>
                  <Input placeholder={t("settings:mcp.cwdPlaceholder")} value={cwd} onChange={(e) => setCwd(e.target.value)} />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("settings:mcp.url")}</label>
                  <Input placeholder="http://localhost:3000/mcp" value={url} onChange={(e) => setUrl(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">{t("settings:mcp.headers")}</label>
                    <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={addHeaderEntry}>
                      <Plus className="h-3 w-3" />{t("settings:mcp.addHeader")}
                    </Button>
                  </div>
                  {headerEntries.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input className="h-8 flex-1 text-xs" placeholder="Authorization" value={entry.key} onChange={(e) => updateHeaderEntry(idx, "key", e.target.value)} />
                      <span className="text-xs text-muted-foreground">:</span>
                      <Input className="h-8 flex-1 text-xs" placeholder="Bearer token..." value={entry.value} onChange={(e) => updateHeaderEntry(idx, "value", e.target.value)} />
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeHeaderEntry(idx)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("settings:mcp.scope")}</label>
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">{t("settings:mcp.scopeGlobal")}</SelectItem>
                  <SelectItem value="project">{t("settings:mcp.scopeProject")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" className="rounded-full shadow-none" onClick={() => onOpenChange(false)}>
            {t("settings:mcp.cancel")}
          </Button>
          {mode === "json" ? (
            <Button
              className="rounded-full bg-ol-purple-bg text-ol-purple shadow-none hover:bg-ol-purple-bg-hover transition-colors duration-150"
              onClick={handleJsonImport}
              disabled={!parseResult?.ok || importing}
            >
              {importing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {parseResult?.ok
                ? t("settings:mcp.importCount", { count: parseResult.servers.length })
                : t("settings:mcp.save")}
            </Button>
          ) : (
            <Button
              className="rounded-full bg-ol-blue-bg text-ol-blue shadow-none hover:bg-ol-blue-bg-hover transition-colors duration-150"
              onClick={handleFormSubmit}
              disabled={addMutation.isPending}
            >
              {addMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {t("settings:mcp.save")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
