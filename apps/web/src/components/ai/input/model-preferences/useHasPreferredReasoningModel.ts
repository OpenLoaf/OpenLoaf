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
import { useMainAgentModel } from '@/components/ai/hooks/use-main-agent-model'

/**
 * 轻量 hook：判断当前偏好的聊天模型中是否包含推理模型。
 * 不包含写入逻辑和副作用，仅做只读计算。
 */
export function useHasPreferredReasoningModel(): boolean {
  const { providerItems } = useSettingsValues()
  const { models: cloudModels } = useCloudModels()
  const installedCliProviderIds = useInstalledCliProviderIds()
  const { basic } = useBasicConfig()
  const { modelId: masterModelId } = useMainAgentModel()

  const chatModelSource = normalizeChatModelSource(basic.chatSource)

  return useMemo(() => {
    const chatModels = buildChatModelOptions(
      chatModelSource,
      providerItems,
      cloudModels,
      installedCliProviderIds,
    )
    const normalizedMasterId = masterModelId.trim()

    // 逻辑：Auto 或未解析到当前模型时，回退检查全部模型。
    if (!normalizedMasterId) {
      return chatModels.some((m) => m.tags?.includes('reasoning'))
    }

    const selected = chatModels.find((m) => m.id === normalizedMasterId)
    if (!selected) {
      return chatModels.some((m) => m.tags?.includes('reasoning'))
    }

    return Boolean(selected.tags?.includes('reasoning'))
  }, [
    chatModelSource,
    cloudModels,
    installedCliProviderIds,
    masterModelId,
    providerItems,
  ])
}
