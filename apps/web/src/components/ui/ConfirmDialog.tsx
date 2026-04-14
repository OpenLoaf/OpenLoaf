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

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@openloaf/ui/alert-dialog'
import { cn } from '@/lib/utils'

export type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  /** 主按钮文案。默认读 `common:confirm`。 */
  confirmLabel?: React.ReactNode
  /** 取消按钮文案。默认读 `common:cancel`。 */
  cancelLabel?: React.ReactNode
  /** 主按钮样式：default | destructive。默认 default。 */
  variant?: 'default' | 'destructive'
  /** 主按钮点击处理。可返回 Promise，期间自动显示 loading，成功后自动关闭；抛错则保持打开。 */
  onConfirm: () => void | Promise<void>
  /** 取消点击处理。默认只关闭 dialog。 */
  onCancel?: () => void
  /** 禁用主按钮。 */
  disabled?: boolean
  /** 外部 loading 态（与 onConfirm Promise 任一 true 均显示 loading）。 */
  loading?: boolean
  /** Loading 时的主按钮文案。默认读 `common:submitting`。 */
  loadingLabel?: React.ReactNode
  /** 隐藏取消按钮（纯通知型）。 */
  hideCancel?: boolean
  /** 额外内容（如 checkbox「不再提示」）。 */
  children?: React.ReactNode
  contentClassName?: string
  /** 成功确认后是否自动关闭 dialog。默认 true；
   *  如果调用方自己在 onConfirm / mutation onSuccess 里管关闭时刻，设为 false。 */
  autoClose?: boolean
}

/**
 * 统一的确认型对话框。
 * - 主按钮自动 autoFocus，打开后按 Enter 直接触发
 * - 破坏性变体自动应用 destructive 配色
 * - 支持异步 onConfirm：期间禁用按钮并显示 loading 文案，成功后自动关闭
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  onConfirm,
  onCancel,
  disabled,
  loading: externalLoading,
  loadingLabel,
  hideCancel,
  children,
  contentClassName,
  autoClose = true,
}: ConfirmDialogProps) {
  const { t } = useTranslation('common')
  const [internalLoading, setInternalLoading] = React.useState(false)
  const isLoading = Boolean(externalLoading) || internalLoading
  const isDisabled = Boolean(disabled) || isLoading

  const handleConfirm = React.useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      // 关键：默认阻止 Radix 的自动关闭，我们在成功后手动关闭
      event.preventDefault()
      if (isDisabled) return
      try {
        setInternalLoading(true)
        await onConfirm()
        if (autoClose) {
          onOpenChange(false)
        }
      } catch {
        // 失败时保持打开，交给调用方自行显示错误
      } finally {
        setInternalLoading(false)
      }
    },
    [isDisabled, onConfirm, onOpenChange, autoClose],
  )

  const handleCancel = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isLoading) {
        event.preventDefault()
        return
      }
      onCancel?.()
    },
    [isLoading, onCancel],
  )

  const handleOpenChange = (next: boolean) => {
    if (!next && isLoading) return
    onOpenChange(next)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className={contentClassName}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription asChild>
              <div>{description}</div>
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        {children ? <div className="py-1">{children}</div> : null}

        <AlertDialogFooter>
          {!hideCancel && (
            <AlertDialogCancel
              onClick={handleCancel}
              disabled={isLoading}
              className="rounded-3xl shadow-none transition-colors duration-150"
            >
              {cancelLabel ?? t('cancel')}
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            autoFocus
            onClick={handleConfirm}
            disabled={isDisabled}
            className={cn(
              'rounded-3xl shadow-none transition-colors duration-150',
              variant === 'destructive' &&
                'bg-destructive text-white hover:bg-destructive/90',
            )}
          >
            {isLoading ? (loadingLabel ?? t('submitting')) : (confirmLabel ?? t('confirm'))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
