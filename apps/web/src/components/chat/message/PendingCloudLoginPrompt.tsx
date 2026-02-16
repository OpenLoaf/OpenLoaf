'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Button } from '@tenas-ai/ui/button'
import { Cloud, HardDrive, X } from 'lucide-react'
import { useChatActions, useChatSession, useChatState } from '../context'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { useBasicConfig } from '@/hooks/use-basic-config'
import { useSettingsValues } from '@/hooks/use-settings'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useTabs } from '@/hooks/use-tabs'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'

export default function PendingCloudLoginPrompt() {
  const { pendingCloudMessage } = useChatState()
  const { setPendingCloudMessage, sendPendingCloudMessage } = useChatActions()
  const { loggedIn: authLoggedIn } = useSaasAuth()
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

  const handleCancel = () => setPendingCloudMessage(null)

  return (
    <>
      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <motion.div
        key="pending-cloud-login"
        layout
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="my-0.5 px-2 pr-5"
      >
        {/* 用户消息气泡 */}
        <div className="flex min-w-0 justify-end">
          <div className="max-h-64 min-w-0 max-w-[80%] overflow-x-hidden overflow-y-auto rounded-lg border border-primary/35 bg-primary/85 p-3 shadow-sm show-scrollbar">
            <span className="text-[12px] leading-4 whitespace-pre-wrap break-words text-primary-foreground">
              {pendingCloudMessage.text}
            </span>
          </div>
        </div>

        {/* 提示卡片 */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14, delay: 0.06, ease: 'easeOut' }}
          className="mt-1.5 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2.5"
        >
          <div className="flex items-center gap-1.5 text-[12px] leading-4 text-muted-foreground">
            <Cloud className="h-3.5 w-3.5 shrink-0 text-sky-500" />
            <span>需要登录 Tenas 账户才能使用云端模型</span>
          </div>

          <div className="mt-2 flex items-center gap-1.5">
            <Button type="button" size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={handleLogin}>
              <Cloud className="h-3 w-3" />
              登录 Tenas 云端
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={handleUseLocal}
            >
              <HardDrive className="h-3 w-3" />
              {hasConfiguredProviders ? '使用本地模型' : '配置本地模型'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={handleCancel}
            >
              <X className="h-3 w-3" />
              取消
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </>
  )
}
