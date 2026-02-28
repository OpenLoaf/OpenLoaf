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

import { useEffect, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'
import { useModelPreferences } from './model-preferences/useModelPreferences'
import { ModelPreferencesPanel } from './model-preferences/ModelPreferencesPanel'
import { ModelSelectionTooltip } from './model-preferences/ModelSelectionTooltip'
import { useOptionalChatSession } from '../context'
import { useTabs } from '@/hooks/use-tabs'
import {
  PromptInputButton,
  PromptInputHoverCard,
  PromptInputHoverCardContent,
  PromptInputHoverCardTrigger,
} from '@/components/ai-elements/prompt-input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@openloaf/ui/popover'

interface SelectModeProps {
  className?: string
  /** Trigger style for model selector. */
  triggerVariant?: 'text' | 'icon'
}

export default function SelectMode({
  className,
  triggerVariant = 'text',
}: SelectModeProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const prefs = useModelPreferences()
  const chatSession = useOptionalChatSession()
  const activeTabId = useTabs((s) => s.activeTabId)
  const tabId = chatSession?.tabId ?? activeTabId
  const isIconTrigger = triggerVariant === 'icon'

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

  // 逻辑：登录成功后自动关闭登录弹窗
  useEffect(() => {
    if (prefs.authLoggedIn && loginOpen) {
      setLoginOpen(false)
    }
  }, [prefs.authLoggedIn, loginOpen])

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
        'h-8 w-8 rounded-full bg-violet-500/10 text-violet-600 transition-colors hover:bg-violet-500/20 hover:text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 dark:hover:bg-violet-500/25 dark:hover:text-violet-200',
        className,
      )}
      aria-label="自定义设置"
    >
      <Settings2 className="h-4 w-4" />
    </PromptInputButton>
  ) : (
    <PromptInputButton
      type="button"
      size="sm"
      className={cn(
        'h-7 w-auto min-w-0 shrink inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-1.5 text-xs font-medium text-violet-600 hover:bg-violet-500/20 transition-colors dark:bg-violet-500/15 dark:text-violet-300 dark:hover:bg-violet-500/25',
        className,
      )}
    >
      <Settings2 className="h-3.5 w-3.5" />
      <span className="truncate">自定义设置</span>
    </PromptInputButton>
  )

  return (
    <>
      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <PromptInputHoverCard
        open={popoverOpen ? false : undefined}
        openDelay={300}
      >
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PromptInputHoverCardTrigger asChild>
            <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          </PromptInputHoverCardTrigger>
          <PromptInputHoverCardContent className="max-w-[16rem]">
            <ModelSelectionTooltip
              chatModels={prefs.chatModels}
              imageModels={prefs.imageModels}
              videoModels={prefs.videoModels}
              codeModels={prefs.codeModels}
              preferredChatIds={prefs.preferredChatIds}
              preferredImageIds={prefs.preferredImageIds}
              preferredVideoIds={prefs.preferredVideoIds}
              preferredCodeIds={prefs.preferredCodeIds}
            />
          </PromptInputHoverCardContent>
          <PopoverContent
            side="top"
            align="end"
            sideOffset={8}
            className={cn(
              'w-96 max-w-[94vw] rounded-xl border-border bg-muted/40 p-2 shadow-2xl backdrop-blur-sm',
            )}
          >
            <ModelPreferencesPanel
              prefs={prefs}
              showCloudLogin={prefs.showCloudLogin}
              authLoggedIn={prefs.authLoggedIn}
              onOpenLogin={handleOpenLogin}
              onClose={() => setPopoverOpen(false)}
            />
          </PopoverContent>
        </Popover>
      </PromptInputHoverCard>
    </>
  )
}
