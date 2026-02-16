'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Button } from '@tenas-ai/ui/button'
import { Cloud, HardDrive, LogIn, Settings2 } from 'lucide-react'
import { useChatActions, useChatSession, useChatState } from '../context'
import { useBasicConfig } from '@/hooks/use-basic-config'
import { useSettingsValues } from '@/hooks/use-settings'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useTabs } from '@/hooks/use-tabs'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'

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
        {/* 用户消息气泡 */}
        <div className="flex min-w-0 justify-end">
          <div className="show-scrollbar max-h-64 min-w-0 max-w-[78%] overflow-x-hidden overflow-y-auto rounded-2xl rounded-br-md border border-[#e3e8ef] bg-[#f6f8fc] px-3 py-2 dark:border-slate-700 dark:bg-[hsl(var(--muted)/0.3)]">
            <span className="text-[12px] leading-4 whitespace-pre-wrap break-words text-foreground">
              {pendingCloudMessage.text}
            </span>
          </div>
        </div>

        {/* 提示卡片：低饱和中性风格，避免悬浮感 */}
        <div className="mt-1.5 flex justify-end">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.14, delay: 0.06, ease: 'easeOut' }}
            className="w-full max-w-[78%] rounded-2xl border border-[#e3e8ef] bg-[#ffffff] dark:border-slate-700 dark:bg-[hsl(var(--background)/0.9)]"
          >
            <div className="flex items-center gap-2 border-b border-[#e3e8ef] px-2.5 py-2 dark:border-slate-700">
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[#fce8e6] text-[#d93025] dark:bg-[hsl(0_62%_28%/0.38)] dark:text-red-200">
                <LogIn className="size-3" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-[#202124] dark:text-slate-100">
                  当前无可用模型
                </p>
                <p className="truncate text-[10px] text-[#5f6368] dark:text-slate-400">
                  {hasConfiguredProviders
                    ? '请登录云端模型，或切换至本地模型后继续。'
                    : '请登录云端模型，或先完成本地模型配置。'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 p-2">
              <Button
                type="button"
                size="sm"
                className="h-8 flex-1 rounded-xl bg-[#d3e3fd] px-2 text-[11px] text-[#001d35] hover:bg-[#c6dafc] dark:bg-sky-800/60 dark:text-sky-50 dark:hover:bg-sky-800/75"
                onClick={handleLogin}
              >
                <Cloud className="size-3.5" />
                登录云端模型
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 flex-1 rounded-xl border-[#e3e8ef] bg-[#f6f8fc] px-2 text-[11px] text-[#5f6368] hover:bg-[#f1f3f4] dark:border-slate-700 dark:bg-[hsl(var(--muted)/0.3)] dark:text-slate-300 dark:hover:bg-[hsl(var(--muted)/0.42)]"
                onClick={handleUseLocal}
              >
                {hasConfiguredProviders ? (
                  <HardDrive className="size-3" />
                ) : (
                  <Settings2 className="size-3" />
                )}
                {hasConfiguredProviders ? '切换本地模型' : '前往模型配置'}
              </Button>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </>
  )
}
