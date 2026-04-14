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

import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { openExternalUrl, resolveSaasBaseUrl } from "@/lib/saas-auth"

type PricingDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Open the SaaS pricing page in the system browser.
 *
 * Rationale: under the "Server is sole token holder" architecture, the
 * embedded SaaS iframe flow required a raw access token for postMessage,
 * which violated the invariant. Instead we open the SaaS hosted pricing
 * page in the user's default browser — the browser already holds a SaaS
 * session cookie from the OAuth login flow, so the page shows up authed.
 * If the cookie is missing or expired, the user sees SaaS's own login,
 * same as any other desktop app that delegates payment to the web.
 *
 * This component keeps the `{open, onOpenChange}` shape to avoid touching
 * every caller: when `open` flips to true, we dispatch `openExternalUrl`
 * then immediately reset `open` to false so the caller's state machine
 * behaves like a one-shot "trigger".
 */
export function PricingDialog({ open, onOpenChange }: PricingDialogProps) {
  const { t } = useTranslation("settings")

  useEffect(() => {
    if (!open) return
    const baseUrl = resolveSaasBaseUrl()
    if (!baseUrl) {
      toast.error(t("account.saasUrlMissing"))
      onOpenChange(false)
      return
    }
    void openExternalUrl(`${baseUrl}/pricing`).catch((error) => {
      toast.error((error as Error)?.message ?? "无法打开浏览器")
    })
    onOpenChange(false)
  }, [open, onOpenChange, t])

  return null
}
