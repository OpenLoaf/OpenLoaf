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
import { Badge } from '@openloaf/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@openloaf/ui/dialog'
import {
  ArrowUpCircle,
  Check,
  Download,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react'
import { useMarketSkillDetail, useRateMarketSkill } from '@/hooks/use-skill-market'
import { openExternalUrl } from '@/lib/saas-auth'
import type { MarketSkillItem } from './SkillMarketCard'
import { RatingStars } from './SkillMarketCard'

type SkillDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Skill ID for fetching detail from the marketplace API. */
  skillId: string | null
  /** List-level skill data used as placeholder while detail loads. */
  skill?: MarketSkillItem | null
  onInstall: (skillId: string) => void
  onUninstall?: (skillId: string) => void
  onRate?: (skillId: string, rating: number) => void
  isInstalling?: boolean
}

/** Interactive star rating selector. */
function StarRating({
  value,
  onChange,
}: {
  value: number
  onChange: (rating: number) => void
}) {
  const [hover, setHover] = useState(0)

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const starValue = i + 1
        return (
          <button
            key={i}
            type="button"
            className="p-0.5 transition-colors duration-150"
            onMouseEnter={() => setHover(starValue)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(starValue)}
          >
            <Star
              className={cn(
                'h-5 w-5',
                (hover || value) >= starValue
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-muted-foreground/30',
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

/** Format a date string to a readable locale string. */
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export function SkillDetailDialog({
  open,
  onOpenChange,
  skillId,
  skill: listSkill,
  onInstall,
  onUninstall,
  onRate,
  isInstalling,
}: SkillDetailDialogProps) {
  const { t } = useTranslation('settings')
  const [userRating, setUserRating] = useState(0)

  // Fetch full detail (including fullContent) from marketplace API
  const { data: detailData, isLoading: isLoadingDetail } = useMarketSkillDetail(
    open ? skillId : null,
  )
  const rateMutation = useRateMarketSkill()

  // Merge: use detail data when available, fall back to list data
  const skill: MarketSkillItem | null = detailData
    ? {
        id: detailData.id,
        folderName: detailData.folderName,
        name: detailData.name,
        description: detailData.description,
        summary: detailData.summary,
        category: detailData.category,
        tags: detailData.tags,
        repoLabel: detailData.repoLabel,
        isOfficial: detailData.isOfficial,
        qualityScore: detailData.qualityScore,
        downloadCount: detailData.downloadCount,
        rating: detailData.rating,
        ratingCount: detailData.ratingCount,
        version: detailData.version,
        updatedAt: detailData.updatedAt,
        installed: listSkill?.installed,
        hasUpdate: listSkill?.hasUpdate,
      }
    : listSkill ?? null

  const skillContent = detailData?.fullContent
  const repoUrl = detailData?.repoUrl
  const isLoadingContent = isLoadingDetail

  if (!skill) return null

  const handleRate = (rating: number) => {
    setUserRating(rating)
    if (onRate) {
      onRate(skill.id, rating)
    } else {
      rateMutation.mutate({ skillId: skill.id, rating })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted/60">
              {skill.isOfficial ? (
                <ShieldCheck className="h-6 w-6 text-blue-500" />
              ) : (
                <span className="text-lg text-muted-foreground">
                  {skill.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                <span className="truncate">{skill.name}</span>
                {skill.isOfficial ? (
                  <Badge
                    variant="secondary"
                    className="h-5 shrink-0 rounded-full px-2 text-[11px] font-normal bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                  >
                    {t('skills.marketplace.official', { defaultValue: 'Official' })}
                  </Badge>
                ) : null}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-sm">
                {skill.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Meta info row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border/40 pb-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <RatingStars rating={skill.rating} size="md" />
            <span className="tabular-nums">
              {skill.rating.toFixed(1)} ({skill.ratingCount})
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            <span className="tabular-nums">
              {skill.downloadCount.toLocaleString()}
            </span>
          </div>
          <span>v{skill.version.length > 8 ? skill.version.slice(-6) : skill.version}</span>
          <span>
            {t('skills.marketplace.updatedAt', {
              date: formatDate(skill.updatedAt),
              defaultValue: 'Updated {{date}}',
            })}
          </span>
          {skill.repoLabel ? (
            repoUrl ? (
              <button
                type="button"
                className="flex items-center gap-1 hover:text-foreground transition-colors duration-150"
                onClick={() => void openExternalUrl(repoUrl)}
              >
                <ExternalLink className="h-3 w-3" />
                {skill.repoLabel}
              </button>
            ) : (
              <span className="flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                {skill.repoLabel}
              </span>
            )
          ) : null}
        </div>

        {/* Tags & Category */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {skill.category ? (
            <Badge
              variant="secondary"
              className="h-5 rounded-full px-2 text-[11px] font-normal"
            >
              {skill.category}
            </Badge>
          ) : null}
          {skill.tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="h-5 rounded-full px-2 text-[11px] font-normal text-muted-foreground/70 border-border/50"
            >
              {tag}
            </Badge>
          ))}
        </div>

        {/* SKILL.md Content */}
        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border/40 bg-muted/20 p-4">
          {isLoadingContent ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : skillContent ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
              <pre className="whitespace-pre-wrap break-words font-sans text-sm">
                {skillContent}
              </pre>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('skills.marketplace.noContent', {
                defaultValue: 'No content available',
              })}
            </p>
          )}
        </div>

        {/* Rating + Action buttons */}
        <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-3 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {t('skills.marketplace.yourRating', { defaultValue: 'Your rating' })}
            </span>
            <StarRating value={userRating} onChange={handleRate} />
          </div>
          <div className="flex items-center gap-2">
          {skill.installed && onUninstall ? (
            <Button
              type="button"
              variant="ghost"
              className="rounded-full px-4 text-destructive hover:bg-destructive/10 transition-colors duration-150"
              onClick={() => onUninstall(skill.id)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t('skills.marketplace.uninstall', { defaultValue: 'Uninstall' })}
            </Button>
          ) : null}

          <Button
            type="button"
            variant={skill.installed && !skill.hasUpdate ? 'ghost' : 'secondary'}
            className={cn(
              'rounded-full px-4 transition-colors duration-150',
              skill.installed && !skill.hasUpdate
                ? 'text-emerald-600 dark:text-emerald-400'
                : skill.hasUpdate
                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/50'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent',
            )}
            disabled={isInstalling || (skill.installed && !skill.hasUpdate)}
            onClick={() => onInstall(skill.id)}
          >
            {isInstalling ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t('skills.marketplace.installing', { defaultValue: 'Installing...' })}
              </>
            ) : skill.installed && !skill.hasUpdate ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {t('skills.marketplace.installed', { defaultValue: 'Installed' })}
              </>
            ) : skill.hasUpdate ? (
              <>
                <ArrowUpCircle className="mr-1.5 h-3.5 w-3.5" />
                {t('skills.marketplace.update', { defaultValue: 'Update' })}
              </>
            ) : (
              <>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {t('skills.marketplace.install', { defaultValue: 'Install' })}
              </>
            )}
          </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
