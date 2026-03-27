/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { cn } from "@udecode/cn"
import { isVideoPlatformUrl } from "../utils/video-url"

type VideoUrlDownloadDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (url: string) => void
}

export function VideoUrlDownloadDialog({
  open,
  onOpenChange,
  onConfirm,
}: VideoUrlDownloadDialogProps) {
  const { t } = useTranslation('board')
  const [url, setUrl] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const isValidUrl = useMemo(() => {
    const trimmed = url.trim()
    if (!trimmed) return false
    try {
      new URL(trimmed)
    } catch {
      return false
    }
    return isVideoPlatformUrl(trimmed)
  }, [url])

  const hasInput = url.trim().length > 0

  const handleClose = useCallback(() => {
    setUrl("")
    onOpenChange(false)
  }, [onOpenChange])

  const handleConfirm = useCallback(() => {
    if (!isValidUrl) return
    onConfirm(url.trim())
    handleClose()
  }, [url, isValidUrl, onConfirm, handleClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
        e.preventDefault()
        handleConfirm()
      }
      if (e.key === "Escape") {
        handleClose()
      }
    },
    [handleConfirm, handleClose],
  )

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className={cn(
          "relative z-10 w-[480px] rounded-2xl p-6",
          "bg-background border border-border shadow-xl",
          "animate-in fade-in-0 zoom-in-95 duration-150",
        )}
      >
        <h3 className="mb-4 text-base font-semibold text-foreground">
          {t('videoUrlDownload.title')}
        </h3>

        <input
          ref={inputRef}
          autoFocus
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('videoUrlDownload.placeholder')}
          className={cn(
            "w-full rounded-xl border px-3.5 py-2.5 text-sm",
            "bg-muted/40 text-foreground placeholder:text-muted-foreground/60",
            "outline-none transition-colors duration-150",
            "focus:border-primary/50 focus:ring-1 focus:ring-primary/20",
            hasInput && !isValidUrl ? "border-amber-500/60" : "border-border",
          )}
        />

        {hasInput && !isValidUrl && (
          <p className="mt-2 text-xs text-amber-500">
            {t('videoUrlDownload.errorUnsupported')}
          </p>
        )}

        <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed">
          {t('videoUrlDownload.supportedPlatforms')}
        </p>

        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={handleClose}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium",
              "text-foreground/70 hover:bg-muted/60",
              "transition-colors duration-150",
            )}
          >
            {t('board.cancel')}
          </button>
          <button
            type="button"
            disabled={!isValidUrl}
            onClick={handleConfirm}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium",
              "transition-colors duration-150",
              isValidUrl
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {t('videoUrlDownload.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
