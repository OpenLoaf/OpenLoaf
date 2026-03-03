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

import { type ReactNode, memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { trpc } from '@/utils/trpc'
import {
  StackPanelSlotCtx,
  type StackPanelSlot,
} from '@/hooks/use-stack-panel-slot'
import { AgentDetailPanel } from './AgentDetailPanel'

type AgentSummary = {
  name: string
  path: string
  folderName: string
  scope: string
}

/** Standalone wrapper that renders the master agent detail panel as a settings menu. */
export const MasterAgentSettings = memo(function MasterAgentSettings() {
  const { t } = useTranslation(['settings'])
  const [slotContent, setSlotContent] = useState<ReactNode>(null)

  const agentsQuery = useQuery(
    trpc.settings.getAgents.queryOptions({ includeAllProjects: false }),
  )
  const agents = (agentsQuery.data ?? []) as AgentSummary[]

  const masterAgent = useMemo(
    () =>
      agents.find(
        (agent) =>
          agent.folderName === 'master' && agent.scope === 'workspace',
      ),
    [agents],
  )

  const slotCtx = useMemo(
    () => ({
      setSlot: (slot: StackPanelSlot | null) => {
        setSlotContent(slot?.rightSlotBeforeClose ?? null)
      },
    }),
    [],
  )

  if (agentsQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('settings:agent.panel.loadingDetail')}
      </div>
    )
  }

  if (!masterAgent?.path) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('settings:agent.masterNotFound')}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {t('settings:agent.masterSettings')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('settings:agent.masterDescription')}
          </p>
        </div>
        <div className="flex items-center gap-1">{slotContent}</div>
      </div>
      <div className="min-h-0 flex-1">
        <StackPanelSlotCtx.Provider value={slotCtx}>
          <AgentDetailPanel
            agentPath={masterAgent.path}
            scope="workspace"
            isSystem
          />
        </StackPanelSlotCtx.Provider>
      </div>
    </div>
  )
})
