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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@openloaf/ui/dialog'
import { Button } from '@openloaf/ui/button'
import { cn } from '@/lib/utils'

export type FormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  /** 提交按钮文案。默认读 `common:save`。 */
  submitLabel?: React.ReactNode
  /** 取消按钮文案。默认读 `common:cancel`。 */
  cancelLabel?: React.ReactNode
  /** 提交按钮样式变体。 */
  submitVariant?: 'default' | 'destructive'
  /** 提交处理，可异步；期间禁用表单并显示 loading 文案，成功后自动关闭；抛错则保持打开。 */
  onSubmit: () => void | Promise<void>
  /** 禁用提交按钮（表单校验失败时置 true）。 */
  submitDisabled?: boolean
  /** 外部 submitting 态（与 onSubmit Promise 任一 true 均显示 loading）。 */
  submitting?: boolean
  /** Loading 时的主按钮文案。默认读 `common:submitting`。 */
  submittingLabel?: React.ReactNode
  /** 表单内容。 */
  children: React.ReactNode
  /** DialogContent 额外 class（如自定义宽度）。 */
  contentClassName?: string
  /** Footer 左侧额外 slot（如辅助按钮）。 */
  footerLeft?: React.ReactNode
  /** 是否隐藏右上角关闭 X。 */
  hideCloseButton?: boolean
  /** 成功提交后是否自动关闭 dialog。默认 true；
   *  如果调用方自己在 onSubmit / mutation onSuccess 里管关闭时刻，设为 false。 */
  autoClose?: boolean
}

/**
 * 统一的表单型对话框。
 * - 内置 `<form onSubmit>` 包裹，提交按钮 `type="submit"`，取消按钮 `type="button"`
 * - Radix Dialog 自动聚焦首个可聚焦元素（通常是第一个 Input）
 * - 任意 Input 按 Enter 自然触发提交
 * - 支持异步 onSubmit：期间禁用按钮并显示 loading，成功后自动关闭
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  cancelLabel,
  submitVariant = 'default',
  onSubmit,
  submitDisabled,
  submitting: externalSubmitting,
  submittingLabel,
  children,
  contentClassName,
  footerLeft,
  hideCloseButton,
  autoClose = true,
}: FormDialogProps) {
  const { t } = useTranslation('common')
  const [internalSubmitting, setInternalSubmitting] = React.useState(false)
  const isSubmitting = Boolean(externalSubmitting) || internalSubmitting
  const isSubmitDisabled = Boolean(submitDisabled) || isSubmitting

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (isSubmitDisabled) return
      try {
        setInternalSubmitting(true)
        await onSubmit()
        if (autoClose) {
          onOpenChange(false)
        }
      } catch {
        // 失败保持打开，调用方自行显示错误
      } finally {
        setInternalSubmitting(false)
      }
    },
    [isSubmitDisabled, onSubmit, onOpenChange, autoClose],
  )

  const handleCancel = React.useCallback(() => {
    if (isSubmitting) return
    onOpenChange(false)
  }, [isSubmitting, onOpenChange])

  const handleOpenChange = (next: boolean) => {
    if (!next && isSubmitting) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={contentClassName} showCloseButton={!hideCloseButton}>
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription asChild>
                <div>{description}</div>
              </DialogDescription>
            ) : null}
          </DialogHeader>

          <div className="space-y-4">{children}</div>

          <DialogFooter className="sm:justify-end">
            {footerLeft ? <div className="mr-auto">{footerLeft}</div> : null}
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="rounded-3xl shadow-none transition-colors duration-150"
            >
              {cancelLabel ?? t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitDisabled}
              className={cn(
                'rounded-3xl shadow-none transition-colors duration-150',
                submitVariant === 'destructive' &&
                  'bg-destructive text-white hover:bg-destructive/90',
              )}
            >
              {isSubmitting
                ? (submittingLabel ?? t('submitting'))
                : (submitLabel ?? t('save'))}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
