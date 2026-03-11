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

import { useEffect, startTransition, useCallback } from 'react'
import i18next from 'i18next'
import { AI_ASSISTANT_TAB_INPUT, WORKBENCH_TAB_INPUT } from '@openloaf/api/common'
import { useTabs } from '@/hooks/use-tabs'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useGlobalOverlay } from '@/lib/globalShortcuts'

// 四个主页面的 baseId / component 集合（与 Sidebar 保持一致）。
const WORKSPACE_PAGE_BASE_IDS = new Set([
  WORKBENCH_TAB_INPUT.baseId,
  'base:calendar',
  'base:scheduled-tasks',
  'base:mailbox',
])
const WORKSPACE_PAGE_COMPONENTS = new Set([
  WORKBENCH_TAB_INPUT.component,
  'calendar-page',
  'scheduled-tasks-page',
  'email-page',
])

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
  const addTab = useTabs((s) => s.addTab)
  const setActiveTab = useTabs((s) => s.setActiveTab)
  const setTabTitle = useTabs((s) => s.setTabTitle)
  const setTabIcon = useTabs((s) => s.setTabIcon)
  const activeTabId = useTabs((s) => s.activeTabId)
  const setTabBase = useTabRuntime((s) => s.setTabBase)
  const clearStack = useTabRuntime((s) => s.clearStack)

  const openSingletonTab = useCallback(
    (input: TabInput) => {
      const tabTitle = input.titleKey ? i18next.t(input.titleKey) : (input.title ?? '')

      const state = useTabs.getState()
      const runtime = useTabRuntime.getState().runtimeByTabId
      const existing = state.tabs.find((tab) => {
        if (runtime[tab.id]?.base?.id === input.baseId) return true
        if (input.component === 'ai-chat' && !runtime[tab.id]?.base && tab.title === tabTitle) return true
        return false
      })
      if (existing) {
        startTransition(() => setActiveTab(existing.id))
        return
      }
      addTab({
        createNew: true,
        title: tabTitle,
        icon: input.icon,
        leftWidthPercent: 100,
        base: input.component === 'ai-chat' ? undefined : { id: input.baseId, component: input.component },
      })
    },
    [addTab, setActiveTab],
  )

  const openWorkspacePageTab = useCallback(
    (input: TabInput) => {
      const tabTitle = input.titleKey ? i18next.t(input.titleKey) : (input.title ?? '')

      const state = useTabs.getState()
      const runtime = useTabRuntime.getState().runtimeByTabId

      const currentTab =
        activeTabId && state.tabs.find((tab) => tab.id === activeTabId)
      const currentBase = currentTab ? runtime[currentTab.id]?.base : undefined
      const shouldReuse =
        Boolean(currentTab) &&
        Boolean(currentBase) &&
        WORKSPACE_PAGE_BASE_IDS.has(currentBase!.id) &&
        WORKSPACE_PAGE_COMPONENTS.has(currentBase!.component)

      if (currentTab && shouldReuse) {
        setTabBase(currentTab.id, { id: input.baseId, component: input.component })
        clearStack(currentTab.id)
        setTabTitle(currentTab.id, tabTitle)
        setTabIcon(currentTab.id, input.icon)
        startTransition(() => setActiveTab(currentTab.id))
        return
      }

      const existingPage = state.tabs
        .filter((tab) => {
          const base = runtime[tab.id]?.base
          if (!base) return false
          return WORKSPACE_PAGE_BASE_IDS.has(base.id) && WORKSPACE_PAGE_COMPONENTS.has(base.component)
        })
        .sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0]

      if (existingPage) {
        setTabBase(existingPage.id, { id: input.baseId, component: input.component })
        clearStack(existingPage.id)
        setTabTitle(existingPage.id, tabTitle)
        setTabIcon(existingPage.id, input.icon)
        startTransition(() => setActiveTab(existingPage.id))
        return
      }

      addTab({
        createNew: true,
        title: tabTitle,
        icon: input.icon,
        leftWidthPercent: 100,
        base: { id: input.baseId, component: input.component },
      })
    },
    [activeTabId, addTab, clearStack, setActiveTab, setTabBase, setTabIcon, setTabTitle],
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
        openWorkspacePageTab(input)
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
  }, [openSingletonTab, openWorkspacePageTab])

  return null
}
