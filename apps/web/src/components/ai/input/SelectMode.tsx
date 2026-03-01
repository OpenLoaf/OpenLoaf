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

import { useEffect, useMemo, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'
import { useModelPreferences } from './model-preferences/useModelPreferences'
import { ModelPreferencesPanel } from './model-preferences/ModelPreferencesPanel'
import { CLI_TOOLS_META } from './model-preferences/CliToolsList'
import { useOptionalChatSession } from '../context'
import { useTabs } from '@/hooks/use-tabs'
import { openSettingsTab } from '@/lib/globalShortcuts'
import {
  PromptInputButton,
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
  /** Current chat mode — adjusts trigger colour accent. */
  chatMode?: 'agent' | 'cli'
}

export default function SelectMode({
  className,
  triggerVariant = 'text',
  chatMode = 'agent',
}: SelectModeProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const prefs = useModelPreferences()
  const chatSession = useOptionalChatSession()
  const activeTabId = useTabs((s) => s.activeTabId)
  const tabId = chatSession?.tabId ?? activeTabId
  const isIconTrigger = triggerVariant === 'icon'

  const cliIcon = useMemo(() => {
    if (chatMode !== 'cli') return null
    const selectedId = prefs.preferredCodeIds[0]
    const tool = selectedId ? CLI_TOOLS_META.find((t) => t.id === selectedId) : CLI_TOOLS_META[0]
    return tool ?? null
  }, [chatMode, prefs.preferredCodeIds])

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

  const handleOpenInstall = () => {
    const wsId = chatSession?.workspaceId
    if (!wsId) return
    setPopoverOpen(false)
    requestAnimationFrame(() => {
      openSettingsTab(wsId, 'thirdPartyTools')
    })
  }

  const CliIconComponent = cliIcon?.icon
  const triggerButton = isIconTrigger ? (
    <PromptInputButton
      type="button"
      size="icon-sm"
      variant="ghost"
      className={cn(
        'h-8 w-8 rounded-full transition-colors',
        chatMode === 'cli'
          ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 hover:text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25 dark:hover:text-amber-200'
          : 'bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 hover:text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 dark:hover:bg-violet-500/25 dark:hover:text-violet-200',
        className,
      )}
      aria-label="自定义设置"
    >
      {CliIconComponent ? (
        <CliIconComponent size={16} className="h-4 w-4" />
      ) : (
        <Settings2 className="h-4 w-4" />
      )}
    </PromptInputButton>
  ) : (
    <PromptInputButton
      type="button"
      size="sm"
      className={cn(
        'h-7 w-auto min-w-0 shrink inline-flex items-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors',
        chatMode === 'cli'
          ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25'
          : 'bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 dark:bg-violet-500/15 dark:text-violet-300 dark:hover:bg-violet-500/25',
        className,
      )}
    >
      {CliIconComponent ? (
        <CliIconComponent size={14} className="h-3.5 w-3.5" />
      ) : (
        <Settings2 className="h-3.5 w-3.5" />
      )}
      <span className="truncate">自定义设置</span>
    </PromptInputButton>
  )

  return (
    <>
      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
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
            chatMode={chatMode}
            onOpenLogin={handleOpenLogin}
            onOpenInstall={handleOpenInstall}
            onClose={() => setPopoverOpen(false)}
          />
        </PopoverContent>
      </Popover>
    </>
  )
}
