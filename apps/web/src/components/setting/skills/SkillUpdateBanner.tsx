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
import { cn } from '@/lib/utils'
import { Button } from '@openloaf/ui/button'
import {
  ArrowUpCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'
import type { MarketSkillItem } from './SkillMarketCard'

type SkillUpdateBannerProps = {
  updatableSkills: MarketSkillItem[]
  onUpdateOne: (skillId: string) => void
  onUpdateAll: () => void
  updatingIds?: Set<string>
  isUpdatingAll?: boolean
}

export function SkillUpdateBanner({
  updatableSkills,
  onUpdateOne,
  onUpdateAll,
  updatingIds,
  isUpdatingAll,
}: SkillUpdateBannerProps) {
  const { t } = useTranslation('settings')
  const [expanded, setExpanded] = useState(false)

  if (updatableSkills.length === 0) return null

  return (
    <div className="mx-4 mt-3 rounded-2xl border border-amber-200/60 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/20">
      {/* Summary bar */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400 transition-colors duration-150 hover:text-amber-800 dark:hover:text-amber-300"
          onClick={() => setExpanded(!expanded)}
        >
          <ArrowUpCircle className="h-4 w-4" />
          <span>
            {t('skills.marketplace.updatesAvailable', {
              count: updatableSkills.length,
              defaultValue: '{{count}} skill update(s) available',
            })}
          </span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 rounded-full px-3 text-xs text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-950/40 transition-colors duration-150"
          disabled={isUpdatingAll}
          onClick={onUpdateAll}
        >
          {isUpdatingAll ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              {t('skills.marketplace.updatingAll', { defaultValue: 'Updating...' })}
            </>
          ) : (
            t('skills.marketplace.updateAll', { defaultValue: 'Update All' })
          )}
        </Button>
      </div>

      {/* Expandable list */}
      {expanded ? (
        <div className="border-t border-amber-200/40 dark:border-amber-800/30 px-4 py-2 space-y-1.5">
          {updatableSkills.map((skill) => {
            const isUpdating = updatingIds?.has(skill.id) || isUpdatingAll
            return (
              <div
                key={skill.id}
                className="flex items-center justify-between rounded-xl px-2 py-1.5 hover:bg-amber-100/50 dark:hover:bg-amber-950/30 transition-colors duration-150"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-foreground">{skill.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    v{skill.version}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    'h-6 rounded-full px-2.5 text-xs transition-colors duration-150',
                    'text-amber-700 hover:bg-amber-200/50 dark:text-amber-400 dark:hover:bg-amber-900/40',
                  )}
                  disabled={isUpdating}
                  onClick={() => onUpdateOne(skill.id)}
                >
                  {isUpdating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    t('skills.marketplace.update', { defaultValue: 'Update' })
                  )}
                </Button>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
