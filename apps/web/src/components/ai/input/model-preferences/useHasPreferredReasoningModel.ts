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

/**
 * 轻量 hook：判断当前偏好的聊天模型中是否包含推理模型。
 * 不包含写入逻辑和副作用，仅做只读计算。
 */
export function useHasPreferredReasoningModel(): boolean {
  const { providerItems } = useSettingsValues()
  const { models: cloudModels } = useCloudModels()
  const installedCliProviderIds = useInstalledCliProviderIds()
  const { basic } = useBasicConfig()

  const chatModelSource = normalizeChatModelSource(basic.chatSource)

  return useMemo(() => {
    const chatModels = buildChatModelOptions(
      chatModelSource,
      providerItems,
      cloudModels,
      installedCliProviderIds,
    )

    const storedId = (basic.chatModelId ?? '').trim()
    const effectiveIds = storedId
      ? [storedId]
      : chatModels[0]
        ? [chatModels[0].id]
        : []

    const selected = effectiveIds
      .map((id) => chatModels.find((m) => m.id === id))
      .filter(Boolean)

    if (selected.length === 0) {
      return chatModels.some((m) => m.reasoning && m.reasoning !== 'none')
    }

    return selected.some(
      (model) => model?.reasoning && model.reasoning !== 'none',
    )
  }, [
    chatModelSource,
    cloudModels,
    installedCliProviderIds,
    basic.chatModelId,
    providerItems,
  ])
}
