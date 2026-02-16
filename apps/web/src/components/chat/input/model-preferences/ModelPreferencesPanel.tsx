'use client'

import { useState } from 'react'
import { Button } from '@tenas-ai/ui/button'
import { ModelPreferencesHeader } from './ModelPreferencesHeader'
import { ModelCategoryTabs } from './ModelCategoryTabs'
import {
  ChatModelCheckboxList,
  MediaModelCheckboxList,
} from './ModelCheckboxList'
import type { useModelPreferences } from './useModelPreferences'

type Prefs = ReturnType<typeof useModelPreferences>

interface ModelPreferencesPanelProps {
  prefs: Prefs
  showCloudLogin: boolean
  onOpenLogin: () => void
  onClose: () => void
}

export function ModelPreferencesPanel({
  prefs,
  showCloudLogin,
  onOpenLogin,
  onClose,
}: ModelPreferencesPanelProps) {
  const [activeTab, setActiveTab] = useState('chat')
  const isChatTab = activeTab === 'chat'

  const handleCloudSourceChange = (cloud: boolean) => {
    prefs.setCloudSource(cloud ? 'cloud' : 'local')
  }

  return (
    <div className="space-y-2">
      {/* 列表 */}
      <div className="min-h-[8rem]">
        {showCloudLogin && isChatTab ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onClose()
                onOpenLogin()
              }}
            >
              登录Tenas账户，使用云端模型
            </Button>
            <div className="text-xs text-muted-foreground">
              使用云端模型
            </div>
          </div>
        ) : isChatTab ? (
          <ChatModelCheckboxList
            models={prefs.chatModels}
            preferredIds={prefs.preferredChatIds}
            disabled={prefs.isAuto}
            onToggle={prefs.toggleChatModel}
          />
        ) : activeTab === 'image' ? (
          <MediaModelCheckboxList
            models={prefs.imageModels}
            preferredIds={prefs.preferredImageIds}
            disabled={prefs.isAuto}
            onToggle={prefs.toggleImageModel}
            emptyText="暂无图像模型"
          />
        ) : (
          <MediaModelCheckboxList
            models={prefs.videoModels}
            preferredIds={prefs.preferredVideoIds}
            disabled={prefs.isAuto}
            onToggle={prefs.toggleVideoModel}
            emptyText="暂无视频模型"
          />
        )}
      </div>

      {/* 开关区：聊天 Tab 显示云端+自动，图片/视频 Tab 只显示自动 */}
      <ModelPreferencesHeader
        isCloudSource={prefs.isCloudSource}
        isAuto={prefs.isAuto}
        showCloudSwitch={isChatTab}
        showManageButton={isChatTab}
        onCloudSourceChange={handleCloudSourceChange}
        onAutoChange={prefs.setIsAuto}
        onManageModels={() => {
          onClose()
          requestAnimationFrame(() => {
            prefs.openProviderSettings()
          })
        }}
      />

      {/* Tab 切换 */}
      <ModelCategoryTabs value={activeTab} onValueChange={setActiveTab} />
    </div>
  )
}
