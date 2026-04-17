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

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@openloaf/ui/button'
import { Badge } from '@openloaf/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@openloaf/ui/tooltip'
import {
  Check,
  Download,
  ArrowUpCircle,
  Star,
  ShieldCheck,
  Loader2,
} from 'lucide-react'

export type MarketSkillItem = {
  id: string
  folderName: string
  name: string
  description: string
  summary?: string
  category?: string | null
  tags: string[]
  repoLabel: string
  isOfficial: boolean
  qualityScore?: number | null
  downloadCount: number
  rating: number
  ratingCount: number
  version: string
  updatedAt: string
  installed?: boolean
  hasUpdate?: boolean
}

type SkillMarketCardProps = {
  skill: MarketSkillItem
  onInstall: (skillId: string) => void
  onDetail: (skillId: string) => void
  isInstalling?: boolean
}

/** Format download count for display. */
function formatDownloadCount(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}w`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
  return String(count)
}

/** Render rating stars. */
function RatingStars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const fullStars = Math.floor(rating)
  const hasHalf = rating - fullStars >= 0.5
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            iconSize,
            i < fullStars
              ? 'fill-amber-400 text-amber-400'
              : i === fullStars && hasHalf
                ? 'fill-amber-400/50 text-amber-400'
                : 'text-muted-foreground/30',
          )}
        />
      ))}
    </div>
  )
}

export { RatingStars }

export function SkillMarketCard({
  skill,
  onInstall,
  onDetail,
  isInstalling,
}: SkillMarketCardProps) {
  const { t } = useTranslation('settings')

  return (
    <div
      data-testid="skill-market-card"
      data-skill-id={skill.id}
      data-installed={skill.installed ? 'true' : 'false'}
      data-has-update={skill.hasUpdate ? 'true' : 'false'}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-3xl border border-border/70',
        'bg-background transition-all duration-200 hover:border-foreground/40 cursor-pointer',
      )}
      onClick={() => onDetail(skill.id)}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5 px-3.5 pt-3 pb-1.5">
        {/* Icon placeholder */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-muted/60 text-base">
          {skill.isOfficial ? (
            <ShieldCheck className="h-4.5 w-4.5 text-blue-500" />
          ) : (
            <span className="text-sm text-muted-foreground">
              {skill.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">
              {skill.name}
            </span>
            {skill.isOfficial ? (
              <Badge
                variant="secondary"
                className="h-4 shrink-0 rounded-full px-1.5 text-[10px] font-normal bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
              >
                {t('skills.marketplace.official', { defaultValue: 'Official' })}
              </Badge>
            ) : null}
          </div>
          <span className="text-[11px] text-muted-foreground/60">
            v{skill.version}
          </span>
        </div>
      </div>

      {/* Description */}
      <div className="flex-1 px-3.5 pb-2">
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {skill.summary || skill.description || skill.name}
        </p>
      </div>

      {/* Tags */}
      {skill.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1 px-3.5 pb-2">
          {skill.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="h-4.5 rounded-full px-1.5 text-[10px] font-normal text-muted-foreground/70 border-border/50"
            >
              {tag}
            </Badge>
          ))}
          {skill.tags.length > 3 ? (
            <span className="text-[10px] text-muted-foreground/50">
              +{skill.tags.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border/40 px-3.5 py-2">
        <div className="flex items-center gap-3">
          {/* Rating */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <RatingStars rating={skill.rating} />
                <span className="text-[10px] tabular-nums text-muted-foreground/60">
                  ({skill.ratingCount})
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {t('skills.marketplace.ratingTooltip', {
                rating: skill.rating.toFixed(1),
                count: skill.ratingCount,
                defaultValue: '{{rating}} / 5 ({{count}} ratings)',
              })}
            </TooltipContent>
          </Tooltip>

          {/* Downloads */}
          <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
            <Download className="h-2.5 w-2.5" />
            <span className="tabular-nums">{formatDownloadCount(skill.downloadCount)}</span>
          </div>
        </div>

        {/* Install button */}
        <Button
          type="button"
          size="sm"
          data-testid="skill-market-card-install"
          variant={skill.installed && !skill.hasUpdate ? 'ghost' : 'secondary'}
          className={cn(
            'h-7 rounded-full px-3 text-xs transition-colors duration-150',
            skill.installed && !skill.hasUpdate
              ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
              : skill.hasUpdate
                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/50'
                : 'bg-secondary text-secondary-foreground hover:bg-accent',
          )}
          disabled={isInstalling || (skill.installed && !skill.hasUpdate)}
          onClick={(e) => {
            e.stopPropagation()
            onInstall(skill.id)
          }}
        >
          {isInstalling ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              {t('skills.marketplace.installing', { defaultValue: 'Installing...' })}
            </>
          ) : skill.installed && !skill.hasUpdate ? (
            <>
              <Check className="mr-1 h-3 w-3" />
              {t('skills.marketplace.installed', { defaultValue: 'Installed' })}
            </>
          ) : skill.hasUpdate ? (
            <>
              <ArrowUpCircle className="mr-1 h-3 w-3" />
              {t('skills.marketplace.update', { defaultValue: 'Update' })}
            </>
          ) : (
            t('skills.marketplace.install', { defaultValue: 'Install' })
          )}
        </Button>
      </div>
    </div>
  )
}
