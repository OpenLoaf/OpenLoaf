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

type RechargeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Open the SaaS recharge page in the system browser.
 * See PricingDialog for rationale — same pattern: this component is a
 * one-shot trigger that delegates payment UI to SaaS's hosted page,
 * relying on the browser's existing SaaS session cookie from OAuth login.
 */
export function RechargeDialog({ open, onOpenChange }: RechargeDialogProps) {
  const { t } = useTranslation("settings")

  useEffect(() => {
    if (!open) return
    const baseUrl = resolveSaasBaseUrl()
    if (!baseUrl) {
      toast.error(t("account.saasUrlMissing"))
      onOpenChange(false)
      return
    }
    void openExternalUrl(`${baseUrl}/recharge`).catch((error) => {
      toast.error((error as Error)?.message ?? "无法打开浏览器")
    })
    onOpenChange(false)
  }, [open, onOpenChange, t])

  return null
}
