/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import * as React from 'react'
import { Loader2, LogIn } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'

interface CapabilitiesFallbackProps {
  loading: boolean
  error: string | null
  onRetry: () => void
}

/** Shared loading / error / empty fallback for AI panels. */
export function CapabilitiesFallback({ loading, error, onRetry }: CapabilitiesFallbackProps) {
  const { t } = useTranslation('board')
  const loggedIn = useSaasAuth((s) => s.loggedIn)
  const authLoading = useSaasAuth((s) => s.loading)
  const [loginOpen, setLoginOpen] = React.useState(false)

  if (loading || authLoading) {
    return (
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 py-6">
        <Loader2 size={20} className="animate-spin text-muted-foreground/60" />
        <span className="text-xs text-muted-foreground">{t('v3.common.loading')}</span>
      </div>
    )
  }

  if (!loggedIn) {
    return (
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 py-6">
        <span className="text-sm font-medium text-muted-foreground">
          {t('v3.common.loginRequired')}
        </span>
        <span className="text-[11px] text-muted-foreground/60">
          {t('v3.common.loginRequiredHint')}
        </span>
        <button
          type="button"
          onClick={() => setLoginOpen(true)}
          className="mt-1 inline-flex items-center gap-1 rounded-full bg-foreground px-3.5 py-1 text-xs text-background hover:bg-foreground/90 transition-colors duration-150"
        >
          <LogIn size={12} />
          {t('v3.common.signIn')}
        </button>
        <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </div>
    )
  }

  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 py-6">
      <span className="text-sm font-medium text-muted-foreground">
        {t('v3.common.loadError')}
      </span>
      <span className="text-[11px] text-muted-foreground/60">
        {error || t('v3.common.loadErrorHint')}
      </span>
      <button
        type="button"
        className="mt-1 rounded-full border border-border px-3.5 py-1 text-xs text-muted-foreground hover:bg-foreground/5 transition-colors duration-150"
        onClick={onRetry}
      >
        {t('v3.common.retry')}
      </button>
    </div>
  )
}
