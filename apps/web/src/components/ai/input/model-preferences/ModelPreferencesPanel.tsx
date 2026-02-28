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

import { useState } from 'react'
import { ModelPreferencesHeader } from './ModelPreferencesHeader'
import { ModelCategoryTabs } from './ModelCategoryTabs'
import {
  ChatModelCheckboxList,
  MediaModelCheckboxList,
} from './ModelCheckboxList'
import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import type { useModelPreferences } from './useModelPreferences'

type Prefs = ReturnType<typeof useModelPreferences>

interface ModelPreferencesPanelProps {
  prefs: Prefs
  showCloudLogin: boolean
  authLoggedIn: boolean
  onOpenLogin: () => void
  onClose: () => void
}

export function ModelPreferencesPanel({
  prefs,
  showCloudLogin,
  authLoggedIn,
  onOpenLogin,
  onClose,
}: ModelPreferencesPanelProps) {
  const [activeTab, setActiveTab] = useState('chat')
  const isChatTab = activeTab === 'chat'
  const isImageTab = activeTab === 'image'
  const isCodeTab = activeTab === 'code'
  const isAuto = isChatTab
    ? prefs.isAuto
    : isImageTab
      ? prefs.isImageAuto
      : isCodeTab
        ? prefs.isCodeAuto
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
    if (isCodeTab) {
      prefs.setCodeAuto(auto)
      return
    }
    prefs.setVideoAuto(auto)
  }

  // 代码 tab 始终本地，无需登录
  const needsLogin = isCodeTab ? false : isChatTab ? showCloudLogin : !authLoggedIn

  return (
    <div className="flex flex-col gap-2">
      {/* 开关区 */}
      <ModelPreferencesHeader
        isCloudSource={prefs.isCloudSource}
        isAuto={isAuto}
        showCloudSwitch={isChatTab && !isCodeTab}
        showManageButton={isChatTab && !isCodeTab}
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

      {/* 列表 */}
      <div className="min-h-[8rem]">
        {/* 逻辑：对话 tab 仅云端源时需登录；媒体 tab 始终需要云端，未登录即提示 */}
        {needsLogin ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <PromptInputButton
              type="button"
              size="sm"
              onClick={() => {
                onClose()
                onOpenLogin()
              }}
            >
              登录OpenLoaf账户，使用云端模型
            </PromptInputButton>
            <div className="text-xs text-muted-foreground">
              使用云端模型
            </div>
          </div>
        ) : isCodeTab ? (
          <ChatModelCheckboxList
            models={prefs.codeModels}
            preferredIds={prefs.preferredCodeIds}
            onToggle={prefs.toggleCodeModel}
          />
        ) : isChatTab ? (
          <ChatModelCheckboxList
            models={prefs.chatModels}
            preferredIds={prefs.preferredChatIds}
            onToggle={prefs.toggleChatModel}
          />
        ) : activeTab === 'image' ? (
          <MediaModelCheckboxList
            models={prefs.imageModels}
            preferredIds={prefs.preferredImageIds}
            onToggle={prefs.toggleImageModel}
            emptyText="暂无图像模型"
          />
        ) : (
          <MediaModelCheckboxList
            models={prefs.videoModels}
            preferredIds={prefs.preferredVideoIds}
            onToggle={prefs.toggleVideoModel}
            emptyText="暂无视频模型"
          />
        )}
      </div>

      {/* Tab 切换 — 底部，延伸到面板边缘与面板边框融合 */}
      <div className="-mx-2 -mb-2">
        <ModelCategoryTabs value={activeTab} onValueChange={setActiveTab} />
      </div>
    </div>
  )
}
