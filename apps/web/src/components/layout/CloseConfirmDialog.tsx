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

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@openloaf/ui/alert-dialog'
import { Button } from '@openloaf/ui/button'
import { Checkbox } from '@openloaf/ui/checkbox'
import { Label } from '@openloaf/ui/label'

/**
 * Electron 关闭确认对话框（Web 端渲染）。
 *
 * 三按钮直接选择模式：
 * - 取消：关闭弹窗，不做任何操作
 * - 最小化到托盘：隐藏窗口到系统托盘
 * - 退出：完全退出应用
 * - 勾选"记住选择"后，下次关闭时直接执行对应操作
 */
export default function CloseConfirmDialog() {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const [remember, setRemember] = useState(false)

  useEffect(() => {
    const handler = () => {
      setRemember(false)
      setOpen(true)
    }
    window.addEventListener('openloaf:confirm-close', handler)
    return () => window.removeEventListener('openloaf:confirm-close', handler)
  }, [])

  const respond = useCallback(
    (action: 'cancel' | 'minimize' | 'quit') => {
      setOpen(false)
      window.openloafElectron?.respondCloseConfirm?.({
        action,
        minimizeToTray: action === 'minimize' && remember,
      })
    },
    [remember],
  )

  const handleCancel = useCallback(() => respond('cancel'), [respond])
  const handleMinimize = useCallback(() => respond('minimize'), [respond])
  const handleQuit = useCallback(() => respond('quit'), [respond])

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleCancel() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('closeConfirm.title')}</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="flex items-center gap-2 py-2">
          <Checkbox
            id="dont-ask-again"
            checked={remember}
            onCheckedChange={(v) => setRemember(v === true)}
          />
          <Label htmlFor="dont-ask-again" className="text-sm cursor-pointer text-muted-foreground">
            {t('closeConfirm.checkboxLabel')}
          </Label>
        </div>
        <AlertDialogFooter>
          <Button
            variant="ghost"
            onClick={handleCancel}
            className="rounded-full shadow-none transition-colors duration-150"
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={handleMinimize}
            className="rounded-full bg-ol-blue-bg text-ol-blue hover:bg-ol-blue-bg-hover shadow-none transition-colors duration-150"
          >
            {t('closeConfirm.minimize')}
          </Button>
          <Button
            onClick={handleQuit}
            className="rounded-full bg-ol-red-bg text-ol-red hover:bg-ol-red-bg-hover shadow-none transition-colors duration-150"
          >
            {t('closeConfirm.quit')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
