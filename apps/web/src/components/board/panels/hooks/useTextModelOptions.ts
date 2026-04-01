/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Hook to provide filtered model options for the Text AI Panel.
 *
 * Reuses the same model infrastructure as chat (buildChatModelOptions),
 * with optional tag-based filtering per text feature.
 */

import { useMemo } from 'react'
import { useCloudModels } from '@/hooks/use-cloud-models'
import { useBasicConfig } from '@/hooks/use-basic-config'
import { useSettingsValues } from '@/hooks/use-settings'
import {
  buildChatModelOptions,
  normalizeChatModelSource,
  type ProviderModelOption,
} from '@/lib/provider-models'

interface UseTextModelOptionsResult {
  modelOptions: ProviderModelOption[]
  chatModelSource: 'local' | 'cloud'
}

/**
 * Build model options for the text AI panel, filtered by required tags.
 *
 * @param requiredTags — If provided, only models with ALL of these tags are included.
 *   If empty or undefined, all models are returned.
 */
export function useTextModelOptions(
  requiredTags?: string[],
): UseTextModelOptionsResult {
  const { basic } = useBasicConfig()
  const { providerItems } = useSettingsValues()
  const { models: cloudModels } = useCloudModels()

  const chatModelSource = normalizeChatModelSource(basic.chatSource)

  const modelOptions = useMemo(() => {
    const all = buildChatModelOptions(chatModelSource, providerItems, cloudModels)
    if (!requiredTags?.length) return all
    return all.filter((opt) => {
      if (!opt.tags?.length) return false
      return requiredTags.every((tag) => opt.tags!.includes(tag as any))
    })
  }, [chatModelSource, providerItems, cloudModels, requiredTags])

  return { modelOptions, chatModelSource }
}
