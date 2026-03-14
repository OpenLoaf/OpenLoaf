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

import { useEffect, useCallback } from 'react'
import i18next from 'i18next'
import { AI_ASSISTANT_TAB_INPUT, WORKBENCH_TAB_INPUT } from '@openloaf/api/common'
import { useAppView } from '@/hooks/use-app-view'
import { useLayoutState } from '@/hooks/use-layout-state'
import { useGlobalOverlay } from '@/lib/globalShortcuts'
import { openPrimaryPage } from '@/lib/primary-page-navigation'

type NavTarget = 'search' | 'ai-assistant' | 'workbench' | 'calendar' | 'email' | 'tasks'

type TabInput = {
  baseId: string
  component: string
  title?: string
  titleKey?: string
  icon: string
}

const NAV_MAP: Record<Exclude<NavTarget, 'search'>, TabInput> = {
  'ai-assistant': AI_ASSISTANT_TAB_INPUT,
  workbench: WORKBENCH_TAB_INPUT,
  calendar: { baseId: 'base:calendar', component: 'calendar-page', titleKey: 'nav:calendar', icon: '🗓️' },
  email: { baseId: 'base:mailbox', component: 'email-page', titleKey: 'nav:email', icon: '📧' },
  tasks: { baseId: 'base:scheduled-tasks', component: 'scheduled-tasks-page', titleKey: 'nav:tasks', icon: '⏰' },
}

/**
 * 监听 Electron 托盘菜单的导航事件和新建对话事件。
 * 返回 null，无可见 UI。
 */
export default function TrayNavigationListener() {
  const navigate = useAppView((s) => s.navigate)

  const openSingletonTab = useCallback(
    (input: TabInput) => {
      const tabTitle = input.titleKey ? i18next.t(input.titleKey) : (input.title ?? '')

      // In single-view mode, check if already showing this view.
      const layout = useLayoutState.getState()
      if (layout.base?.id === input.baseId) return
      if (input.component === 'ai-chat' && !layout.base) return

      navigate({
        title: tabTitle,
        icon: input.icon,
        leftWidthPercent: 100,
        base: input.component === 'ai-chat' ? undefined : { id: input.baseId, component: input.component },
      })
    },
    [navigate],
  )

  const openPrimaryPageTab = useCallback(
    (input: TabInput) => {
      const tabTitle = input.titleKey ? i18next.t(input.titleKey) : (input.title ?? '')
      openPrimaryPage({
        baseId: input.baseId,
        component: input.component,
        title: tabTitle,
        icon: input.icon,
      })
    },
    [],
  )

  useEffect(() => {
    // 托盘导航事件
    const handleNavigate = (e: Event) => {
      const target = (e as CustomEvent<{ target: NavTarget }>).detail?.target
      if (!target) return

      if (target === 'search') {
        useGlobalOverlay.getState().setSearchOpen(true)
        return
      }

      const input = NAV_MAP[target]
      if (!input) return

      // AI 助手使用单例 tab，其余四个主页面共用一个 tab。
      if (target === 'ai-assistant') {
        openSingletonTab(input)
      } else {
        openPrimaryPageTab(input)
      }
    }

    // 新建对话事件
    const handleNewConversation = () => {
      openSingletonTab(AI_ASSISTANT_TAB_INPUT)
    }

    window.addEventListener('openloaf:tray:navigate', handleNavigate)
    window.addEventListener('openloaf:tray:new-conversation', handleNewConversation)
    return () => {
      window.removeEventListener('openloaf:tray:navigate', handleNavigate)
      window.removeEventListener('openloaf:tray:new-conversation', handleNewConversation)
    }
  }, [openSingletonTab, openPrimaryPageTab])

  return null
}
