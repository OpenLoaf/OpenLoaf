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

import { CheckCircle2, ChevronRight, ExternalLink, Plus, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

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

/** 预设账户类型（id 为存储键，labelKey 用于 i18n 显示） */
const ACCOUNT_TYPE_PRESETS = [
  { id: 'work', labelKey: 'email.accountPreset_work', color: 'bg-ol-blue' },
  { id: 'personal', labelKey: 'email.accountPreset_personal', color: 'bg-ol-green' },
  { id: 'support', labelKey: 'email.accountPreset_support', color: 'bg-ol-amber' },
  { id: 'notifications', labelKey: 'email.accountPreset_notifications', color: 'bg-purple-500' },
  { id: 'marketing', labelKey: 'email.accountPreset_marketing', color: 'bg-pink-500' },
  { id: 'finance', labelKey: 'email.accountPreset_finance', color: 'bg-ol-amber' },
  { id: 'tech', labelKey: 'email.accountPreset_tech', color: 'bg-cyan-500' },
  { id: 'subscriptions', labelKey: 'email.accountPreset_subscriptions', color: 'bg-ol-text-auxiliary' },
] as const

type ConfigureStepProps = {
  addDialog: AddDialogState
}

export function ConfigureStep({ addDialog }: ConfigureStepProps) {
  const { t } = useTranslation('common')
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
    (l) => !ACCOUNT_TYPE_PRESETS.some((p) => p.id === l),
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
      ? t('email.loginWithGoogle')
      : t('email.loginWithMicrosoft')

  const isGmailProvider =
    addDialog.formState.selectedProviderId === 'gmail'

  return (
    <div className="space-y-4 py-2">
      {isOAuth ? (
        <>
          {addDialog.formState.oauthAuthorized ? (
            <div className="flex items-center gap-2 rounded-lg bg-ol-green/10 px-3 py-2.5">
              <CheckCircle2 className="size-4 text-ol-green" />
              <span className="text-xs text-ol-green">
                {t('email.authorized')}
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
              {t('email.useAppPassword')}
              <ExternalLink className="size-3" />
            </button>
          ) : null}
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-foreground/80">
              {t('email.emailAddress')}
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
                  {t('email.howToGet')}
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
              placeholder={t('email.passwordPlaceholder', { label: addDialog.selectedProviderPasswordLabel })}
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
                  {t('email.serverConfig')}
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
                  <span className="size-1.5 rounded-full bg-ol-blue" />
                  {t('email.imapIncoming')}
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
                    placeholder={t('email.port')}
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
                  <span className="size-1.5 rounded-full bg-ol-green" />
                  {t('email.smtpOutgoing')}
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
                    placeholder={t('email.port')}
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
          {t('email.accountType')}
          <span className="ml-1 font-normal text-muted-foreground">
            {t('email.optional')}
          </span>
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          {ACCOUNT_TYPE_PRESETS.map((preset) => {
            const isSelected = selectedLabels.includes(preset.id)
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleToggleLabel(preset.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                  isSelected
                    ? 'bg-foreground text-background'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span className={cn('size-2 rounded-full', preset.color)} />
                {t(preset.labelKey)}
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
              placeholder={t('email.pressEnterToAdd')}
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
              {t('email.custom')}
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
        <div className="rounded-lg bg-ol-green/10 px-3 py-2.5 text-xs text-ol-green">
          {t('email.testSuccess')}
        </div>
      ) : null}
    </div>
  )
}
