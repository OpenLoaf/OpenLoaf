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

import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsValues } from '@/hooks/use-settings'
import { useBasicConfig } from '@/hooks/use-basic-config'
import {
  fetchCloudModelsUpdatedAt,
  useCloudModels,
} from '@/hooks/use-cloud-models'
import { useInstalledCliProviderIds } from '@/hooks/use-cli-tools-installed'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { useLayoutState } from '@/hooks/use-layout-state'
import {
  buildChatModelOptions,
  normalizeChatModelSource,
} from '@/lib/provider-models'

export function useModelPreferences() {
  const { t } = useTranslation('ai')
  const { providerItems, refresh } = useSettingsValues()
  const {
    models: cloudModels,
    updatedAt: cloudModelsUpdatedAt,
    loaded: cloudModelsLoaded,
    refresh: refreshCloudModels,
  } = useCloudModels()
  const installedCliProviderIds = useInstalledCliProviderIds()
  const { basic, setBasic } = useBasicConfig()
  const { loggedIn: authLoggedIn, refreshSession } = useSaasAuth()
  const pushStackItem = useLayoutState((s) => s.pushStackItem)

  const chatModelSource = normalizeChatModelSource(basic.chatSource)
  const isCloudSource = chatModelSource === 'cloud'

  const chatModels = useMemo(
    () =>
      buildChatModelOptions(
        chatModelSource,
        providerItems,
        cloudModels,
        installedCliProviderIds,
      ),
    [chatModelSource, providerItems, cloudModels, installedCliProviderIds],
  )

  const preferredChatIds = useMemo(() => {
    const id = (basic.chatModelId ?? '').trim()
    return id ? [id] : []
  }, [basic.chatModelId])

  const hasConfiguredProviders = useMemo(
    () =>
      providerItems.some(
        (item) => (item.category ?? 'general') === 'provider',
      ),
    [providerItems],
  )
  const isUnconfigured = !authLoggedIn && !hasConfiguredProviders
  const showCloudLogin = isCloudSource && !authLoggedIn

  const toggleChatModel = useCallback(
    (modelId: string) => {
      const trimmed = modelId.trim()
      if (!trimmed) return
      void setBasic({ chatModelId: trimmed })
    },
    [setBasic],
  )

  const setCloudSource = useCallback(
    (next: string) => {
      const normalized = next === 'cloud' ? 'cloud' : 'local'
      void setBasic({ chatSource: normalized })
    },
    [setBasic],
  )

  /** Refresh provider settings when panel opens. */
  const refreshOnOpen = useCallback(() => {
    void refresh()
    if (isCloudSource) {
      void refreshSession()
    }
  }, [isCloudSource, refresh, refreshSession])

  /** Sync cloud models when panel opens (compare updated-at). */
  const syncCloudModelsOnOpen = useCallback(() => {
    if (!isCloudSource) return
    let canceled = false
    const sync = async () => {
      const updatedAt = await fetchCloudModelsUpdatedAt().catch(() => null)
      if (canceled) return
      if (!updatedAt) {
        if (!cloudModelsLoaded) await refreshCloudModels()
        return
      }
      const chatChanged = updatedAt.chatUpdatedAt !== cloudModelsUpdatedAt
      if (!cloudModelsLoaded || chatChanged) {
        await refreshCloudModels({
          force: cloudModelsLoaded && chatChanged,
        })
      }
    }
    void sync()
    return () => {
      canceled = true
    }
  }, [
    cloudModelsLoaded,
    cloudModelsUpdatedAt,
    isCloudSource,
    refreshCloudModels,
  ])

  const openProviderSettings = useCallback(() => {
    pushStackItem(
      {
        id: 'provider-management',
        sourceKey: 'provider-management',
        component: 'provider-management',
        title: t('input.manageModels'),
      },
      100,
    )
  }, [pushStackItem, t])

  // 逻辑：偏好列表中是否包含推理模型
  const hasPreferredReasoningModel = useMemo(
    () =>
      chatModels.some(
        (m) =>
          preferredChatIds.includes(m.id) && m.tags?.includes('reasoning'),
      ),
    [chatModels, preferredChatIds],
  )

  return {
    // 数据
    chatModels,
    isCloudSource,
    preferredChatIds,
    authLoggedIn,
    isUnconfigured,
    showCloudLogin,
    hasPreferredReasoningModel,
    // 操作
    toggleChatModel,
    setCloudSource,
    refreshOnOpen,
    syncCloudModelsOnOpen,
    openProviderSettings,
  }
}
