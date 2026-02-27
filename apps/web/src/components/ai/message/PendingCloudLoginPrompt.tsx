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
import { motion, useReducedMotion } from 'motion/react'
import { Cloud, HardDrive, Settings2, Sparkles } from 'lucide-react'
import { useChatActions, useChatSession, useChatState } from '../context'
import { useBasicConfig } from '@/hooks/use-basic-config'
import { useSettingsValues } from '@/hooks/use-settings'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useTabs } from '@/hooks/use-tabs'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'
import { Message, MessageContent } from '@/components/ai-elements/message'

export default function PendingCloudLoginPrompt() {
  const { pendingCloudMessage } = useChatState()
  const { sendPendingCloudMessage } = useChatActions()
  const { basic, setBasic } = useBasicConfig()
  const { providerItems } = useSettingsValues()
  const { tabId } = useChatSession()
  const { activeTabId } = useTabs()
  const { pushStackItem } = useTabRuntime()
  const reduceMotion = useReducedMotion()

  const [loginOpen, setLoginOpen] = useState(false)
  const [autoSendOnSourceChange, setAutoSendOnSourceChange] = useState(false)

  const activeChatTabId = tabId ?? activeTabId

  const hasConfiguredProviders = providerItems.some(
    (item) => (item.category ?? 'general') === 'provider',
  )

  // 逻辑：切换到本地模型后，等 chatSource 更新再自动发送
  useEffect(() => {
    if (!autoSendOnSourceChange) return
    if (basic.chatSource !== 'local') return
    setAutoSendOnSourceChange(false)
    requestAnimationFrame(() => sendPendingCloudMessage())
  }, [autoSendOnSourceChange, basic.chatSource, sendPendingCloudMessage])

  if (!pendingCloudMessage) return null

  const handleLogin = () => setLoginOpen(true)

  const handleUseLocal = () => {
    if (hasConfiguredProviders) {
      setAutoSendOnSourceChange(true)
      void setBasic({ chatSource: 'local' })
    } else if (activeChatTabId) {
      pushStackItem(
        activeChatTabId,
        {
          id: 'provider-management',
          sourceKey: 'provider-management',
          component: 'provider-management',
          title: '管理模型',
        },
        100,
      )
    }
  }

  return (
    <>
      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <motion.div
        key="pending-cloud-login"
        layout
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="my-0.5 px-2 pr-5"
      >
        <Message from="user" className="ml-auto max-w-[78%]">
          <MessageContent className="show-scrollbar max-h-64 overflow-x-hidden overflow-y-auto border border-primary/35 px-3 py-2 text-[12px] leading-4 shadow-sm group-[.is-user]:!bg-primary/85 group-[.is-user]:!text-primary-foreground">
            <span className="whitespace-pre-wrap break-words">{pendingCloudMessage.text}</span>
          </MessageContent>
        </Message>

        <Message from="assistant" className="mt-1.5 max-w-[78%]">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.14, delay: 0.06, ease: 'easeOut' }}
          >
            <MessageContent className="w-full !bg-transparent !p-0">
              <div className="overflow-hidden rounded-xl bg-[#e8f0fe] dark:bg-sky-900/30">
                <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[#fef7e0] dark:bg-amber-900/40">
                    <Sparkles className="size-3 text-[#f9ab00] dark:text-amber-300" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-[#1a73e8] dark:text-sky-300">
                      需要登录后继续
                    </p>
                    <p className="truncate text-[10px] text-[#5f6368] dark:text-slate-400">
                      {hasConfiguredProviders
                        ? '登录云端模型，或切换至本地模型后继续对话'
                        : '登录云端模型，或先完成本地模型配置'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 border-t border-[#1a73e8]/10 px-3.5 py-2.5 dark:border-sky-500/10">
                  <button
                    type="button"
                    onClick={() => handleLogin()}
                    className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#1a73e8] px-3 text-[11px] font-medium text-white transition-colors duration-150 hover:bg-[#1557b0] dark:bg-sky-600 dark:hover:bg-sky-500"
                  >
                    <Cloud className="size-3" />
                    登录云端模型
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUseLocal()}
                    className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full border border-[#1a73e8]/25 bg-white/70 px-3 text-[11px] font-medium text-[#1a73e8] transition-colors duration-150 hover:bg-[#d2e3fc] dark:border-sky-500/25 dark:bg-sky-900/40 dark:text-sky-300 dark:hover:bg-sky-900/60"
                  >
                    {hasConfiguredProviders ? (
                      <HardDrive className="size-3" />
                    ) : (
                      <Settings2 className="size-3" />
                    )}
                    {hasConfiguredProviders ? '切换本地模型' : '前往模型配置'}
                  </button>
                </div>
              </div>
            </MessageContent>
          </motion.div>
        </Message>
      </motion.div>
    </>
  )
}
