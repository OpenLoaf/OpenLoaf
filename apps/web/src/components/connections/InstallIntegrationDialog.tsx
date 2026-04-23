/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryClient, trpc } from '@/utils/trpc'
import { FormDialog } from '@/components/ui/FormDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@openloaf/ui/dialog'
import { Button } from '@openloaf/ui/button'
import { Input } from '@openloaf/ui/input'
import { Check, ExternalLink, FileText, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IntegrationDefinition } from '@openloaf/api/types/integrations'
import { resolveServerUrl } from '@/utils/server-url'

type Props = {
  integration: IntegrationDefinition | null
  onClose: () => void
  onInstalled: () => void
  onUninstalled?: (integrationId: string) => void
}

function IntegrationIcon({ integration, size = 'lg' }: { integration: IntegrationDefinition; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'h-8 w-8' : 'h-6 w-6'
  const svgCls = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5'
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-lg', cls)}
      style={
        integration.brandColor
          ? { backgroundColor: integration.brandColor, color: '#ffffff' }
          : undefined
      }
    >
      {integration.iconSvgPath ? (
        <svg viewBox="0 0 24 24" className={svgCls} fill="currentColor">
          <path d={integration.iconSvgPath} />
        </svg>
      ) : (
        <span className="text-sm font-semibold">{integration.name.charAt(0)}</span>
      )}
    </span>
  )
}

