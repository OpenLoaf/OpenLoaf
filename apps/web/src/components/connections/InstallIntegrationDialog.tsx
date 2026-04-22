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

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { trpc } from '@/utils/trpc'
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
import { Check, ExternalLink, Loader2, RefreshCw, Trash2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IntegrationDefinition } from '@openloaf/api/types/integrations'

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
  const toolIds = serverInfo?.toolIds ?? []
  const errorMsg = serverInfo?.error
  const canReconnect = status === 'error' || status === 'disconnected'
  const isReconnecting = status === 'connecting' || reconnectMutation.isPending

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
              status === 'connected' && 'bg-emerald-500/10',
              isReconnecting && 'bg-sky-500/10',
              status === 'error' && 'bg-destructive/10',
              status === 'disconnected' && 'bg-muted/40',
            )}>
              {status === 'connected' && <Check className="h-4 w-4 text-emerald-500" />}
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
                {status === 'connected' && t('connections:connectedToolCount', { count: toolIds.length })}
                {isReconnecting && t('connections:connectingHint')}
                {status === 'error' && (errorMsg ?? t('connections:errorHint'))}
                {status === 'disconnected' && t('connections:disconnectedHint')}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {canReconnect && (
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-full"
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
            )}
            <Button
              type="button"
              variant="ghost"
              className={cn(
                'rounded-full text-muted-foreground hover:text-destructive',
                !canReconnect && 'w-full',
              )}
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

          {status === 'connected' && toolIds.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Zap className="h-3 w-3" />
                {t('connections:availableTools')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {toolIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
                  >
                    {formatToolName(id)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
