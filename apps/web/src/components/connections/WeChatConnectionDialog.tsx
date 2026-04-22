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
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@openloaf/ui/dialog'
import { Button } from '@openloaf/ui/button'
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { queryClient, trpc } from '@/utils/trpc'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Rendering modes are DERIVED from data — we never store a "current view" flag.
 * That avoids the flash-of-empty-list bug where the view state lagged behind
 * the async accounts query and the auto-triggered bind session.
 *
 *   - 'loading'  : first load, or account refetch in flight — blank spinner
 *   - 'scanning' : an active bind session (or one being fetched) exists
 *   - 'list'     : there is at least one bound account
 *
 * Invariant: while the dialog is open and has no accounts, we are ALWAYS
 * either 'loading' or 'scanning' — the empty-list view never shows.
 */
export function WeChatConnectionDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation(['connections', 'common'])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [qrcodeDataUrl, setQrcodeDataUrl] = useState<string | null>(null)
  /** User explicitly clicked "add" from a non-empty list — forces scanning UI. */
  const [userIntentAdd, setUserIntentAdd] = useState(false)

  // --- Accounts list ---
  const accountsQuery = useQuery({
    ...trpc.wechat.listAccounts.queryOptions(),
    enabled: open,
  })
  const accounts = accountsQuery.data ?? []
  const hasAccounts = accounts.length > 0
  const accountsReady = !accountsQuery.isLoading && accountsQuery.isFetched

  const invalidateAccounts = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.wechat.listAccounts.queryOptions().queryKey,
    })

  // --- Bind session mutations ---
  const startBindMutation = useMutation(
    trpc.wechat.startBind.mutationOptions({
      onSuccess: (data) => {
        setSessionId(data.sessionId)
        setQrcodeDataUrl(data.qrcodeDataUrl)
      },
      onError: (err) => {
        toast.error(err.message)
        setUserIntentAdd(false)
      },
    }),
  )

  const cancelBindMutation = useMutation(
    trpc.wechat.cancelBind.mutationOptions({}),
  )

  const unbindMutation = useMutation(
    trpc.wechat.unbindAccount.mutationOptions({
      onSuccess: () => {
        toast.success(t('connections:wechat.unbindSuccess'))
        invalidateAccounts()
      },
      onError: (err) => toast.error(err.message),
    }),
  )

  // --- Derived mode ---
  const scanning = !!sessionId || startBindMutation.isPending || userIntentAdd
  const mode: 'loading' | 'scanning' | 'list' = scanning
    ? 'scanning'
    : accountsReady && hasAccounts
      ? 'list'
      : 'loading'

  // --- Poll bind status every 1.5s while scanning ---
  const bindStatusQuery = useQuery({
    ...trpc.wechat.pollBindStatus.queryOptions({ sessionId: sessionId ?? '' }),
    enabled: open && !!sessionId,
    refetchInterval: sessionId ? 1500 : false,
    refetchIntervalInBackground: false,
  })

  // --- React to status transitions ---
  useEffect(() => {
    if (!sessionId) return
    const status = bindStatusQuery.data?.status
    if (!status) return

    if (status === 'confirmed') {
      toast.success(
        t('connections:wechat.bindSuccess', {
          name: bindStatusQuery.data?.account?.displayName ?? '',
        }),
      )
      setSessionId(null)
      setQrcodeDataUrl(null)
      setUserIntentAdd(false)
      invalidateAccounts()
    } else if (status === 'expired') {
      toast.error(t('connections:wechat.qrExpired'))
    }
  }, [bindStatusQuery.data?.status, sessionId, t])

  // --- Open/close lifecycle ---
  // Reset state on OPEN (not close) so the rendered view doesn't flicker
  // during Radix's close animation.
  const prevOpenRef = useRef(false)
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current
    const justClosed = !open && prevOpenRef.current
    prevOpenRef.current = open

    if (justOpened) {
      setSessionId(null)
      setQrcodeDataUrl(null)
      setUserIntentAdd(false)
    } else if (justClosed && sessionId) {
      cancelBindMutation.mutate({ sessionId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // --- Auto-start scanning when the dialog opens with zero accounts ---
  useEffect(() => {
    if (!open) return
    if (!accountsReady) return
    if (hasAccounts) return
    if (sessionId || startBindMutation.isPending) return
    startBindMutation.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accountsReady, hasAccounts])

  const handleAddAccount = () => {
    setUserIntentAdd(true)
    startBindMutation.mutate()
  }

  const handleCancelScan = () => {
    if (sessionId) cancelBindMutation.mutate({ sessionId })
    setSessionId(null)
    setQrcodeDataUrl(null)
    setUserIntentAdd(false)
    // If nothing is bound, returning to list would show an empty state —
    // close the dialog entirely for a cleaner exit.
    if (!hasAccounts) onOpenChange(false)
  }

  const handleRefreshQr = () => {
    if (sessionId) cancelBindMutation.mutate({ sessionId })
    setSessionId(null)
    setQrcodeDataUrl(null)
    startBindMutation.mutate()
  }

  const status = bindStatusQuery.data?.status ?? 'wait'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: '#07C160' }}
              aria-hidden
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.81-.05-.857-2.578.324-4.973 2.534-6.332 1.545-.95 3.536-1.303 5.51-.966-.64-3.194-3.888-5.334-7.844-5.334zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177-.005-.02-.123-.465-.324-1.234a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
              </svg>
            </span>
            {t('connections:wechat.dialogTitle')}
          </DialogTitle>
          <DialogDescription>{t('connections:wechat.dialogDescription')}</DialogDescription>
        </DialogHeader>

        {mode === 'loading' ? (
          <div className="flex h-[360px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : mode === 'list' ? (
          <div className="space-y-4">
            <ul className="space-y-1.5">
              {accounts.map((acc) => (
                <li
                  key={acc.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        acc.status === 'connected'
                          ? 'bg-emerald-500'
                          : acc.status === 'expired'
                            ? 'bg-amber-500'
                            : 'bg-muted-foreground/40',
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {acc.displayName}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {t(`connections:wechat.status.${acc.status}`)}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-full px-2 text-xs text-muted-foreground hover:text-destructive"
                    disabled={
                      unbindMutation.isPending &&
                      unbindMutation.variables?.accountId === acc.id
                    }
                    onClick={() => unbindMutation.mutate({ accountId: acc.id })}
                  >
                    {unbindMutation.isPending &&
                    unbindMutation.variables?.accountId === acc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>

            <Button
              type="button"
              className="w-full rounded-full"
              disabled={startBindMutation.isPending}
              onClick={handleAddAccount}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t('connections:wechat.addAccount')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="flex h-[280px] w-[280px] items-center justify-center rounded-2xl border border-border/60 bg-background">
              {qrcodeDataUrl ? (
                <img
                  src={qrcodeDataUrl}
                  alt="WeChat QR code"
                  className={cn(
                    'h-[256px] w-[256px] object-contain transition-opacity',
                    status === 'expired' && 'opacity-30',
                  )}
                />
              ) : (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-foreground">
                {t(`connections:wechat.scanStatus.${status}`)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {status === 'wait' && t('connections:wechat.scanHint')}
                {status === 'scaned' && t('connections:wechat.confirmHint')}
                {status === 'expired' && t('connections:wechat.qrExpiredHint')}
              </div>
            </div>
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-full"
                onClick={handleCancelScan}
              >
                {t('common:cancel')}
              </Button>
              {status === 'expired' ? (
                <Button
                  type="button"
                  className="flex-1 rounded-full"
                  disabled={startBindMutation.isPending}
                  onClick={handleRefreshQr}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  {t('connections:wechat.refreshQr')}
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
