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

import { useTranslation } from 'react-i18next'
import { ModelPreferencesHeader } from './ModelPreferencesHeader'
import { ChatModelCheckboxList } from './ModelCheckboxList'
import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import type { useModelPreferences } from './useModelPreferences'

type Prefs = ReturnType<typeof useModelPreferences>

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
  chatMode = 'agent',
  onOpenLogin,
  onClose,
}: ModelPreferencesPanelProps) {
  const { t } = useTranslation('ai')

  const handleCloudSourceChange = (cloud: boolean) => {
    prefs.setCloudSource(cloud ? 'cloud' : 'local')
  }

  // CLI 模式下不显示模型面板（CLI 工具选择已移除）。
  if (chatMode === 'cli') {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <ModelPreferencesHeader
        isCloudSource={prefs.isCloudSource}
        showCloudSwitch
        showManageButton
        onCloudSourceChange={handleCloudSourceChange}
        onManageModels={() => {
          onClose()
          requestAnimationFrame(() => {
            prefs.openProviderSettings()
          })
        }}
      />

      <div className="min-h-[8rem]">
        {showCloudLogin ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <img src="/logo.svg" alt="OpenLoaf" className="h-10 w-10 opacity-60" />
            <div className="text-xs text-muted-foreground">
              {t('mode.useCloudModels')}
            </div>
            <PromptInputButton
              type="button"
              variant="outline"
              size="sm"
              className="rounded-3xl px-4"
              onClick={() => {
                onClose()
                onOpenLogin()
              }}
            >
              {t('mode.loginAccount')}
            </PromptInputButton>
          </div>
        ) : (
          <ChatModelCheckboxList
            models={prefs.chatModels}
            preferredIds={prefs.preferredChatIds}
            onToggle={prefs.toggleChatModel}
          />
        )}
      </div>
    </div>
  )
}
