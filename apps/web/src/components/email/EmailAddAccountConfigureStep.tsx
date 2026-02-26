/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n'use client'

import { CheckCircle2, ChevronRight, ExternalLink, Plus, Settings2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@openloaf/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@openloaf/ui/collapsible'
import { Input } from '@openloaf/ui/input'
import { Label } from '@openloaf/ui/label'
import { Switch } from '@openloaf/ui/switch'
import { cn } from '@/lib/utils'
import type { AddDialogState } from './use-email-page-state'

/** 预设账户类型 */
const ACCOUNT_TYPE_PRESETS = [
  { label: '工作', color: 'bg-blue-500' },
  { label: '个人', color: 'bg-green-500' },
  { label: '客服', color: 'bg-orange-500' },
  { label: '通知', color: 'bg-purple-500' },
  { label: '营销', color: 'bg-pink-500' },
  { label: '财务', color: 'bg-amber-500' },
  { label: '技术', color: 'bg-cyan-500' },
  { label: '订阅', color: 'bg-slate-500' },
] as const

type ConfigureStepProps = {
  addDialog: AddDialogState
}

export function ConfigureStep({ addDialog }: ConfigureStepProps) {
  const isCustomProvider = addDialog.formState.selectedProviderId === 'custom'
  const isOAuth = addDialog.formState.authType === 'oauth2'
  const [advancedOpen, setAdvancedOpen] = useState(isCustomProvider)
  const [customLabelMode, setCustomLabelMode] = useState(false)
  const [customInputValue, setCustomInputValue] = useState('')
  const currentLabel = addDialog.formState.label

  const selectedLabels = currentLabel
    ? currentLabel.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  const customLabels = selectedLabels.filter(
    (l) => !ACCOUNT_TYPE_PRESETS.some((p) => p.label === l),
  )

  const handleToggleLabel = (label: string) => {
    const isSelected = selectedLabels.includes(label)
    let nextLabels: string[]
    if (isSelected) {
      nextLabels = selectedLabels.filter((l) => l !== label)
    } else {
      nextLabels = [...selectedLabels, label]
    }
    addDialog.setFormState((prev) => ({
      ...prev,
      label: nextLabels.join(', '),
    }))
  }

  const handleEnableCustomLabel = () => {
    setCustomLabelMode(true)
    setCustomInputValue('')
  }

  const handleCustomLabelConfirm = () => {
    const value = customInputValue.trim()
    if (value && !selectedLabels.includes(value)) {
      const nextLabels = [...selectedLabels, value]
      addDialog.setFormState((prev) => ({
        ...prev,
        label: nextLabels.join(', '),
      }))
    }
    setCustomLabelMode(false)
    setCustomInputValue('')
  }

  const handleCustomLabelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCustomLabelConfirm()
    } else if (e.key === 'Escape') {
      setCustomLabelMode(false)
      setCustomInputValue('')
    }
  }

  const handleRemoveCustomLabel = (label: string) => {
    const nextLabels = selectedLabels.filter((l) => l !== label)
    addDialog.setFormState((prev) => ({
      ...prev,
      label: nextLabels.join(', '),
    }))
  }

  const oauthButtonLabel =
    addDialog.formState.oauthProvider === 'google'
      ? '使用 Google 账号登录'
      : '使用 Microsoft 账号登录'

  const isGmailProvider =
    addDialog.formState.selectedProviderId === 'gmail'

  return (
    <div className="space-y-4 py-2">
      {isOAuth ? (
        <>
          {addDialog.formState.oauthAuthorized ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5">
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                已授权
                {addDialog.formState.oauthEmail
                  ? ` ${addDialog.formState.oauthEmail}`
                  : ''}
              </span>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full text-sm"
              onClick={addDialog.onOAuthLogin}
            >
              {oauthButtonLabel}
            </Button>
          )}
          {isGmailProvider ? (
            <button
              type="button"
              onClick={addDialog.onSwitchToPassword}
              className="inline-flex items-center gap-1 text-[11px] text-primary/70 transition-colors hover:text-primary"
            >
              使用应用专用密码
              <ExternalLink className="size-3" />
            </button>
          ) : null}
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-foreground/80">
              邮箱地址
            </Label>
            <Input
              value={addDialog.formState.emailAddress}
              onChange={(event) =>
                addDialog.setFormState((prev) => ({
                  ...prev,
                  emailAddress: event.target.value,
                }))
              }
              placeholder="name@example.com"
              className="h-9 text-sm"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-foreground/80">
                {addDialog.selectedProviderPasswordLabel}
              </Label>
              {addDialog.selectedProviderAppPasswordUrl ? (
                <a
                  href={addDialog.selectedProviderAppPasswordUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary/70 transition-colors hover:text-primary"
                >
                  如何获取？
                  <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
            <Input
              type="password"
              value={addDialog.formState.password}
              onChange={(event) =>
                addDialog.setFormState((prev) => ({
                  ...prev,
                  password: event.target.value,
                }))
              }
              placeholder={`输入${addDialog.selectedProviderPasswordLabel}`}
              className="h-9 text-sm"
            />
          </div>
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <span className="flex items-center gap-2">
                  <Settings2 className="size-3.5" />
                  服务器配置
                </span>
                <ChevronRight
                  className={cn(
                    'size-3.5 transition-transform duration-200',
                    advancedOpen && 'rotate-90',
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-4">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground/70">
                  <span className="size-1.5 rounded-full bg-blue-500" />
                  IMAP 收信
                </div>
                <div className="grid grid-cols-[1fr,90px] gap-2">
                  <Input
                    value={addDialog.formState.imapHost}
                    onChange={(event) =>
                      addDialog.setFormState((prev) => ({
                        ...prev,
                        imapHost: event.target.value,
                      }))
                    }
                    placeholder="imap.example.com"
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    value={addDialog.formState.imapPort}
                    onChange={(event) =>
                      addDialog.setFormState((prev) => ({
                        ...prev,
                        imapPort: Number(event.target.value || 0),
                      }))
                    }
                    placeholder="端口"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] text-muted-foreground">
                    SSL/TLS
                  </span>
                  <Switch
                    checked={addDialog.formState.imapTls}
                    onCheckedChange={(checked) =>
                      addDialog.setFormState((prev) => ({
                        ...prev,
                        imapTls: checked,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground/70">
                  <span className="size-1.5 rounded-full bg-green-500" />
                  SMTP 发信
                </div>
                <div className="grid grid-cols-[1fr,90px] gap-2">
                  <Input
                    value={addDialog.formState.smtpHost}
                    onChange={(event) =>
                      addDialog.setFormState((prev) => ({
                        ...prev,
                        smtpHost: event.target.value,
                      }))
                    }
                    placeholder="smtp.example.com"
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    value={addDialog.formState.smtpPort}
                    onChange={(event) =>
                      addDialog.setFormState((prev) => ({
                        ...prev,
                        smtpPort: Number(event.target.value || 0),
                      }))
                    }
                    placeholder="端口"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] text-muted-foreground">
                    SSL/TLS
                  </span>
                  <Switch
                    checked={addDialog.formState.smtpTls}
                    onCheckedChange={(checked) =>
                      addDialog.setFormState((prev) => ({
                        ...prev,
                        smtpTls: checked,
                      }))
                    }
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      <div className="space-y-2">
        <Label className="text-xs font-medium text-foreground/80">
          账户类型
          <span className="ml-1 font-normal text-muted-foreground">
            （可选）
          </span>
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          {ACCOUNT_TYPE_PRESETS.map((preset) => {
            const isSelected = selectedLabels.includes(preset.label)
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleToggleLabel(preset.label)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                  isSelected
                    ? 'bg-foreground text-background'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span className={cn('size-2 rounded-full', preset.color)} />
                {preset.label}
              </button>
            )
          })}
          {customLabels.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => handleRemoveCustomLabel(label)}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-all"
            >
              <span className="size-2 rounded-full bg-background/30" />
              {label}
            </button>
          ))}
          {customLabelMode ? (
            <Input
              value={customInputValue}
              onChange={(event) => setCustomInputValue(event.target.value)}
              onBlur={handleCustomLabelConfirm}
              onKeyDown={handleCustomLabelKeyDown}
              placeholder="输入后回车"
              className="h-7 w-28 text-xs"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={handleEnableCustomLabel}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-3" />
              自定义
            </button>
          )}
        </div>
      </div>

      {addDialog.formError ? (
        <div className="rounded-lg bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          {addDialog.formError}
        </div>
      ) : null}
      {addDialog.testStatus === 'ok' ? (
        <div className="rounded-lg bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-600 dark:text-emerald-400">
          连接测试通过，可以保存账号
        </div>
      ) : null}
    </div>
  )
}
