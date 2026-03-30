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

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { Button } from '@openloaf/ui/button'
import { Input } from '@openloaf/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@openloaf/ui/select'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  PackageSearch,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { useMarketSkills, useInstallMarketSkill, useSkillUpdateCheck } from '@/hooks/use-skill-market'
import { trpc } from '@/utils/trpc'
import { SkillMarketCard } from './SkillMarketCard'
import { SkillDetailDialog } from './SkillDetailDialog'
import type { MarketSkillItem } from './SkillMarketCard'

type MarketCategory =
  | 'all'
  | 'development'
  | 'productivity'
  | 'data'
  | 'creative'
  | 'devops'
  | 'documentation'
  | 'testing'
  | 'other'

type MarketSort = 'popular' | 'newest' | 'rating'

const CATEGORIES: MarketCategory[] = [
  'all',
  'development',
  'productivity',
  'data',
  'creative',
  'devops',
  'documentation',
  'testing',
  'other',
]

const SORT_OPTIONS: MarketSort[] = ['popular', 'newest', 'rating']

const CATEGORY_LABELS: Record<MarketCategory, string> = {
  all: 'All',
  development: 'Development',
  productivity: 'Productivity',
  data: 'Data',
  creative: 'Creative',
  devops: 'DevOps',
  documentation: 'Documentation',
  testing: 'Testing',
  other: 'Other',
}

const SORT_LABELS: Record<MarketSort, string> = {
  popular: 'Popular',
  newest: 'Newest',
  rating: 'Top Rated',
}

type SkillMarketplaceProps = {
  projectId?: string
}

export function SkillMarketplace({ projectId }: SkillMarketplaceProps) {
  const { t } = useTranslation('settings')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [category, setCategory] = useState<MarketCategory>('all')
  const [sort, setSort] = useState<MarketSort>('popular')
  const [detailSkillId, setDetailSkillId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery)
      setPage(1)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery])

  const [page, setPage] = useState(1)

  const {
    data: marketData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useMarketSkills({
    search: debouncedQuery || undefined,
    category: category !== 'all' ? category : undefined,
    sort,
    page,
  })

  // Fetch local installed skills to enrich marketplace list
  const localQueryOptions = projectId
    ? trpc.settings.getSkills.queryOptions({ projectId })
    : trpc.settings.getSkills.queryOptions()
  const { data: localSkillsRaw } = useQuery(localQueryOptions)
  const localSkills = (localSkillsRaw ?? []) as Array<{
    folderName: string
    name: string
    marketplace?: { skillId: string; version: string }
  }>

  // Check for updates on installed marketplace skills
  const updateCheckQuery = useSkillUpdateCheck(projectId)

  /** Merge marketplace skills with local installed data. */
  function enrichSkills(
    marketSkills: MarketSkillItem[],
  ): MarketSkillItem[] {
    const installedMap = new Map<string, { version: string }>()
    for (const s of localSkills) {
      if (s.marketplace?.skillId) {
        installedMap.set(s.marketplace.skillId, {
          version: s.marketplace.version,
        })
      }
    }

    const updatesMap = new Map<string, boolean>()
    for (const u of updateCheckQuery.data?.updates ?? []) {
      updatesMap.set(u.skillId, u.hasUpdate)
    }

    return marketSkills.map((skill) => {
      const local = installedMap.get(skill.id)
      return {
        ...skill,
        installed: Boolean(local),
        hasUpdate: local ? (updatesMap.get(skill.id) ?? false) : false,
      }
    })
  }

  const installMutation = useInstallMarketSkill()

  const rawSkills = marketData?.skills ?? []
  const skills = enrichSkills(rawSkills as MarketSkillItem[])
  const totalPages = marketData?.pageCount ?? 1
  const detailSkill = detailSkillId
    ? skills.find((s) => s.id === detailSkillId) ?? null
    : null

  const handleInstall = (skillId: string) => {
    installMutation.mutate({
      skillId,
      scope: projectId ? 'project' : 'global',
      projectId,
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header: search + filters */}
      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-4">
        {/* Search */}
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            type="text"
            placeholder={t('skills.marketplace.searchPlaceholder', {
              defaultValue: 'Search marketplace...',
            })}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 rounded-3xl border-transparent bg-muted/40 pl-8 pr-7 text-sm focus:border-border"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {/* Category filter */}
        <Select
          value={category}
          onValueChange={(v) => { setCategory(v as MarketCategory); setPage(1) }}
        >
          <SelectTrigger className="h-8 w-36 rounded-3xl border-transparent bg-muted/40 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {t(`skills.marketplace.category.${cat}`, {
                  defaultValue: CATEGORY_LABELS[cat],
                })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select
          value={sort}
          onValueChange={(v) => { setSort(v as MarketSort); setPage(1) }}
        >
          <SelectTrigger className="h-8 w-32 rounded-3xl border-transparent bg-muted/40 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {t(`skills.marketplace.sort.${opt}`, {
                  defaultValue: SORT_LABELS[opt],
                })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Refresh */}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-3xl text-muted-foreground hover:text-foreground"
          onClick={() => void refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
        </Button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[160px] animate-pulse rounded-3xl bg-muted/40"
              />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-sm text-destructive">
              {t('skills.marketplace.loadFailed', {
                error: error?.message,
                defaultValue: 'Failed to load marketplace: {{error}}',
              })}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full transition-colors duration-150"
              onClick={() => void refetch()}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {t('skills.marketplace.retry', { defaultValue: 'Retry' })}
            </Button>
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12">
            <PackageSearch className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {debouncedQuery
                ? t('skills.marketplace.noResults', {
                    defaultValue: 'No skills found matching your search',
                  })
                : t('skills.marketplace.empty', {
                    defaultValue: 'No skills available in the marketplace yet',
                  })}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3.5">
              {skills.map((skill) => (
                <SkillMarketCard
                  key={skill.id}
                  skill={skill}
                  onInstall={handleInstall}
                  onDetail={setDetailSkillId}
                  isInstalling={
                    installMutation.isPending &&
                    installMutation.variables?.skillId === skill.id
                  }
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 ? (
              <div className="mt-6 flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-3 text-muted-foreground hover:text-foreground transition-colors duration-150"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                  {t('skills.marketplace.prevPage', { defaultValue: 'Previous' })}
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t('skills.marketplace.pageInfo', {
                    page,
                    totalPages,
                    defaultValue: 'Page {{page}} of {{totalPages}}',
                  })}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-3 text-muted-foreground hover:text-foreground transition-colors duration-150"
                  disabled={page >= totalPages || isFetching}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t('skills.marketplace.nextPage', { defaultValue: 'Next' })}
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Detail dialog */}
      <SkillDetailDialog
        open={detailSkillId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailSkillId(null)
        }}
        skillId={detailSkillId}
        skill={detailSkill}
        onInstall={handleInstall}
        isInstalling={
          installMutation.isPending &&
          installMutation.variables?.skillId === detailSkillId
        }
      />
    </div>
  )
}