function formatToolName(rawId: string): string {
  const parts = rawId.split('__')
  if (parts.length < 3) return rawId
  const name = parts.slice(2).join('__')
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function InstallIntegrationDialog({ integration, onClose, onInstalled, onUninstalled }: Props) {
  const { t } = useTranslation(['connections', 'common'])
  const [credentials, setCredentials] = useState<Record<string, string>>({})

  useEffect(() => {
    setCredentials({})
  }, [integration?.id])

  const handleOpenLink = async (url: string) => {
    try {
      if (window.openloafElectron?.openExternal) {
        await window.openloafElectron.openExternal(url)
      } else {
        window.open(url, '_blank')
      }
    } catch {
      window.open(url, '_blank')
    }
  }

  const installMutation = useMutation(
    trpc.integrations.installIntegration.mutationOptions({
      onSuccess: () => {
        toast.success(
          t('connections:installSuccess', { name: integration?.name ?? '' }),
        )
        onInstalled()
        onClose()
      },
      onError: (err) => toast.error(err.message),
    }),
  )

  const uninstallMutation = useMutation(
    trpc.integrations.uninstallIntegration.mutationOptions({
      onSuccess: () => {
        toast.success(
          t('connections:uninstallSuccess', { name: integration?.name ?? '' }),
        )
        onUninstalled?.(integration!.id)
        onClose()
      },
      onError: (err) => toast.error(err.message),
    }),
  )

  if (!integration) return null

  const isValid = integration.credentials.every(
    (field) => field.required === false || credentials[field.key]?.trim(),
  )

  const tr = (subKey: string, fallback: string) =>
    t(`connections:integrations.${integration.id}.${subKey}`, {
      defaultValue: fallback,
    })

  const localizedName = tr('name', integration.name)

  if (integration.installed) {
    return (
      <InstalledView
        integration={integration}
        localizedName={localizedName}
        description={tr('description', integration.description)}
        onClose={onClose}
        onUninstall={() => uninstallMutation.mutate({ integrationId: integration.id })}
        uninstalling={uninstallMutation.isPending}
      />
    )
  }

  if (integration.authType === 'oauth') {
    return (
      <OAuthInstallView
        integration={integration}
        localizedName={localizedName}
        description={tr('description', integration.description)}
        onClose={onClose}
        onInstalled={onInstalled}
      />
    )
  }

  return (
    <FormDialog
      open={Boolean(integration)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('connections:installDialogTitle', { name: localizedName })}
      description={tr('description', integration.description)}
      submitLabel={t('connections:install')}
      submitting={installMutation.isPending}
      submitDisabled={!isValid}
      autoClose={false}
      contentClassName="sm:max-w-lg"
      onSubmit={async () => {
        await installMutation.mutateAsync({
          integrationId: integration.id,
          credentials,
        })
      }}
    >
      {integration.guide.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
            {t('connections:setupSteps')}
          </div>
          <ol className="space-y-2.5">
            {integration.guide.map((step, idx) => (
              <li key={`${integration.id}-step-${idx}`} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-medium text-secondary-foreground">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {tr(`guide.${idx}.title`, step.title)}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {tr(`guide.${idx}.description`, step.description)}
                  </div>
                  {step.link ? (
                    <button
                      type="button"
                      onClick={() => handleOpenLink(step.link!.href)}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {tr(`guide.${idx}.linkLabel`, step.link.label)}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {integration.credentials.length > 0 && (
        <div className="space-y-3 border-t border-border/60 pt-4">
          {integration.credentials.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <label
                htmlFor={`integration-field-${field.key}`}
                className="text-xs font-medium text-foreground"
              >
                {tr(`credentials.${field.key}.label`, field.label)}
                {field.required !== false ? (
                  <span className="text-destructive"> *</span>
                ) : null}
              </label>
              <Input
                id={`integration-field-${field.key}`}
                type={
                  field.type === 'password'
                    ? 'password'
                    : field.type === 'url'
                      ? 'url'
                      : 'text'
                }
                placeholder={
                  field.placeholder
                    ? tr(`credentials.${field.key}.placeholder`, field.placeholder)
                    : undefined
                }
                value={credentials[field.key] ?? ''}
                onChange={(e) =>
                  setCredentials((prev) => ({
                    ...prev,
                    [field.key]: e.target.value,
                  }))
                }
                className="h-9 rounded-3xl"
                autoComplete="off"
              />
              {field.helpText ? (
                <p className="text-[11px] text-muted-foreground/80">
                  {tr(`credentials.${field.key}.helpText`, field.helpText)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </FormDialog>
  )
}

function OAuthInstallView({
  integration,
  localizedName,
  description,
  onClose,
  onInstalled,
}: {
  integration: IntegrationDefinition
  localizedName: string
  description: string
  onClose: () => void
  onInstalled: () => void
}) {
  const { t } = useTranslation(['connections'])
  const [authorizing, setAuthorizing] = useState(false)
  const popupTimerRef = useRef<number | null>(null)

  const beginOauthMutation = useMutation(
    trpc.integrations.beginOAuthIntegrationInstall.mutationOptions({
      onError: (err) => {
        setAuthorizing(false)
        toast.error(err.message)
      },
    }),
  )

  useEffect(() => {
    return () => {
      if (popupTimerRef.current !== null) {
        window.clearInterval(popupTimerRef.current)
      }
    }
  }, [])

  const handleAuthorize = async () => {
    setAuthorizing(true)
    let result: Awaited<ReturnType<typeof beginOauthMutation.mutateAsync>>
    try {
      result = await beginOauthMutation.mutateAsync({
        integrationId: integration.id,
        serverOrigin: resolveServerUrl(),
      })
    } catch {
      return
    }

    if (result.completed) {
      await invalidateConnectionQueries()
      toast.success(t('connections:installSuccess', { name: localizedName }))
      onInstalled()
      onClose()
      setAuthorizing(false)
      return
    }

    if (!result.authorizationUrl) {
      setAuthorizing(false)
      toast.error(t('connections:errorHint'))
      return
    }

    const popup = window.open(
      result.authorizationUrl,
      'integration-oauth',
      'width=620,height=760',
    )

    if (!popup) {
      setAuthorizing(false)
      toast.error(t('connections:oauthPopupBlocked'))
      return
    }

    popupTimerRef.current = window.setInterval(async () => {
      if (!popup.closed) return

      if (popupTimerRef.current !== null) {
        window.clearInterval(popupTimerRef.current)
        popupTimerRef.current = null
      }

      await invalidateConnectionQueries()
      const integrations = await queryClient.fetchQuery(
        trpc.integrations.listIntegrations.queryOptions(),
      )
      const installed = integrations.find((item) => item.id === integration.id)?.installed

      setAuthorizing(false)

      if (installed) {
        toast.success(t('connections:installSuccess', { name: localizedName }))
        onInstalled()
        onClose()
      }
    }, 500)
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <IntegrationIcon integration={integration} />
            {localizedName}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {integration.guide.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
                {t('connections:setupSteps')}
              </div>
              <ol className="space-y-2.5">
                {integration.guide.map((step, idx) => (
                  <li key={`${integration.id}-oauth-step-${idx}`} className="flex gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-medium text-secondary-foreground">
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">
                        {t(`connections:integrations.${integration.id}.guide.${idx}.title`, {
                          defaultValue: step.title,
                        })}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {t(`connections:integrations.${integration.id}.guide.${idx}.description`, {
                          defaultValue: step.description,
                        })}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="rounded-3xl border border-border/60 bg-secondary/30 px-4 py-3 text-xs leading-6 text-muted-foreground">
            {authorizing
              ? t('connections:oauthPendingHint')
              : t('connections:oauthReadyHint')}
          </div>

          <Button
            type="button"
            className="w-full rounded-full"
            disabled={authorizing || beginOauthMutation.isPending}
            onClick={handleAuthorize}
          >
            {authorizing || beginOauthMutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            {t('connections:authorizeAndConnect')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function InstalledView({
  integration,
  localizedName,
  description,
  onClose,
  onUninstall,
  uninstalling,
}: {
  integration: IntegrationDefinition
  localizedName: string
  description: string
  onClose: () => void
  onUninstall: () => void
  uninstalling: boolean
}) {
  const { t } = useTranslation(['connections', 'common'])

  const statusQuery = useQuery({
    ...trpc.mcp.getMcpServerStatus.queryOptions(),
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data || !integration.mcpServerId) return 2000
      const server = data.find((s) => s.id === integration.mcpServerId)
      if (!server || server.status !== 'connected') return 2000
      return false
    },
    refetchIntervalInBackground: false,
  })

  const reconnectMutation = useMutation(
    trpc.mcp.testMcpConnection.mutationOptions({
      onSuccess: () => {
        statusQuery.refetch()
      },
      onError: (err) => {
        toast.error(err.message)
      },
    }),
  )

  const serverInfo = useMemo(() => {
    if (!integration.mcpServerId) return null
    return (statusQuery.data ?? []).find((s) => s.id === integration.mcpServerId) ?? null
  }, [statusQuery.data, integration.mcpServerId])

  const status = serverInfo?.status ?? 'disconnected'
  const errorMsg = serverInfo?.error
  const isReconnecting = status === 'connecting' || reconnectMutation.isPending

  const isConnected = status === 'connected'

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <IntegrationIcon integration={integration} />
            {localizedName}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
            <div className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              isConnected && 'bg-emerald-500/10',
              isReconnecting && 'bg-sky-500/10',
              status === 'error' && 'bg-destructive/10',
              status === 'disconnected' && 'bg-muted/40',
            )}>
              {isConnected && <Check className="h-4 w-4 text-emerald-500" />}
              {isReconnecting && <Loader2 className="h-4 w-4 animate-spin text-sky-500" />}
              {status === 'error' && <span className="h-2 w-2 rounded-full bg-destructive" />}
              {status === 'disconnected' && <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">
                {isReconnecting
                  ? t('connections:serverStatus.connecting')
                  : t(`connections:serverStatus.${status}`)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {isReconnecting && t('connections:connectingHint')}
                {status === 'error' && (errorMsg ?? t('connections:errorHint'))}
                {status === 'disconnected' && t('connections:disconnectedHint')}
              </div>
            </div>
            {!isConnected && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
                disabled={reconnectMutation.isPending}
                onClick={() => {
                  if (integration.mcpServerId) {
                    reconnectMutation.mutate({ id: integration.mcpServerId })
                  }
                }}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', reconnectMutation.isPending && 'animate-spin')} />
              </Button>
            )}
          </div>

          {isConnected && integration.probeTool && (
            <ProbeResult
              serverId={integration.mcpServerId!}
              probeTool={integration.probeTool}
            />
          )}

          <Button
            type="button"
            variant="ghost"
            className="w-full rounded-full text-muted-foreground hover:text-destructive"
            disabled={uninstalling}
            onClick={onUninstall}
          >
            {uninstalling ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t('connections:remove')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProbeResult({
  serverId,
  probeTool,
}: {
  serverId: string
  probeTool: NonNullable<IntegrationDefinition['probeTool']>
}) {
  const { t } = useTranslation(['connections'])

  const probeMutation = useMutation(
    trpc.mcp.callMcpTool.mutationOptions(),
  )

  useEffect(() => {
    probeMutation.mutate({ serverId, toolName: probeTool.toolName, args: probeTool.args })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, probeTool.toolName, JSON.stringify(probeTool.args ?? {})])

  const items = useMemo(() => {
    if (!probeMutation.data?.ok || !probeMutation.data.data) return []
    return extractProbeItems(probeMutation.data.data, t)
  }, [probeMutation.data, t])

  if (probeMutation.isPending) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('connections:probeLoading')}
        </div>
      </div>
    )
  }

  if (probeMutation.isError || items.length === 0) {
    return null
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <FileText className="h-3 w-3" />
        {probeTool.label}
      </div>
      <div className="space-y-1.5">
        {items.slice(0, 5).map((item, idx) => (
          <div key={idx} className="text-sm text-foreground truncate">
            {item}
          </div>
        ))}
        {items.length > 5 && (
          <div className="text-[11px] text-muted-foreground">
            {t('connections:probeMore', { count: items.length - 5 })}
          </div>
        )}
      </div>
    </div>
  )
}

async function invalidateConnectionQueries(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: trpc.integrations.listIntegrations.queryOptions().queryKey,
    }),
    queryClient.invalidateQueries({
      queryKey: trpc.mcp.getMcpServers.queryOptions({}).queryKey,
    }),
    queryClient.invalidateQueries({
      queryKey: trpc.mcp.getMcpServerStatus.queryOptions().queryKey,
    }),
  ])
}

function extractProbeItems(
  data: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string[] {
  if (!data || typeof data !== 'object') return []
  const result = data as Record<string, unknown>

  // Notion search result: { results: [{ object, id, properties: { title/title_plain_text }}] }
  if (Array.isArray(result.results)) {
    return (result.results as Array<Record<string, unknown>>).map((item) => {
      const props = item.properties as Record<string, unknown> | undefined
      if (!props) return String(item.id ?? item.title ?? '')
      const titleProp = (Object.values(props) as Array<Record<string, unknown>>).find(
        (p) => p.type === 'title',
      )
      if (titleProp?.title && Array.isArray(titleProp.title)) {
        return (titleProp.title as Array<Record<string, string>>)
          .map((t) => t.plain_text ?? '')
          .join('')
      }
      return String(item.id ?? '')
    })
  }

  // Generic array of strings/objects
  if (Array.isArray(data)) {
    return (data as unknown[]).map((item) =>
      typeof item === 'string' ? item : JSON.stringify(item),
    )
  }

  const notionSelfItems = extractNotionSelfProbeItems(result, t)
  if (notionSelfItems.length > 0) {
    return notionSelfItems
  }

  return Object.entries(result)
    .slice(0, 5)
    .map(([key, value]) => `${formatProbeKey(key)}: ${formatProbeValue(value)}`)
}

function extractNotionSelfProbeItems(
  result: Record<string, unknown>,
  t: (key: string, options?: Record<string, unknown>) => string,
): string[] {
  const bot = asRecord(result.bot)
  const owner = asRecord(bot?.owner ?? result.owner)
  const items: string[] = []

  const workspaceName = readString(bot?.workspace_name ?? result.workspace_name)
  const workspaceId = readString(bot?.workspace_id ?? result.workspace_id)
  const botName = readString(result.name ?? bot?.name)
  const ownerType = readString(owner?.type)

  if (workspaceName) {
    items.push(t('connections:probeFields.workspace', { value: workspaceName }))
  }
  if (workspaceId) {
    items.push(t('connections:probeFields.workspaceId', { value: workspaceId }))
  }
  if (botName) {
    items.push(t('connections:probeFields.bot', { value: botName }))
  }
  if (ownerType) {
    items.push(t('connections:probeFields.owner', { value: ownerType }))
  }

  return items
}

function formatProbeKey(raw: string): string {
  return raw.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatProbeValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => formatProbeValue(item)).join(', ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return ''
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
