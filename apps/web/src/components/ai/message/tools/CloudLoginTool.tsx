/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * CloudLoginTool — renders the result of the CloudLogin server tool.
 *
 * Server returns one of:
 *   - { ok: true, alreadyLoggedIn: true, user: {...} } — show signed-in card
 *   - { ok: true, action: 'open-login-dialog' }       — show "Sign in" card +
 *     auto-open the SaasLoginDialog once.
 */
'use client'

import * as React from 'react'
import { Cloud, LogIn, UserCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'
import OfficeToolShell from './shared/OfficeToolShell'
import { getToolKind } from './shared/office-tool-utils'
import type { AnyToolPart } from './shared/tool-utils'

type LoginToolData = {
  ok?: boolean
  alreadyLoggedIn?: boolean
  action?: string
  user?: {
    id?: string
    email?: string | null
    name?: string | null
    provider?: string
    membershipLevel?: string
    creditsBalance?: number
  } | null
}

function AlreadySignedInCard({ data }: { data: LoginToolData }) {
  const { t } = useTranslation('ai')
  const u = data.user ?? {}
  const display = u.name || u.email || u.id || t('tool.cloudLogin.signedInFallback')
  return (
    <div className="flex max-w-sm items-center gap-2 rounded-3xl border border-border bg-secondary px-3 py-2">
      <UserCheck className="size-4 shrink-0 text-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{display}</p>
        {u.membershipLevel || typeof u.creditsBalance === 'number' ? (
          <p className="truncate text-[10px] text-muted-foreground">
            {u.membershipLevel ? `${u.membershipLevel} · ` : ''}
            {typeof u.creditsBalance === 'number'
              ? t('tool.cloudLogin.creditsSuffix', { count: u.creditsBalance })
              : ''}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function PromptSignInCard() {
  const { t } = useTranslation('ai')
  const loggedIn = useSaasAuth((s) => s.loggedIn)
  const [open, setOpen] = React.useState(false)
  const autoOpenedRef = React.useRef(false)

  // 自动弹出一次登录框 — 只在还没登录时触发，避免重复打扰。
  React.useEffect(() => {
    if (autoOpenedRef.current) return
    if (loggedIn) return
    autoOpenedRef.current = true
    setOpen(true)
  }, [loggedIn])

  if (loggedIn) {
    return (
      <div className="flex max-w-sm items-center gap-2 rounded-3xl border border-border bg-secondary px-3 py-2">
        <UserCheck className="size-4 shrink-0 text-foreground" />
        <span className="text-xs text-foreground">{t('tool.cloudLogin.alreadySignedIn')}</span>
      </div>
    )
  }

  return (
    <>
      <div className="flex max-w-sm items-center gap-2 rounded-3xl border border-border bg-secondary px-3 py-2">
        <Cloud className="size-4 shrink-0 text-foreground" />
        <span className="flex-1 text-xs text-foreground">{t('tool.cloudLogin.needSignIn')}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-7 items-center justify-center gap-1 rounded-full bg-foreground px-3 text-[11px] font-medium text-background transition-colors duration-150 hover:bg-foreground/90"
        >
          <LogIn className="size-3" />
          {t('tool.cloudLogin.signInButton')}
        </button>
      </div>
      <SaasLoginDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export default function CloudLoginTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const toolKind = getToolKind(part)

  return (
    <OfficeToolShell
      part={part}
      className={cn('max-w-xl', className)}
      toolKind={toolKind}
      isMutate={false}
      i18nPrefix="tool.cloudLogin"
      defaultOpen
    >
      {(ctx) => {
        const { data, isDone, ok } = ctx
        if (!isDone || !ok || !data) {
          return <PromptSignInCard />
        }
        const d = data as LoginToolData
        if (d.alreadyLoggedIn) {
          return <AlreadySignedInCard data={d} />
        }
        return <PromptSignInCard />
      }}
    </OfficeToolShell>
  )
}
