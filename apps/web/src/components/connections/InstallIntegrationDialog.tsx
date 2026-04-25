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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryClient, trpc } from '@/utils/trpc'
import { openExternalUrl } from '@/lib/saas-auth'
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
import { ExternalLink, FileText, Loader2, RefreshCw, Table } from 'lucide-react'
import { ConnectionAccountRow } from './ConnectionAccountRow'
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

/** 5-minute ceiling aligned with the server-side status TTL (10 min). */
const OAUTH_POLL_TIMEOUT_MS = 5 * 60 * 1000
const OAUTH_POLL_INTERVAL_MS = 1000

/**
 * Shared OAuth begin/poll lifecycle for integrations.
 *
 * Used by both first-time install (`OAuthInstallView`) and post-install
 * re-authorization (`InstalledView` when the saved OAuth token has expired).
 * The server side is idempotent — `beginOAuthIntegrationInstall` will create
 * or reuse the MCP server config, so calling it twice on the same integration
 * is safe; the second call replaces the stale token and triggers a fresh MCP
 * connect via `finalizeAuthorizedIntegrationInstall`.
 */
function useOAuthAuthorizeFlow(params: {
  integration: IntegrationDefinition
  localizedName: string
  /** Called after a successful authorize + connect cycle. Host view decides
   *  whether to close the dialog (first-time install) or stay open to reflect
   *  the refreshed connected state (re-auth). */
  onCompleted: () => void | Promise<void>
}) {
  const { integration, localizedName, onCompleted } = params
  const { t } = useTranslation(['connections', 'common'])
  const [oauthState, setOauthState] = useState<string | null>(null)
  const pollTimerRef = useRef<number | null>(null)
  const timeoutTimerRef = useRef<number | null>(null)

  const beginOauthMutation = useMutation(
    trpc.integrations.beginOAuthIntegrationInstall.mutationOptions({
      onError: (err) => {
        toast.error(err.message)
      },
    }),
  )
  const cancelOauthMutation = useMutation(
    trpc.integrations.cancelOAuthIntegrationInstall.mutationOptions(),
  )

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (timeoutTimerRef.current !== null) {
      window.clearTimeout(timeoutTimerRef.current)
      timeoutTimerRef.current = null
    }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const awaiting = oauthState !== null
  const busy = awaiting || beginOauthMutation.isPending

  const handleSuccess = useCallback(async () => {
    stopPolling()
    setOauthState(null)
    await invalidateConnectionQueries()
    toast.success(t('connections:installSuccess', { name: localizedName }))
    await onCompleted()
  }, [localizedName, onCompleted, stopPolling, t])

  const handleFailure = useCallback(
    (message: string) => {
      stopPolling()
      setOauthState(null)
      toast.error(message)
    },
    [stopPolling],
  )

  const cancel = useCallback(() => {
    const currentState = oauthState
    stopPolling()
    setOauthState(null)
    if (currentState) {
      cancelOauthMutation.mutate({ state: currentState })
    }
  }, [cancelOauthMutation, oauthState, stopPolling])

  const authorize = useCallback(async () => {
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
      await handleSuccess()
      return
    }

    if (!result.authorizationUrl || !result.state) {
      toast.error(t('connections:errorHint'))
      return
    }

    const pendingState = result.state
    setOauthState(pendingState)

    try {
      await openExternalUrl(result.authorizationUrl)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('connections:oauthOpenFailed')
      handleFailure(message)
      return
    }

    pollTimerRef.current = window.setInterval(async () => {
      try {
        const status = await queryClient.fetchQuery(
          trpc.integrations.pollOAuthIntegrationInstall.queryOptions({
            state: pendingState,
          }),
        )
        if (status.status === 'completed') {
          await handleSuccess()
        } else if (status.status === 'error') {
          handleFailure(status.error ?? t('connections:errorHint'))
        } else if (status.status === 'expired') {
          handleFailure(t('connections:oauthExpiredHint'))
        }
        // pending: keep polling
      } catch {
        // transient fetch errors: keep polling until deadline
      }
    }, OAUTH_POLL_INTERVAL_MS)

    timeoutTimerRef.current = window.setTimeout(() => {
      stopPolling()
      setOauthState(null)
      cancelOauthMutation.mutate({ state: pendingState })
      toast.error(t('connections:oauthTimeoutHint'))
    }, OAUTH_POLL_TIMEOUT_MS)
  }, [
    beginOauthMutation,
    cancelOauthMutation,
    handleFailure,
    handleSuccess,
    integration.id,
    stopPolling,
    t,
  ])

  return {
    awaiting,
    busy,
    isPreparing: beginOauthMutation.isPending,
    oauthState,
    authorize,
    cancel,
    stopPolling,
  }
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
  const { t } = useTranslation(['connections', 'common'])

  const handleCompleted = useCallback(async () => {
    onInstalled()
    onClose()
  }, [onClose, onInstalled])

  const {
    awaiting,
    busy,
    isPreparing: beginOauthPending,
    authorize,
    cancel,
  } = useOAuthAuthorizeFlow({
    integration,
    localizedName,
    onCompleted: handleCompleted,
  })

  const handleCancel = cancel
  const handleAuthorize = authorize
  const beginOauthMutation = { isPending: beginOauthPending } as { isPending: boolean }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open) return
        // cancel() already stops polling + clears oauthState + cancels any
        // pending server-side begin session. Safe to call even when idle.
        cancel()
        onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg [&>*]:min-w-0">
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
            {beginOauthMutation.isPending
              ? t('connections:oauthPreparingHint')
              : awaiting
                ? t('connections:oauthPendingHint')
                : t('connections:oauthReadyHint')}
          </div>

          {awaiting || beginOauthMutation.isPending ? (
            <div className="flex gap-2">
              <Button
                type="button"
                disabled
                className="flex-1 rounded-full"
              >
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                {beginOauthMutation.isPending
                  ? t('connections:oauthPreparing')
                  : t('connections:oauthWaiting')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-full"
                onClick={handleCancel}
                disabled={beginOauthMutation.isPending}
              >
                {t('common:cancel')}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              className="w-full rounded-full"
              disabled={busy}
              onClick={handleAuthorize}
            >
              {t('connections:authorizeAndConnect')}
            </Button>
          )}
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

  // OAuth re-authorize flow for when the saved token has expired. For
  // OAuth integrations, `testMcpConnection` is a dead end — it just re-runs
  // the MCP handshake with the same stale token and fails again the same
  // way. The only recovery is to open the provider's consent screen in a
  // browser and let the user refresh the token.
  const handleReauthComplete = useCallback(async () => {
    await statusQuery.refetch()
  }, [statusQuery])
  const {
    awaiting: reauthAwaiting,
    busy: reauthBusy,
    authorize: reauthorize,
    cancel: cancelReauth,
  } = useOAuthAuthorizeFlow({
    integration,
    localizedName,
    onCompleted: handleReauthComplete,
  })

  const serverInfo = useMemo(() => {
    if (!integration.mcpServerId) return null
    return (statusQuery.data ?? []).find((s) => s.id === integration.mcpServerId) ?? null
  }, [statusQuery.data, integration.mcpServerId])

  const status = serverInfo?.status ?? 'disconnected'
  const errorMsg = serverInfo?.error
  const isReconnecting = status === 'connecting' || reconnectMutation.isPending
  const isConnected = status === 'connected'

  const probeTool = integration.probeTool
  const identityQuery = useQuery({
    ...trpc.integrations.getIntegrationIdentity.queryOptions({
      integrationId: integration.id,
    }),
    // Light polling only while the cache is still empty — stops as soon as
    // the backend's MCP-connect listener writes a value.
    refetchInterval: (query) => {
      if (!isConnected || !probeTool) return false
      return query.state.data?.identity ? false : 1000
    },
    refetchIntervalInBackground: false,
    enabled: Boolean(isConnected && probeTool),
    staleTime: 60_000,
  })
  const identity = identityQuery.data?.identity ?? null
  const identityLoading =
    isConnected
    && Boolean(probeTool)
    && !identity
    && (identityQuery.isPending || identityQuery.isFetching)

  const workspaceName = isConnected ? identity?.workspaceName : undefined
  const ownerDisplayName = isConnected ? identity?.ownerName : undefined
  const ownerEmail = isConnected ? identity?.ownerEmail : undefined
  const primaryIdentity = workspaceName ?? ownerDisplayName
  const hasDetailItems = Boolean(
    isConnected && identity && (identity.workspaceId || identity.botName),
  )

  const primaryLabel = primaryIdentity
    ?? (isReconnecting
      ? t('connections:serverStatus.connecting')
      : t(`connections:serverStatus.${status}`))

  const secondaryLabel = (() => {
    if (isReconnecting) return t('connections:connectingHint')
    if (status === 'error') return errorMsg ?? t('connections:errorHint')
    if (status === 'disconnected') return t('connections:disconnectedHint')
    if (isConnected) {
      if (workspaceName) {
        return ownerDisplayName
          ? t('connections:workspaceOwnedBy', { name: ownerDisplayName })
          : t('connections:serverStatus.connected')
      }
      if (ownerDisplayName) {
        // No workspace name available (Notion MCP doesn't expose it) — show
        // the authorising user's email underneath their name instead.
        return ownerEmail ?? t('connections:serverStatus.connected')
      }
      if (identityLoading) return t('connections:probeLoading')
    }
    return null
  })()

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <IntegrationIcon integration={integration} />
            {localizedName}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-3">
          <ConnectionAccountRow
            status={
              isReconnecting
                ? 'connecting'
                : status === 'connected'
                  ? 'connected'
                  : status === 'error'
                    ? 'error'
                    : 'disconnected'
            }
            title={primaryLabel}
            subtitle={secondaryLabel ?? undefined}
            onRemove={onUninstall}
            removing={uninstalling}
          />

          {hasDetailItems && identity && (
            <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
              <div className="space-y-1 text-xs text-muted-foreground">
                {identity.workspaceId && (
                  <div className="truncate">
                    {t('connections:probeFields.workspaceId', { value: identity.workspaceId })}
                  </div>
                )}
                {identity.botName && (
                  <div className="truncate">
                    {t('connections:probeFields.bot', { value: identity.botName })}
                  </div>
                )}
              </div>
            </div>
          )}

          {isConnected && identity?.accessiblePages && identity.accessiblePages.length > 0 && (
            <AccessiblePagesCard pages={identity.accessiblePages} />
          )}

          {!isConnected && integration.mcpServerId && (
            integration.authType === 'oauth' ? (
              // Expired-token recovery: a plain "test connection" loops forever
              // with the same OAuth error, so offer the real fix — reopen the
              // provider's consent screen in a browser and swap in a fresh
              // token. Falls back to an in-flight cancel button while awaiting
              // the callback.
              reauthAwaiting || reauthBusy ? (
                <div className="flex gap-2">
                  <Button type="button" disabled className="flex-1 rounded-full">
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    {reauthAwaiting
                      ? t('connections:oauthWaiting')
                      : t('connections:oauthPreparing')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-full"
                    onClick={cancelReauth}
                  >
                    {t('common:cancel')}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  className="w-full rounded-full"
                  onClick={() => void reauthorize()}
                >
                  {t('connections:authorizeAndConnect')}
                </Button>
              )
            ) : (
              !isReconnecting && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full rounded-full text-xs text-muted-foreground"
                  disabled={reconnectMutation.isPending}
                  onClick={() => {
                    if (integration.mcpServerId) {
                      reconnectMutation.mutate({ id: integration.mcpServerId })
                    }
                  }}
                >
                  <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', reconnectMutation.isPending && 'animate-spin')} />
                  {t('connections:reconnect')}
                </Button>
              )
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
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

type AccessiblePage = {
  id: string
  title: string
  type?: string
  timestamp?: string
}

function AccessiblePagesCard({ pages }: { pages: AccessiblePage[] }) {
  const { t, i18n } = useTranslation(['connections'])

  const handleOpen = async (page: AccessiblePage) => {
    const bareId = page.id.replace(/-/g, '')
    const url = `https://www.notion.so/${bareId}`
    try {
      if (window.openloafElectron?.openExternal) {
        await window.openloafElectron.openExternal(url)
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  // Split by type so users see the shape of their authorised scope at a
  // glance ("1 database + N pages") instead of a homogeneous list. Within
  // each group we sort by last-edit time, descending.
  const groups = [
    {
      key: 'database' as const,
      label: t('connections:pageTypes.database'),
      items: pages
        .filter((p) => p.type === 'database')
        .slice()
        .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? '')),
    },
    {
      key: 'page' as const,
      label: t('connections:pageTypes.page'),
      items: pages
        .filter((p) => p.type === 'page')
        .slice()
        .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? '')),
    },
    {
      key: 'other' as const,
      label: t('connections:pageTypes.other'),
      items: pages
        .filter((p) => p.type !== 'database' && p.type !== 'page')
        .slice()
        .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? '')),
    },
  ].filter((g) => g.items.length > 0)

  return (
    <div className="min-w-0 rounded-2xl border border-border/60 bg-card px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
          {t('connections:accessiblePages')}
        </div>
        <div className="text-[11px] text-muted-foreground/70">
          {t('connections:accessiblePagesCount', { count: pages.length })}
        </div>
      </div>
      <div className="max-h-60 space-y-3 overflow-y-auto pr-1">
        {groups.map((group) => (
          <div key={group.key} className="min-w-0">
            <div className="mb-1 flex items-center justify-between px-1.5">
              <span className="text-[11px] font-medium text-muted-foreground/70">
                {group.label}
              </span>
              <span className="text-[11px] text-muted-foreground/50">
                {group.items.length}
              </span>
            </div>
            <ul className="space-y-0.5">
              {group.items.map((page) => {
                const Icon = page.type === 'database' ? Table : FileText
                const rel = formatRelativeTime(page.timestamp, i18n.language)
                return (
                  <li key={page.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => void handleOpen(page)}
                      className="flex w-full min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm transition-colors hover:bg-secondary/40"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-foreground/90">
                        {page.title}
                      </span>
                      {rel && (
                        <span className="shrink-0 text-[11px] text-muted-foreground/60">
                          {rel}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Format an ISO timestamp as "3 days ago" / "3 天前", using the browser's
 * `Intl.RelativeTimeFormat` so we inherit the user's current i18n locale.
 */
function formatRelativeTime(iso: string | undefined, locale: string): string | null {
  if (!iso) return null
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return null
  const diffSec = Math.round((ts - Date.now()) / 1000)
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (abs < 60) return rtf.format(diffSec, 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 30 * 86400) return rtf.format(Math.round(diffSec / 86400), 'day')
  if (abs < 365 * 86400) return rtf.format(Math.round(diffSec / (30 * 86400)), 'month')
  return rtf.format(Math.round(diffSec / (365 * 86400)), 'year')
}

