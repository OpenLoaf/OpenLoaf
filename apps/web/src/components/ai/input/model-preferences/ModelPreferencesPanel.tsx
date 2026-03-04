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

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModelPreferencesHeader } from './ModelPreferencesHeader'
import { ModelCategoryTabs } from './ModelCategoryTabs'
import {
  ChatModelCheckboxList,
  MediaModelCheckboxList,
} from './ModelCheckboxList'
import { CliToolsList } from './CliToolsList'
import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import type { useModelPreferences } from './useModelPreferences'

type Prefs = ReturnType<typeof useModelPreferences>

function MediaEmptyWithLogin({
  label,
  onClose,
  onOpenLogin,
}: {
  label: string
  onClose: () => void
  onOpenLogin: () => void
}) {
  const { t } = useTranslation('ai')
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8">
      <img src="/logo.svg" alt="OpenLoaf" className="h-10 w-10 opacity-60" />
      <div className="text-xs text-muted-foreground">{label}</div>
      <PromptInputButton
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full px-4"
        onClick={() => {
          onClose()
          onOpenLogin()
        }}
      >
        {t('mode.loginAccount')}
      </PromptInputButton>
    </div>
  )
}

interface ModelPreferencesPanelProps {
  prefs: Prefs
  showCloudLogin: boolean
  authLoggedIn: boolean
  chatMode?: 'agent' | 'cli'
  onOpenLogin: () => void
  onOpenInstall?: () => void
  onClose: () => void
}

export function ModelPreferencesPanel({
  prefs,
  showCloudLogin,
  authLoggedIn,
  chatMode = 'agent',
  onOpenLogin,
  onOpenInstall,
  onClose,
}: ModelPreferencesPanelProps) {
  const { t } = useTranslation('ai')
  const [activeTab, setActiveTab] = useState('chat')
  const isChatTab = activeTab === 'chat'
  const isImageTab = activeTab === 'image'
  const isCliTab = activeTab === 'cli'
  const isAuto = isChatTab
    ? prefs.isAuto
    : isImageTab
      ? prefs.isImageAuto
      : prefs.isVideoAuto

  const handleCloudSourceChange = (cloud: boolean) => {
    prefs.setCloudSource(cloud ? 'cloud' : 'local')
  }

  const handleAutoChange = (auto: boolean) => {
    if (isChatTab) {
      prefs.setIsAuto(auto)
      return
    }
    if (isImageTab) {
      prefs.setImageAuto(auto)
      return
    }
    prefs.setVideoAuto(auto)
  }

  const selectedCliToolId = useMemo<'codex' | 'claudeCode' | undefined>(() => {
    const codeId = prefs.preferredCodeIds[0] ?? ''
    if (codeId === 'codex') return 'codex'
    if (codeId === 'claudeCode') return 'claudeCode'
    if (codeId.startsWith('codex-cli:')) return 'codex'
    if (codeId.startsWith('claude-code-cli:')) return 'claudeCode'
    return undefined
  }, [prefs.preferredCodeIds])

  /** 将 CLI 工具选择映射为该 provider 的首个可用 code model id。 */
  const handleCliToolSelect = useCallback(
    (toolId: string) => {
      const providerId =
        toolId === 'codex'
          ? 'codex-cli'
          : toolId === 'claudeCode'
            ? 'claude-code-cli'
            : ''
      if (!providerId) return
      const fallbackModelId = prefs.codeModels.find(
        (item) => item.providerId === providerId,
      )?.id
      if (fallbackModelId) {
        prefs.selectCodeModel(fallbackModelId)
        return
      }
      // 逻辑：模型注册表未就绪时，使用稳定兜底模型，保证工具切换可用。
      const defaultModelId =
        providerId === 'codex-cli'
          ? 'codex-cli:gpt-5.2-codex'
          : providerId === 'claude-code-cli'
            ? 'claude-code-cli:claude-sonnet-4-6'
            : ''
      if (!defaultModelId) return
      prefs.selectCodeModel(defaultModelId)
    },
    [prefs.codeModels, prefs.selectCodeModel],
  )

  // CLI 模式下只显示 CLI 工具列表
  if (chatMode === 'cli') {
    return (
      <div className="flex flex-col gap-2">
        <div className="px-1">
          <span className="text-[13px] font-medium text-foreground">
            {t('mode.cliTools')}
          </span>
        </div>
        <CliToolsList
          selectedId={selectedCliToolId}
          onSelect={handleCliToolSelect}
          onOpenInstall={onOpenInstall}
        />
      </div>
    )
  }

  const needsLogin = isChatTab ? showCloudLogin : !authLoggedIn

  return (
    <div className="flex flex-col gap-2">
      {/* 开关区 — CLI tab 不需要模型偏好开关 */}
      {!isCliTab && (
        <ModelPreferencesHeader
          isCloudSource={prefs.isCloudSource}
          isAuto={isAuto}
          showCloudSwitch={isChatTab}
          showManageButton={isChatTab}
          disableAuto={needsLogin}
          onCloudSourceChange={handleCloudSourceChange}
          onAutoChange={handleAutoChange}
          onManageModels={() => {
            onClose()
            requestAnimationFrame(() => {
              prefs.openProviderSettings()
            })
          }}
        />
      )}

      {/* 列表 */}
      <div className="min-h-[8rem]">
        {isCliTab ? (
          <div className="flex flex-col gap-2">
            <div className="px-1">
              <span className="text-[13px] font-medium text-foreground">
                {t('mode.cliTools')}
              </span>
            </div>
            <CliToolsList
              selectedId={selectedCliToolId}
              onSelect={handleCliToolSelect}
              onOpenInstall={onOpenInstall}
            />
          </div>
        ) : needsLogin ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <img src="/logo.svg" alt="OpenLoaf" className="h-10 w-10 opacity-60" />
            <div className="text-xs text-muted-foreground">
              {t('mode.useCloudModels')}
            </div>
            <PromptInputButton
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full px-4"
              onClick={() => {
                onClose()
                onOpenLogin()
              }}
            >
              {t('mode.loginAccount')}
            </PromptInputButton>
          </div>
        ) : isChatTab ? (
          <ChatModelCheckboxList
            models={prefs.chatModels}
            preferredIds={prefs.preferredChatIds}
            onToggle={prefs.toggleChatModel}
          />
        ) : activeTab === 'image' ? (
          prefs.imageModels.length === 0 ? (
            <MediaEmptyWithLogin label={t('mode.noImageModels')} onClose={onClose} onOpenLogin={onOpenLogin} />
          ) : (
            <MediaModelCheckboxList
              models={prefs.imageModels}
              preferredIds={prefs.preferredImageIds}
              onToggle={prefs.toggleImageModel}
            />
          )
        ) : (
          prefs.videoModels.length === 0 ? (
            <MediaEmptyWithLogin label={t('mode.noVideoModels')} onClose={onClose} onOpenLogin={onOpenLogin} />
          ) : (
            <MediaModelCheckboxList
              models={prefs.videoModels}
              preferredIds={prefs.preferredVideoIds}
              onToggle={prefs.toggleVideoModel}
            />
          )
        )}
      </div>

      {/* Tab 切换 — 底部，延伸到面板边缘与面板边框融合 */}
      <div className="-mx-2 -mb-2">
        <ModelCategoryTabs value={activeTab} onValueChange={setActiveTab} />
      </div>
    </div>
  )
}
