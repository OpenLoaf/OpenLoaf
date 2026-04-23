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
import { ModelIcon } from '@/components/setting/menus/provider/ModelIcon'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'
import { useModelPreferences } from './model-preferences/useModelPreferences'
import { ModelPreferencesPanel } from './model-preferences/ModelPreferencesPanel'

import { useOptionalChatSession } from '../context'
import { useChatView } from '@/hooks/use-chat-view'
import { useChatScope } from '@/lib/chat-scope'
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
  const scope = useChatScope()
  const activeSessionId = useChatView((s) => s.sessions[scope.scope]?.activeSessionId ?? "")
  const tabId = chatSession?.tabId ?? activeSessionId
  const isIconTrigger = triggerVariant === 'icon'

  // 选中模型的 provider + modelId 用于渲染品牌图标；未选中时回退 Cloud / HardDrive。
  const selectedModel = useMemo(() => {
    const id = prefs.preferredChatIds[0]
    if (!id) return undefined
    return prefs.chatModels.find((m) => m.id === id)
  }, [prefs.chatModels, prefs.preferredChatIds])

  const FallbackIcon = prefs.isCloudSource ? Cloud : HardDrive

  const renderAgentIcon = (pxSize: number, cls?: string) =>
    selectedModel ? (
      <ModelIcon
        icon={selectedModel.providerId}
        model={selectedModel.modelId}
        size={pxSize}
        className={cls}
      />
    ) : (
      <FallbackIcon className={cls} style={{ width: pxSize, height: pxSize }} />
    )

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
      {renderAgentIcon(16)}
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
      {renderAgentIcon(14)}
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
        {renderAgentIcon(16)}
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
        {renderAgentIcon(14)}
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
