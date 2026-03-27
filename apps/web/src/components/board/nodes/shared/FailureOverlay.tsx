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

import { RefreshCw, X } from 'lucide-react'
import i18next from 'i18next'

export type FailureOverlayProps = {
  /** Whether the failure overlay is visible. */
  visible: boolean
  /** Whether the failure was a user-initiated cancellation. */
  isCancelled: boolean
  /** The error message to display (ignored when isCancelled is true). */
  message?: string
  /** i18n key for the cancelled label. Falls back to 'Cancelled'. */
  cancelledKey: string
  /** i18n key for the retry button label. Falls back to 'Retry'. */
  retryKey: string
  /** i18n key for the resend button label (shown when isCancelled). Falls back to 'Resend'. */
  resendKey: string
  /** Called when the retry / resend button is clicked. */
  onRetry: () => void
  /** When true, a dismiss button is shown below the retry button. */
  canDismiss?: boolean
  /** Called when the dismiss button is clicked. Required when canDismiss is true. */
  onDismiss?: () => void
}

/**
 * Shared failure / cancellation overlay for media nodes (image, video, audio).
 *
 * Renders an absolute-positioned overlay with:
 * - An X icon in a circular badge
 * - An error or cancellation message
 * - A retry / resend button
 * - An optional dismiss link (shown when the node already has content)
 */
export function FailureOverlay({
  visible,
  isCancelled,
  message,
  cancelledKey,
  retryKey,
  resendKey,
  onRetry,
  canDismiss,
  onDismiss,
}: FailureOverlayProps) {
  if (!visible) return null

  const errorLabel = isCancelled
    ? i18next.t(cancelledKey, { defaultValue: 'Cancelled' })
    : (message || i18next.t('board:generateFailed', { defaultValue: 'Generation failed' }))

  const retryLabel = isCancelled
    ? i18next.t(resendKey, { defaultValue: 'Resend' })
    : i18next.t(retryKey, { defaultValue: 'Retry' })

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/75 backdrop-blur-sm p-4 rounded-3xl">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06]">
        <X className="h-4 w-4 text-ol-text-auxiliary" />
      </div>
      <span className="text-xs text-center text-ol-text-auxiliary font-medium">
        {errorLabel}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRetry()
          }}
          className="flex items-center gap-1 rounded-full px-3 py-1 text-[11px] bg-white/[0.08] text-ol-text-secondary hover:bg-white/[0.12] transition-colors duration-150"
        >
          <RefreshCw className="h-3 w-3" />
          {retryLabel}
        </button>
        {canDismiss && onDismiss && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDismiss()
            }}
            className="text-[11px] text-ol-text-auxiliary underline underline-offset-2 hover:text-ol-text-secondary transition-colors duration-150"
          >
            {i18next.t('board:loading.dismiss', { defaultValue: 'Dismiss' })}
          </button>
        )}
      </div>
    </div>
  )
}
