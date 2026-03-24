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

import { useEffect, useRef, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { createPricingEmbed } from "@openloaf-saas/sdk"
import type { EmbedInstance } from "@openloaf-saas/sdk"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@openloaf/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { Button } from "@openloaf/ui/button"
import { resolveSaasBaseUrl, getAccessToken } from "@/lib/saas-auth"
import { queryClient } from "@/utils/trpc"

type PricingDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const EMBED_TIMEOUT_MS = 15_000
const TOKEN_REFRESH_INTERVAL_MS = 4 * 60 * 1000

export function PricingDialog({ open, onOpenChange }: PricingDialogProps) {
  const { t } = useTranslation("settings")
  const containerRef = useRef<HTMLDivElement>(null)
  const embedRef = useRef<EmbedInstance | null>(null)
  const [loading, setLoading] = useState(true)
  const [timedOut, setTimedOut] = useState(false)

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  // Use a callback ref to detect when the container mounts in the portal
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const containerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node
    setContainerEl(node)
  }, [])

  useEffect(() => {
    if (!open || !containerEl) return

    const baseUrl = resolveSaasBaseUrl()
    if (!baseUrl) {
      toast.error(t("account.saasUrlMissing"))
      handleClose()
      return
    }

    let destroyed = false
    const timers: ReturnType<typeof setTimeout>[] = []
    setLoading(true)
    setTimedOut(false)

    timers.push(setTimeout(() => {
      if (!destroyed) setTimedOut(true)
    }, EMBED_TIMEOUT_MS))

    void getAccessToken().then((token) => {
      if (destroyed) return
      if (!token || !containerRef.current) {
        setTimedOut(true)
        return
      }

      const embed = createPricingEmbed({
        container: containerRef.current,
        baseUrl,
        token,
        onReady: () => {
          if (!destroyed) {
            for (const id of timers) clearTimeout(id)
            setLoading(false)
          }
        },
        onSuccess: () => {
          toast.success(t("account.paymentSuccess"))
          void queryClient.invalidateQueries({ queryKey: ["saas"] })
          handleClose()
        },
        onCancel: () => {
          toast.info(t("account.paymentCancelled"))
          handleClose()
        },
        onClose: () => handleClose(),
        style: { width: "100%", height: "100%", border: "none" },
      })
      embedRef.current = embed

      // Workaround: SDK sends auth postMessage on iframe 'load', but the
      // embed page's React hydration may finish after 'load' fires, so the
      // message listener isn't registered yet. Re-send the token a few
      // times to cover the hydration gap.
      const retrySend = () => {
        if (destroyed || !embed.iframe?.contentWindow) return
        embed.iframe.contentWindow.postMessage(
          { type: "auth", token },
          baseUrl,
        )
      }
      timers.push(setTimeout(retrySend, 500))
      timers.push(setTimeout(retrySend, 1500))
      timers.push(setTimeout(retrySend, 3000))
    })

    // Token refresh interval
    const refreshInterval = setInterval(() => {
      void getAccessToken().then((newToken) => {
        if (newToken && embedRef.current) {
          embedRef.current.updateToken(newToken)
        }
      })
    }, TOKEN_REFRESH_INTERVAL_MS)

    return () => {
      destroyed = true
      for (const id of timers) clearTimeout(id)
      clearInterval(refreshInterval)
      embedRef.current?.destroy()
      embedRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, containerEl, handleClose])

  const handleRetry = () => {
    setTimedOut(false)
    setLoading(true)
    embedRef.current?.destroy()
    embedRef.current = null
    // Force re-mount by toggling open
    onOpenChange(false)
    setTimeout(() => onOpenChange(true), 100)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[660px] w-[90vw] max-w-5xl sm:max-w-5xl p-0 overflow-hidden rounded-3xl shadow-none border-border/60">
        <VisuallyHidden><DialogTitle>{t("account.upgrade")}</DialogTitle></VisuallyHidden>
        <div className="relative h-full w-full">
          <div ref={containerCallbackRef} className="h-full w-full overflow-auto" />
          {loading && !timedOut && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {timedOut && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
              <p className="text-sm text-muted-foreground">{t("account.embedTimeout")}</p>
              <Button
                variant="outline"
                size="sm"
                className="rounded-3xl"
                onClick={handleRetry}
              >
                {t("account.loadError")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
