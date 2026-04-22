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

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient, trpc } from '@/utils/trpc'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@openloaf/ui/button'
import { Blocks, Check, Loader2, PlugZap, Settings2 } from 'lucide-react'
import type { IntegrationDefinition } from '@openloaf/api/types/integrations'
import { openSettingsTab } from '@/lib/globalShortcuts'
import { InstallIntegrationDialog } from './InstallIntegrationDialog'
import { WeChatConnectionDialog } from './WeChatConnectionDialog'
import {
  WECHAT_INTEGRATION_ID,
  buildWeChatIntegrationDefinition,
} from './wechatIntegrationMeta'

// Category-driven ambient gradients for the card header strip.
const CATEGORY_GRADIENTS: Record<string, string> = {
  productivity:
    'from-violet-100 to-fuchsia-50 dark:from-violet-900/30 dark:to-fuchsia-900/20',
  communication:
    'from-sky-100 to-blue-50 dark:from-sky-900/30 dark:to-blue-900/20',
  storage:
    'from-emerald-100 to-green-50 dark:from-emerald-900/30 dark:to-green-900/20',
  dev: 'from-amber-100 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/20',
  ai: 'from-rose-100 to-pink-50 dark:from-rose-900/30 dark:to-pink-900/20',
}

export function ConnectionsMarketPage() {
  const { t } = useTranslation(['connections'])
  const [dialogIntegration, setDialogIntegration] = useState<IntegrationDefinition | null>(
    null,
  )
  const [wechatDialogOpen, setWechatDialogOpen] = useState(false)

  const integrationsQuery = useQuery(
    trpc.integrations.listIntegrations.queryOptions(),
  )
  const wechatAccountsQuery = useQuery(trpc.wechat.listAccounts.queryOptions())

  // Merge MCP-backed integrations with first-class modules (e.g. WeChat).
  // Kept client-side because custom modules live outside the MCP registry.
  const mcpIntegrations = integrationsQuery.data ?? []
  const wechatInstalled = (wechatAccountsQuery.data?.length ?? 0) > 0
  const integrations: IntegrationDefinition[] = [
    ...mcpIntegrations,
    buildWeChatIntegrationDefinition(wechatInstalled),
  ]

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: trpc.integrations.listIntegrations.queryOptions().queryKey,
    })
    queryClient.invalidateQueries({
      queryKey: trpc.mcp.getMcpServers.queryOptions({}).queryKey,
    })
    queryClient.invalidateQueries({
      queryKey: trpc.mcp.getMcpServerStatus.queryOptions().queryKey,
    })
  }

  const uninstallMutation = useMutation(
    trpc.integrations.uninstallIntegration.mutationOptions({
      onSuccess: (_, variables) => {
        const def = integrations.find((i) => i.id === variables.integrationId)
        toast.success(t('connections:uninstallSuccess', { name: def?.name ?? '' }))
        invalidate()
      },
      onError: (err) => toast.error(err.message),
    }),
  )

  const handleAction = (integration: IntegrationDefinition) => {
    // WeChat: always open the account-management dialog (bind / list / unbind)
    // regardless of whether any account is already bound.
    if (integration.id === WECHAT_INTEGRATION_ID) {
      setWechatDialogOpen(true)
      return
    }
    if (integration.installed) {
      uninstallMutation.mutate({ integrationId: integration.id })
    } else {
      setDialogIntegration(integration)
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      {/* Header */}
      <div className="border-b px-8 py-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
              <Blocks className="h-5 w-5 text-foreground/70" />
              {t('connections:title')}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              {t('connections:subtitle')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {t('connections:totalCount', { count: integrations.length })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-3xl px-3 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
              onClick={() => openSettingsTab('mcp')}
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              {t('connections:advancedMcp')}
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {integrationsQuery.isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[160px] animate-pulse rounded-3xl bg-muted/40" />
            ))}
          </div>
        ) : integrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <PlugZap className="h-10 w-10 text-muted-foreground/30" />
            <div className="text-sm text-muted-foreground">
              {t('connections:emptyTitle')}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
            {integrations.map((integration) => {
              const isInstalled = integration.installed
              const pendingUninstall =
                uninstallMutation.isPending &&
                uninstallMutation.variables?.integrationId === integration.id
              const gradient =
                CATEGORY_GRADIENTS[integration.category] ??
                CATEGORY_GRADIENTS.productivity
              return (
                <div
                  key={integration.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleAction(integration)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleAction(integration)
                    }
                  }}
                  className={cn(
                    'group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-none transition-all duration-150 hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30',
                  )}
                >
                  {/* Top strip */}
                  <div
                    className={cn(
                      'flex items-start justify-between gap-3 bg-gradient-to-br px-5 pt-4 pb-4',
                      gradient,
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-background/80 text-foreground shadow-sm ring-1 ring-border/40"
                        style={
                          integration.iconUrl
                            ? undefined
                            : integration.brandColor
                              ? {
                                  backgroundColor: integration.brandColor,
                                  color: '#ffffff',
                                }
                              : undefined
                        }
                      >
                        {integration.iconUrl ? (
                          <img
                            src={integration.iconUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            aria-hidden="true"
                          />
                        ) : integration.iconSvgPath ? (
                          <svg
                            viewBox="0 0 24 24"
                            className="h-[26px] w-[26px]"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d={integration.iconSvgPath} />
                          </svg>
                        ) : (
                          <span className="text-base font-semibold">
                            {integration.name.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {t(`connections:integrations.${integration.id}.name`, {
                            defaultValue: integration.name,
                          })}
                        </div>
                        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                          {t(`connections:category.${integration.category}`, {
                            defaultValue: integration.category,
                          })}
                        </div>
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      className={cn(
                        'h-7 rounded-full px-3 text-xs shadow-none transition-colors duration-150',
                        isInstalled
                          ? 'bg-secondary text-secondary-foreground hover:bg-accent'
                          : 'bg-foreground text-background hover:bg-foreground/85',
                      )}
                      disabled={pendingUninstall}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAction(integration)
                      }}
                    >
                      {pendingUninstall ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isInstalled ? (
                        <>
                          <Check className="mr-1 h-3 w-3" />
                          {t('connections:uninstall')}
                        </>
                      ) : (
                        t('connections:install')
                      )}
                    </Button>
                  </div>

                  {/* Body */}
                  <div className="flex flex-1 flex-col px-5 pb-4 pt-3.5">
                    <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {t(`connections:integrations.${integration.id}.description`, {
                        defaultValue: integration.description,
                      })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Install dialog (generic MCP-backed integrations) */}
      <InstallIntegrationDialog
        integration={dialogIntegration}
        onClose={() => setDialogIntegration(null)}
        onInstalled={() => {
          invalidate()
        }}
      />

      {/* WeChat: first-class module with its own binding flow */}
      <WeChatConnectionDialog
        open={wechatDialogOpen}
        onOpenChange={setWechatDialogOpen}
      />
    </div>
  )
}
