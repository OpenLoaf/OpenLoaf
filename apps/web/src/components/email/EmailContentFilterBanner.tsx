'use client'

import { useCallback, useRef } from 'react'
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
  return (
    <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">
        {showingRawHtml
          ? '正在显示原始内容，可能包含外部资源'
          : '部分内容已被过滤以保护安全'}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-[11px] text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
        onClick={onToggle}
      >
        {showingRawHtml ? '显示安全内容' : '加载原始内容'}
      </Button>
    </div>
  )
}

type RawHtmlIframeProps = {
  html: string
}

/** Sandboxed iframe for rendering raw (unsanitized) email HTML. */
export function RawHtmlIframe({ html }: RawHtmlIframeProps) {
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
      title="邮件原始内容"
    />
  )
}
