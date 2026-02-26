'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Cloud, HardDrive, LogIn, Settings2 } from 'lucide-react'
import { useChatActions, useChatSession, useChatState } from '../context'
import { useBasicConfig } from '@/hooks/use-basic-config'
import { useSettingsValues } from '@/hooks/use-settings'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useTabs } from '@/hooks/use-tabs'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { Suggestion } from '@/components/ai-elements/suggestion'
import { Card, CardContent, CardHeader } from '@openloaf/ui/card'

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

        <Message from="assistant" className="ml-auto mt-1.5 max-w-[78%]">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.14, delay: 0.06, ease: 'easeOut' }}
          >
            <MessageContent className="w-full">
              <Card>
                <CardHeader className="flex items-center gap-2 border-b px-3 py-2">
                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <LogIn className="size-3" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-foreground">
                      当前无可用模型
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {hasConfiguredProviders
                        ? '请登录云端模型，或切换至本地模型后继续。'
                        : '请登录云端模型，或先完成本地模型配置。'}
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="flex items-center gap-1.5 p-3">
                  <Suggestion
                    suggestion="login-cloud"
                    onClick={() => handleLogin()}
                    variant="default"
                    className="h-8 flex-1 rounded-xl px-2 text-[11px]"
                  >
                    <Cloud className="size-3.5" />
                    登录云端模型
                  </Suggestion>
                  <Suggestion
                    suggestion={hasConfiguredProviders ? 'switch-local' : 'open-settings'}
                    variant="outline"
                    onClick={() => handleUseLocal()}
                    className="h-8 flex-1 rounded-xl px-2 text-[11px]"
                  >
                    {hasConfiguredProviders ? (
                      <HardDrive className="size-3" />
                    ) : (
                      <Settings2 className="size-3" />
                    )}
                    {hasConfiguredProviders ? '切换本地模型' : '前往模型配置'}
                  </Suggestion>
                </CardContent>
              </Card>
            </MessageContent>
          </motion.div>
        </Message>
      </motion.div>
    </>
  )
}
