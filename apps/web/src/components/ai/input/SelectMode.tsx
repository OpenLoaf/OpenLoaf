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

import { memo, useEffect, useMemo, useState } from 'react'
import { Cloud, HardDrive } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'
import { useModelPreferences } from './model-preferences/useModelPreferences'
import { ModelPreferencesPanel } from './model-preferences/ModelPreferencesPanel'

import { useOptionalChatSession } from '../context'
import { useAppView } from '@/hooks/use-app-view'
import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@openloaf/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@openloaf/ui/tooltip'

interface SelectModeProps {
  className?: string
  /** Trigger style for model selector. */
  triggerVariant?: 'text' | 'icon'
  /** Current chat mode — adjusts trigger colour accent. */
  chatMode?: 'agent' | 'cli'
  /** When true, show the icon but disable interaction (no popover). */
  disabled?: boolean
}

function SelectModeInner({
  className,
  triggerVariant = 'text',
  chatMode = 'agent',
  disabled = false,
}: SelectModeProps) {
  const { t } = useTranslation('ai')
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const prefs = useModelPreferences()
  const chatSession = useOptionalChatSession()
  const chatSessionId = useAppView((s) => s.chatSessionId)
  const tabId = chatSession?.tabId ?? chatSessionId
  const isIconTrigger = triggerVariant === 'icon'

  // CLI 模式下不显示工具 icon（codeModelIds 已移除）
  const AgentIcon = prefs.isCloudSource ? Cloud : HardDrive

  // 逻辑：Popover 打开时刷新配置和云端模型
  useEffect(() => {
    if (!popoverOpen) return
    prefs.refreshOnOpen()
    return prefs.syncCloudModelsOnOpen()
  }, [popoverOpen])

  // 逻辑：遮罩控制（与原逻辑一致）
  useEffect(() => {
    if (!tabId) return
    const target = document.querySelector(
      `[data-openloaf-chat-root][data-tab-id="${tabId}"][data-chat-active="true"]`,
    )
    if (!target) return
    const mask = target.querySelector<HTMLElement>(
      '[data-openloaf-chat-mask]',
    )
    if (mask) {
      if (popoverOpen) {
        mask.classList.remove('hidden')
        mask.style.pointerEvents = 'auto'
      } else {
        mask.classList.add('hidden')
        mask.style.pointerEvents = 'none'
      }
    }
    return () => {
      if (mask) {
        mask.classList.add('hidden')
        mask.style.pointerEvents = 'none'
      }
    }
  }, [popoverOpen, tabId])

  useEffect(() => {
    if (prefs.authLoggedIn) {
      setLoginOpen(false)
    }
  }, [prefs.authLoggedIn])

  const handleOpenLogin = () => {
    setPopoverOpen(false)
    setLoginOpen(true)
  }

  const triggerButton = isIconTrigger ? (
    <PromptInputButton
      type="button"
      size="icon-sm"
      variant="ghost"
      className={cn(
        'h-8 w-8 rounded-3xl transition-colors',
        chatMode === 'cli'
          ? 'bg-secondary text-foreground'
          : 'bg-secondary text-foreground',
        className,
      )}
      aria-label={t('mode.customizeSettings')}
    >
      <AgentIcon className="h-4 w-4" />
    </PromptInputButton>
  ) : (
    <PromptInputButton
      type="button"
      size="sm"
      className={cn(
        'h-7 w-auto min-w-0 shrink inline-flex items-center gap-1 rounded-3xl px-1.5 text-xs font-medium transition-colors',
        chatMode === 'cli'
          ? 'bg-secondary text-foreground hover:bg-secondary/80'
          : 'bg-secondary text-foreground hover:bg-secondary/80',
        className,
      )}
    >
      <AgentIcon className="h-3.5 w-3.5" />
      <span className="truncate">{t('mode.customizeSettings')}</span>
    </PromptInputButton>
  )

  if (disabled) {
    return isIconTrigger ? (
      <PromptInputButton
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled
        className={cn(
          'h-8 w-8 rounded-3xl transition-colors pointer-events-none opacity-60',
          chatMode === 'cli'
            ? 'bg-secondary text-foreground'
            : 'bg-secondary text-foreground',
          className,
        )}
        aria-label={t('mode.customizeSettings')}
      >
        <AgentIcon className="h-4 w-4" />
      </PromptInputButton>
    ) : (
      <PromptInputButton
        type="button"
        size="sm"
        disabled
        className={cn(
          'h-7 w-auto min-w-0 shrink inline-flex items-center gap-1 rounded-3xl px-1.5 text-xs font-medium transition-colors pointer-events-none opacity-60',
          chatMode === 'cli'
            ? 'bg-secondary text-foreground'
            : 'bg-secondary text-foreground',
          className,
        )}
      >
        <AgentIcon className="h-3.5 w-3.5" />
        <span className="truncate">{t('mode.customizeSettings')}</span>
      </PromptInputButton>
    )
  }

  return (
    <>
      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <Tooltip open={popoverOpen ? false : undefined}>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {t('mode.customizeSettings')}
          </TooltipContent>

          <PopoverContent
            side="top"
            align="end"
            sideOffset={8}
            className={cn(
              'w-96 max-w-[94vw] rounded-3xl ol-glass-float p-2',
            )}
          >
            <ModelPreferencesPanel
              prefs={prefs}
              showCloudLogin={prefs.showCloudLogin}
              authLoggedIn={prefs.authLoggedIn}
              chatMode={chatMode}
              onOpenLogin={handleOpenLogin}
              onClose={() => setPopoverOpen(false)}
            />
          </PopoverContent>
        </Popover>
      </Tooltip>
    </>
  )
}

const SelectMode = memo(SelectModeInner)
export default SelectMode
