'use client'

import { useMemo } from 'react'
import { useSettingsValues } from '@/hooks/use-settings'
import { useBasicConfig } from '@/hooks/use-basic-config'
import { useCloudModels } from '@/hooks/use-cloud-models'
import { useInstalledCliProviderIds } from '@/hooks/use-cli-tools-installed'
import {
  buildChatModelOptions,
  normalizeChatModelSource,
} from '@/lib/provider-models'
import { useTabs } from '@/hooks/use-tabs'
import {
  CHAT_MODEL_SELECTION_TAB_PARAMS_KEY,
  normalizeStoredSelections,
  readStoredSelections,
  type ModelSourceKey,
} from '../chat-model-selection-storage'
import { useOptionalChatSession } from '../../context'

/**
 * 轻量 hook：判断当前偏好的聊天模型中是否包含推理模型。
 * 不包含写入逻辑和副作用，仅做只读计算。
 */
export function useHasPreferredReasoningModel(): boolean {
  const { providerItems } = useSettingsValues()
  const { models: cloudModels } = useCloudModels()
  const installedCliProviderIds = useInstalledCliProviderIds()
  const { basic } = useBasicConfig()
  const chatSession = useOptionalChatSession()
  const activeTabId = useTabs((s) => s.activeTabId)

  const tabStoredSelectionsRaw = useTabs((state) => {
    const targetTabId = chatSession?.tabId ?? state.activeTabId
    if (!targetTabId) return undefined
    const tab = state.tabs.find((item) => item.id === targetTabId)
    return (tab?.chatParams as Record<string, unknown> | undefined)?.[
      CHAT_MODEL_SELECTION_TAB_PARAMS_KEY
    ]
  })

  const chatModelSource = normalizeChatModelSource(basic.chatSource)
  const isCloudSource = chatModelSource === 'cloud'
  const sourceKey: ModelSourceKey = isCloudSource ? 'cloud' : 'local'
  const modelSelectionMemoryScope: 'tab' | 'global' =
    basic.chatOnlineSearchMemoryScope === 'global' ? 'global' : 'tab'
  const tabId = chatSession?.tabId ?? activeTabId

  return useMemo(() => {
    const storedSelections =
      modelSelectionMemoryScope === 'tab' && tabId
        ? normalizeStoredSelections(tabStoredSelectionsRaw)
        : readStoredSelections()

    const currentSelection = storedSelections[sourceKey] ?? {
      lastModelId: '',
      isAuto: true,
    }

    const chatModels = buildChatModelOptions(
      chatModelSource,
      providerItems,
      cloudModels,
      installedCliProviderIds,
    )

    // 逻辑：自动模式下所有模型都可用，检查全部模型是否含推理模型
    if (currentSelection.isAuto) {
      return chatModels.some((m) => m.tags?.includes('reasoning'))
    }

    const preferredIds =
      currentSelection.preferredModelIds ??
      (currentSelection.lastModelId ? [currentSelection.lastModelId] : [])

    if (preferredIds.length === 0) return false

    return chatModels.some(
      (m) => preferredIds.includes(m.id) && m.tags?.includes('reasoning'),
    )
  }, [
    chatModelSource,
    cloudModels,
    installedCliProviderIds,
    modelSelectionMemoryScope,
    providerItems,
    sourceKey,
    tabId,
    tabStoredSelectionsRaw,
  ])
}
