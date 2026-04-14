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

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Construction } from "lucide-react"
import { Checkbox } from "@openloaf/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useBasicConfig } from "@/hooks/use-basic-config"
import { useAppView } from "@/hooks/use-app-view"

export default function DevNoticeDialog() {
  const { t } = useTranslation('project', { keyPrefix: 'global' })
  const { basic, setBasic, isLoading } = useBasicConfig()
  const appInitialized = useAppView((s) => s.initialized)

  const [open, setOpen] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(true)
  const shownRef = useRef(false)

  useEffect(() => {
    if (isLoading || !appInitialized || shownRef.current) return
    shownRef.current = true
    if (basic.showDevNoticeDialog) {
      setOpen(true)
    }
  }, [isLoading, appInitialized, basic.showDevNoticeDialog])

  const handleClose = () => {
    if (dontShowAgain) {
      void setBasic({ showDevNoticeDialog: false })
    }
    setOpen(false)
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          handleClose()
        } else {
          setOpen(v)
        }
      }}
      title={
        <span className="flex items-center gap-2">
          <Construction className="size-5 text-foreground" />
          {t('devNoticeDialog.title')}
        </span>
      }
      description={
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>{t('devNoticeDialog.content1')}</p>
          <p>{t('devNoticeDialog.content2')}</p>
          <p className="text-foreground font-medium">{t('devNoticeDialog.content3')}</p>
        </div>
      }
      confirmLabel={t('devNoticeDialog.okButton')}
      hideCancel
      onConfirm={() => {}}
    >
      <div className="flex items-center gap-2 pt-1">
        <Checkbox
          id="dev-notice-dont-show"
          checked={dontShowAgain}
          onCheckedChange={(v) => setDontShowAgain(v === true)}
        />
        <label
          htmlFor="dev-notice-dont-show"
          className="text-xs text-muted-foreground cursor-pointer select-none"
        >
          {t('devNoticeDialog.dontShowAgain')}
        </label>
      </div>
    </ConfirmDialog>
  )
}
