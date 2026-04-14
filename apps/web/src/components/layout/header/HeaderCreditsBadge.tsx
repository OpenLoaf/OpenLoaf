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

import { Sparkles } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@openloaf/ui/tooltip'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { fetchUserProfile } from '@/lib/saas-auth'

export function HeaderCreditsBadge() {
  const { t } = useTranslation('project', { keyPrefix: 'global' })
  const loggedIn = useSaasAuth((s) => s.loggedIn)

  const userProfileQuery = useQuery({
    queryKey: ['saas', 'userProfile'],
    queryFn: fetchUserProfile,
    enabled: loggedIn,
    staleTime: 60_000,
  })

  if (!loggedIn || !userProfileQuery.data) return null

  const balance = Math.floor(userProfileQuery.data.creditsBalance).toLocaleString()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-no-drag="true"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-xs text-foreground hover:bg-foreground/5 transition-colors duration-150"
        >
          <Sparkles className="size-3" aria-hidden="true" />
          <span className="tabular-nums">{balance}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {t('credits')}
      </TooltipContent>
    </Tooltip>
  )
}
