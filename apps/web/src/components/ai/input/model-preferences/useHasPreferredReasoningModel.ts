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
 * @param projectId Optional project id for resolving project-scoped master agent.
 */
export function useHasPreferredReasoningModel(projectId?: string): boolean {
  const { providerItems } = useSettingsValues()
  const { models: cloudModels } = useCloudModels()
  const installedCliProviderIds = useInstalledCliProviderIds()
  const { basic } = useBasicConfig()
  const { modelIds: masterModelIds } = useMainAgentModel(projectId)

  const chatModelSource = normalizeChatModelSource(basic.chatSource)

  return useMemo(() => {
    const chatModels = buildChatModelOptions(
      chatModelSource,
      providerItems,
      cloudModels,
      installedCliProviderIds,
    )
    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(masterModelIds) ? masterModelIds : [])
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    )

    // 逻辑：Auto 或未解析到当前模型时，回退检查全部模型。
    if (normalizedIds.length === 0) {
      return chatModels.some((m) => m.tags?.includes('reasoning'))
    }

    const selected = normalizedIds
      .map((id) => chatModels.find((m) => m.id === id))
      .filter(Boolean)

    if (selected.length === 0) {
      return chatModels.some((m) => m.tags?.includes('reasoning'))
    }

    return selected.some((model) => model?.tags?.includes('reasoning'))
  }, [
    chatModelSource,
    cloudModels,
    installedCliProviderIds,
    masterModelIds,
    providerItems,
  ])
}
