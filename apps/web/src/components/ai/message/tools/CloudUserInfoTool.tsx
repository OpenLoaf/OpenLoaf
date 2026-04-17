/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * CloudUserInfoTool — renders the result of the CloudUserInfo server tool.
 *
 * 视觉与 CloudLoginTool 保持一致：rounded-3xl 胶囊容器 +
 * 头像 + tier 徽标 + 积分 tabular-nums。
 */
'use client'

import { Cloud, Sparkles, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { cn } from '@/lib/utils'
import OfficeToolShell from './shared/OfficeToolShell'
import { getToolKind } from './shared/office-tool-utils'
import type { AnyToolPart } from './shared/tool-utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UserInfo = {
  id?: string
  email?: string | null
  name?: string | null
  avatarUrl?: string | null
  provider?: string
  membershipLevel?: string
  creditsBalance?: number
  isAdmin?: boolean
  isInternal?: boolean
}

type UserInfoOutput = {
  ok?: boolean
  code?: string
  hint?: string
  user?: UserInfo | null
}

// ---------------------------------------------------------------------------
// Tier badge — 与 sidebar 保持同一套配色
// ---------------------------------------------------------------------------

const TIER_ACCENT: Record<string, string> = {
  free: 'bg-foreground/[0.06] text-foreground/65 dark:bg-foreground/[0.08]',
  lite: 'bg-sky-500/10 text-sky-600 dark:bg-sky-400/15 dark:text-sky-400',
  pro: 'bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400',
  premium: 'bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-400',
  infinity: 'bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-400',
}

function getTierLabel(_t: TFunction, tier: string): string {
  // Tier names (free / lite / pro / premium / infinity) are i18n-agnostic brand
  // labels — just capitalize.
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

// ---------------------------------------------------------------------------
// Avatar — 头像或首字母兜底
// ---------------------------------------------------------------------------

function AvatarImg({ src, name }: { src?: string | null; name?: string | null }) {
  const displayName = name || '?'
  if (src) {
    return (
      <img
        src={src}
        alt={displayName}
        className="size-8 shrink-0 rounded-full object-cover ring-1 ring-border/60"
        referrerPolicy="no-referrer"
      />
    )
  }
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-[11px] font-medium text-muted-foreground ring-1 ring-border/60">
      {initials || <User className="size-3.5 text-muted-foreground/60" />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function ProfileCard({ user, className: cls }: { user: UserInfo; className?: string }) {
  const { t } = useTranslation('ai')
  const display =
    user.name ||
    user.email ||
    user.id ||
    t('tool.cloudUserInfo.unknownUser', { defaultValue: '未知用户' })

  const tierKey = user.membershipLevel ? user.membershipLevel.toLowerCase() : ''
  const tierClass = TIER_ACCENT[tierKey] ?? TIER_ACCENT.free

  return (
    <div
      className={cn(
        'flex max-w-sm items-center gap-2.5 rounded-3xl border border-border bg-secondary px-3 py-2',
        cls,
      )}
    >
      <AvatarImg src={user.avatarUrl} name={user.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-medium leading-tight text-foreground">
            {display}
          </p>
          {user.membershipLevel ? (
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[9px] font-medium uppercase tracking-wide',
                tierClass,
              )}
            >
              {getTierLabel(t, user.membershipLevel)}
            </span>
          ) : null}
        </div>
        {typeof user.creditsBalance === 'number' ? (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] leading-tight text-muted-foreground">
            <Sparkles className="size-2.5 text-amber-500/70" />
            <span className="tabular-nums text-foreground/80">
              {t('tool.cloudUserInfo.creditsSuffix', {
                defaultValue: '{{count}} 积分',
                count: user.creditsBalance,
              })}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  )
}

function NotSignedInCard({ className: cls }: { className?: string }) {
  const { t } = useTranslation('ai')
  return (
    <div
      className={cn(
        'flex max-w-sm items-center gap-2 rounded-3xl border border-border bg-secondary px-3 py-2',
        cls,
      )}
    >
      <Cloud className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-[12px] text-foreground">
        {t('tool.cloudUserInfo.notSignedIn', { defaultValue: '未登录' })}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default function CloudUserInfoTool({
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
    const data = output && typeof output === 'object' ? (output as UserInfoOutput) : null

    if (data?.ok && data.user) {
      return <ProfileCard user={data.user} className={className} />
    }
    if (data && !data.ok) {
      return <NotSignedInCard className={className} />
    }
  }

  return (
    <OfficeToolShell
      part={part}
      className={cn('max-w-xl', className)}
      toolKind={toolKind}
      isMutate={false}
      i18nPrefix="tool.cloudUserInfo"
      defaultOpen
    >
      {(ctx) => {
        const { data, ok } = ctx
        if (ok && data) {
          const d = data as UserInfoOutput
          if (d.user) return <ProfileCard user={d.user} />
          return <NotSignedInCard />
        }
        return <NotSignedInCard />
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
