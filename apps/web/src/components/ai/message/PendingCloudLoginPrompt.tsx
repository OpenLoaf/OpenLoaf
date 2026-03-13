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

import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Cloud, HardDrive, Settings2, Sparkles } from 'lucide-react'
import { useChatActions, useChatSession, useChatState } from '../context'
import { useBasicConfig } from '@/hooks/use-basic-config'
import { useSettingsValues } from '@/hooks/use-settings'
import { useLayoutState } from '@/hooks/use-layout-state'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'
import { Message, MessageContent } from '@/components/ai-elements/message'
import AssistantMessageHeader from './AssistantMessageHeader'

export default function PendingCloudLoginPrompt() {
  const { pendingCloudMessage } = useChatState()
  const { sendPendingCloudMessage } = useChatActions()
  const { basic, setBasic } = useBasicConfig()
  const { providerItems } = useSettingsValues()
  const { tabId } = useChatSession()
  const { pushStackItem } = useLayoutState()
  const reduceMotion = useReducedMotion()
  const authLoggedIn = useSaasAuth((s) => s.loggedIn)

  const [loginOpen, setLoginOpen] = useState(false)
  const [autoSendOnSourceChange, setAutoSendOnSourceChange] = useState(false)
  const prevChatSourceRef = useRef(basic.chatSource)

  const hasConfiguredProviders = providerItems.some(
    (item) => (item.category ?? 'general') === 'provider',
  )

  // 逻辑：切换模型来源后（local↔cloud），等 chatSource 更新再自动发送
  useEffect(() => {
    if (!autoSendOnSourceChange) return
    if (basic.chatSource === prevChatSourceRef.current) return
    prevChatSourceRef.current = basic.chatSource
    setAutoSendOnSourceChange(false)
    requestAnimationFrame(() => sendPendingCloudMessage())
  }, [autoSendOnSourceChange, basic.chatSource, sendPendingCloudMessage])

  // 保持 ref 同步
  useEffect(() => {
    prevChatSourceRef.current = basic.chatSource
  }, [basic.chatSource])

  if (!pendingCloudMessage) return null

  // 已登录用户 + 本地无模型 → 显示"使用云端模型"引导
  const isLoggedInLocalEmpty = authLoggedIn && !hasConfiguredProviders && basic.chatSource === 'local'

  const handleLogin = () => setLoginOpen(true)

  const handleUseCloud = () => {
    setAutoSendOnSourceChange(true)
    void setBasic({ chatSource: 'cloud' })
  }

  const handleUseLocal = () => {
    if (hasConfiguredProviders) {
      setAutoSendOnSourceChange(true)
      void setBasic({ chatSource: 'local' })
    } else {
      pushStackItem(
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

  const handleGoToProviderConfig = () => {
    pushStackItem(
      {
        id: 'provider-management',
        sourceKey: 'provider-management',
        component: 'provider-management',
        title: '管理模型',
      },
      100,
    )
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
          <AssistantMessageHeader />
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.14, delay: 0.06, ease: 'easeOut' }}
          >
            <MessageContent className="w-full !bg-transparent !p-0">
              <div className="overflow-hidden rounded-xl bg-ol-blue-bg">
                <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-ol-amber-bg">
                    <Sparkles className="size-3 text-ol-amber" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-ol-blue">
                      {isLoggedInLocalEmpty ? '本地模型未配置' : '需要登录后继续'}
                    </p>
                    <p className="truncate text-[10px] text-ol-text-auxiliary">
                      {isLoggedInLocalEmpty
                        ? '切换到云端模型继续对话，或先完成本地模型配置'
                        : hasConfiguredProviders
                          ? '登录云端模型，或切换至本地模型后继续对话'
                          : '登录云端模型，或先完成本地模型配置'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 border-t border-ol-blue/10 px-3.5 py-2.5">
                  {isLoggedInLocalEmpty ? (
                    <>
                      <button
                        type="button"
                        onClick={handleUseCloud}
                        className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full bg-ol-blue px-3 text-[11px] font-medium text-white transition-colors duration-150 hover:brightness-110"
                      >
                        <Cloud className="size-3" />
                        使用云端模型
                      </button>
                      <button
                        type="button"
                        onClick={handleGoToProviderConfig}
                        className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full border border-ol-blue/25 bg-white/70 px-3 text-[11px] font-medium text-ol-blue transition-colors duration-150 hover:bg-ol-blue-bg-hover dark:bg-ol-blue-bg"
                      >
                        <Settings2 className="size-3" />
                        前往模型配置
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleLogin()}
                        className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full bg-ol-blue px-3 text-[11px] font-medium text-white transition-colors duration-150 hover:brightness-110"
                      >
                        <Cloud className="size-3" />
                        登录云端模型
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUseLocal()}
                        className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full border border-ol-blue/25 bg-white/70 px-3 text-[11px] font-medium text-ol-blue transition-colors duration-150 hover:bg-ol-blue-bg-hover dark:bg-ol-blue-bg"
                      >
                        {hasConfiguredProviders ? (
                          <HardDrive className="size-3" />
                        ) : (
                          <Settings2 className="size-3" />
                        )}
                        {hasConfiguredProviders ? '切换本地模型' : '前往模型配置'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </MessageContent>
          </motion.div>
        </Message>
      </motion.div>
    </>
  )
}
