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
} from "@openloaf/ui/dialog"
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

  useEffect(() => {
    if (!open || !containerRef.current) return

    const baseUrl = resolveSaasBaseUrl()
    if (!baseUrl) {
      toast.error(t("account.saasUrlMissing"))
      handleClose()
      return
    }

    let destroyed = false
    setLoading(true)
    setTimedOut(false)

    const timeoutId = setTimeout(() => {
      if (!destroyed) setTimedOut(true)
    }, EMBED_TIMEOUT_MS)

    void getAccessToken().then((token) => {
      if (destroyed || !token || !containerRef.current) return

      const embed = createPricingEmbed({
        container: containerRef.current,
        baseUrl,
        token,
        onReady: () => {
          clearTimeout(timeoutId)
          if (!destroyed) setLoading(false)
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
      clearTimeout(timeoutId)
      clearInterval(refreshInterval)
      embedRef.current?.destroy()
      embedRef.current = null
    }
  }, [open, t, handleClose])

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
      <DialogContent className="h-[80vh] max-w-2xl p-0 overflow-hidden rounded-3xl shadow-none border-border/60">
        <div className="relative h-full w-full">
          <div ref={containerRef} className="h-full w-full" />
          {loading && !timedOut && (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
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
