/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * CloudCapBrowseTool — renders the result of the CloudCapBrowse server tool.
 *
 * 用户价值：清晰列出"有哪些能力 + 每项能力对应的模型 + 可用/锁状态 + 积分成本"，
 * 以分类分组为骨架，每项能力作为独立卡片。避免早期版本只显示分类计数的信息空洞感。
 */
'use client'

import * as React from 'react'
import {
  ChevronDownIcon,
  Headphones,
  Image as ImageIcon,
  Sparkles,
  Type,
  Video,
  Wrench,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { cn } from '@/lib/utils'
import OfficeToolShell from './shared/OfficeToolShell'
import { getToolKind } from './shared/office-tool-utils'
import type { AnyToolPart } from './shared/tool-utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TopVariant = {
  id?: string
  name?: string
  tag?: string
  tier?: string | null
  credits?: number | null
  accessible?: boolean | null
}

type Feature = {
  feature?: string
  category?: string
  description?: string
  totalVariants?: number
  topVariants?: TopVariant[]
}

type BrowseOutput = {
  ok?: boolean
  filter?: string | null
  userTier?: string | null
  userCredits?: number | null
  features?: Feature[]
  hint?: string
}

type CategoryKey = 'image' | 'video' | 'audio' | 'text' | 'tools'

// ---------------------------------------------------------------------------
// Category config — 图标、徽标颜色统一在一处维护
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: CategoryKey[] = ['image', 'video', 'audio', 'text', 'tools']

const CATEGORY_ICONS: Record<CategoryKey, React.ComponentType<{ className?: string }>> = {
  image: ImageIcon,
  video: Video,
  audio: Headphones,
  text: Type,
  tools: Wrench,
}

const CATEGORY_ACCENT: Record<CategoryKey, { dot: string; text: string; soft: string }> = {
  image: {
    dot: 'bg-sky-500',
    text: 'text-sky-600 dark:text-sky-400',
    soft: 'bg-sky-500/10 text-sky-600 dark:bg-sky-400/15 dark:text-sky-400',
  },
  video: {
    dot: 'bg-violet-500',
    text: 'text-violet-600 dark:text-violet-400',
    soft: 'bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-400',
  },
  audio: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    soft: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400',
  },
  text: {
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    soft: 'bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400',
  },
  tools: {
    dot: 'bg-zinc-500',
    text: 'text-zinc-600 dark:text-zinc-400',
    soft: 'bg-zinc-500/10 text-zinc-600 dark:bg-zinc-400/15 dark:text-zinc-400',
  },
}

const TIER_ACCENT: Record<string, string> = {
  free: 'bg-foreground/[0.06] text-foreground/65 dark:bg-foreground/[0.08]',
  lite: 'bg-sky-500/10 text-sky-600 dark:bg-sky-400/15 dark:text-sky-400',
  pro: 'bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400',
  premium: 'bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-400',
  infinity: 'bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-400',
}

function normalizeCategory(value: string | undefined): CategoryKey {
  const v = (value ?? '').toLowerCase()
  if (v === 'image' || v === 'video' || v === 'audio' || v === 'text' || v === 'tools') return v
  return 'tools'
}

function getCategoryLabel(t: TFunction, key: CategoryKey): string {
  return t(`tool.cloudCapBrowse.category.${key}`, { defaultValue: key })
}

function getTierLabel(t: TFunction, tier: string): string {
  const normalized = tier.toLowerCase()
  return t(`tool.cloudCapBrowse.tier.${normalized}`, {
    defaultValue: tier.charAt(0).toUpperCase() + tier.slice(1),
  })
}

// ---------------------------------------------------------------------------
// Feature row — 单项能力：只保留名字 + 模型数，最精简
// ---------------------------------------------------------------------------

function getFeatureLabel(t: TFunction, id: string): string {
  return t(`tool.cloudCapBrowse.feature.${id}`, { defaultValue: id })
}

