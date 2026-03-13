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

import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldAlert } from 'lucide-react'

import { Button } from '@openloaf/ui/button'

type EmailContentFilterBannerProps = {
  showingRawHtml: boolean
  onToggle: () => void
}

/** Banner prompting user to toggle between safe and raw email content. */
export function EmailContentFilterBanner({
  showingRawHtml,
  onToggle,
}: EmailContentFilterBannerProps) {
  const { t } = useTranslation('common')
  return (
    <div className="flex items-center gap-2 rounded-md bg-ol-amber-bg px-3 py-2 text-xs text-ol-amber">
      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">
        {showingRawHtml
          ? t('email.rawContentBanner')
          : t('email.safeContentBanner')}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-[11px] text-ol-amber hover:bg-ol-amber-bg"
        onClick={onToggle}
      >
        {showingRawHtml ? t('email.showSafeContent') : t('email.loadRawContent')}
      </Button>
    </div>
  )
}

type RawHtmlIframeProps = {
  html: string
}

/** Sandboxed iframe for rendering raw (unsanitized) email HTML. */
export function RawHtmlIframe({ html }: RawHtmlIframeProps) {
  const { t } = useTranslation('common')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentDocument?.body) return
    iframe.style.height = `${iframe.contentDocument.body.scrollHeight + 16}px`
  }, [])

  const wrappedHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; margin: 8px; color: #202124; }
img { max-width: 100%; height: auto; }
</style></head><body>${html}</body></html>`

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      srcDoc={wrappedHtml}
      onLoad={handleLoad}
      className="w-full border-0"
      style={{ minHeight: 200 }}
      title={t('email.rawContentTitle')}
    />
  )
}