function FeatureRow({
  feature,
  categoryKey,
  t,
}: {
  feature: Feature
  categoryKey: CategoryKey
  t: TFunction
}) {
  const id =
    feature.feature || t('tool.cloudCapBrowse.unknownFeature', { defaultValue: '未知' })
  const name = feature.feature ? getFeatureLabel(t, feature.feature) : id
  const accent = CATEGORY_ACCENT[categoryKey]

  return (
    <div className="flex min-w-0 items-center gap-1.5 py-0.5">
      <span className={cn('size-1.5 shrink-0 rounded-full', accent.dot)} />
      <span className="truncate text-[12px] text-foreground">{name}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category section — 分类分组
// ---------------------------------------------------------------------------

function CategorySection({
  categoryKey,
  features,
  defaultOpen,
  t,
}: {
  categoryKey: CategoryKey
  features: Feature[]
  defaultOpen: boolean
  t: TFunction
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const Icon = CATEGORY_ICONS[categoryKey]
  const accent = CATEGORY_ACCENT[categoryKey]

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/40"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Icon className={cn('size-3.5', accent.text)} />
        <span className="text-[12px] font-medium text-foreground/85">
          {getCategoryLabel(t, categoryKey)}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground/60">
          {features.length}
        </span>
        <ChevronDownIcon
          className={cn(
            'ml-auto size-3.5 text-muted-foreground/50 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open ? (
        <div className="mt-0.5 grid grid-cols-2 gap-x-3 pl-1.5 sm:grid-cols-3">
          {features.map((f, i) => (
            <FeatureRow
              key={`${f.feature ?? 'unknown'}-${i}`}
              feature={f}
              categoryKey={categoryKey}
              t={t}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header — 顶部一行：用户 tier + 积分
// ---------------------------------------------------------------------------

function BrowseHeader({
  userTier,
  userCredits,
  featureCount,
  t,
}: {
  userTier: string | null | undefined
  userCredits: number | null | undefined
  featureCount: number
  t: TFunction
}) {
  const tierKey = userTier ? userTier.toLowerCase() : ''
  const tierClass = TIER_ACCENT[tierKey] ?? TIER_ACCENT.free

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-0.5 pb-2">
      <Sparkles className="size-3 text-amber-500/70" />
      <span className="text-[11px] font-medium text-foreground">
        {t('tool.cloudCapBrowse.title', { defaultValue: '云端能力' })}
      </span>
      <span className="text-[11px] text-muted-foreground/50">·</span>
      <span className="text-[11px] text-muted-foreground">
        {t('tool.cloudCapBrowse.featureCount', {
          defaultValue: '{{count}} 项能力',
          count: featureCount,
        })}
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        {userTier ? (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium uppercase tracking-wide',
              tierClass,
            )}
          >
            {getTierLabel(t, userTier)}
          </span>
        ) : null}
        {typeof userCredits === 'number' ? (
          <span className="text-[11px] tabular-nums text-foreground">
            {t('tool.cloudCapBrowse.creditsInfo', {
              defaultValue: '{{count}} 积分',
              count: userCredits,
            })}
          </span>
        ) : null}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Catalog — 主视图
// ---------------------------------------------------------------------------

function BrowseCatalog({ data, className: cls }: { data: BrowseOutput; className?: string }) {
  const { t } = useTranslation('ai')
  const features = data.features ?? []

  if (features.length === 0) {
    return (
      <div
        className={cn(
          'max-w-md rounded-3xl border border-border bg-secondary px-3 py-2 text-[11px] text-muted-foreground',
          cls,
        )}
      >
        {t('tool.cloudCapBrowse.noFeatures', { defaultValue: '暂无可用能力' })}
      </div>
    )
  }

  // 按 category 分组，保持官方顺序（image/video/audio/text/tools），未知的挂到末尾
  const grouped = new Map<CategoryKey, Feature[]>()
  for (const f of features) {
    const cat = normalizeCategory(f.category)
    const list = grouped.get(cat) ?? []
    list.push(f)
    grouped.set(cat, list)
  }
  const orderedCategories: CategoryKey[] = [
    ...CATEGORY_ORDER.filter((c) => grouped.has(c)),
  ]

  return (
    <div
      className={cn(
        'max-w-md rounded-3xl border border-border bg-secondary p-2.5',
        cls,
      )}
    >
      <BrowseHeader
        userTier={data.userTier}
        userCredits={data.userCredits}
        featureCount={features.length}
        t={t}
      />
      <div className="space-y-1">
        {orderedCategories.map((cat) => (
          <CategorySection
            key={cat}
            categoryKey={cat}
            features={grouped.get(cat) ?? []}
            defaultOpen={true}
            t={t}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default function CloudCapBrowseTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const toolKind = getToolKind(part)

  if (part.state === 'output-available') {
    const output =
      typeof part.output === 'string' ? parseJson(part.output) : part.output
    const data = output && typeof output === 'object' ? (output as BrowseOutput) : null

    if (data?.ok) {
      return <BrowseCatalog data={data} className={className} />
    }
  }

  return (
    <OfficeToolShell
      part={part}
      className={cn('max-w-xl', className)}
      toolKind={toolKind}
      isMutate={false}
      i18nPrefix="tool.cloudCapBrowse"
      defaultOpen
    >
      {(ctx) => {
        const { data, ok } = ctx
        if (ok && data) {
          return <BrowseCatalog data={data as BrowseOutput} />
        }
        return null
      }}
    </OfficeToolShell>
  )
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
