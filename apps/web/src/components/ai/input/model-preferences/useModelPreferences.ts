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
  buildCliModelOptions,
  normalizeChatModelSource,
} from '@/lib/provider-models'
import { useMainAgentModel } from '../../hooks/use-main-agent-model'
import { useOptionalChatSession } from '../../context'
import {
  buildSinglePreferredIds,
  normalizeSinglePreferredIds,
} from './model-selection-utils'

function normalizeIds(value?: string[] | null): string[] {
  if (!Array.isArray(value)) return []
  const normalized = value
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  return Array.from(new Set(normalized))
}

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
  const chatSession = useOptionalChatSession()
  const projectId = chatSession?.projectId
  const pushStackItem = useLayoutState((s) => s.pushStackItem)
  const {
    modelIds: masterModelIds,
    detail: masterDetail,
    setModelIds,
    setCodeModelIds,
  } = useMainAgentModel(projectId)

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
  const codeModels = useMemo(
    () => buildCliModelOptions(installedCliProviderIds),
    [installedCliProviderIds],
  )

  // 混合模式：优先使用 React Query 缓存（跨挂载持久化），
  // 当缓存不可用时（如 master agent 尚未创建）使用本地 override 提供即时视觉反馈。
  const cachedChatIds = useMemo(
    () => normalizeIds(masterModelIds),
    [masterModelIds],
  )
  const cachedCodeIds = useMemo(
    () => normalizeIds(masterDetail?.codeModelIds),
    [masterDetail?.codeModelIds],
  )

  // 本地 override：仅在 master agent 不存在时提供即时反馈。
  // 按 cloud/local 分开存储，避免切换源时旧 ID 污染新源。
  const [overrideCloudChatIds, setOverrideCloudChatIds] = useState<string[] | null>(null)
  const [overrideLocalChatIds, setOverrideLocalChatIds] = useState<string[] | null>(null)
  const overrideChatIds = isCloudSource ? overrideCloudChatIds : overrideLocalChatIds
  const setOverrideChatIds = isCloudSource ? setOverrideCloudChatIds : setOverrideLocalChatIds
  const [overrideCodeIds, setOverrideCodeIds] = useState<string[] | null>(null)
  const prefersCachedModels = Boolean(masterDetail)
  const resolvedChatIds = prefersCachedModels
    ? cachedChatIds
    : overrideChatIds ?? cachedChatIds
  const resolvedCodeIds = prefersCachedModels
    ? cachedCodeIds
    : overrideCodeIds ?? cachedCodeIds
  const preferredChatIds = normalizeSinglePreferredIds(resolvedChatIds)
  const preferredCodeIds = normalizeSinglePreferredIds(resolvedCodeIds)

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
      const nextIds = buildSinglePreferredIds(resolvedChatIds, modelId)
      if (!masterDetail) setOverrideChatIds(nextIds)
      setModelIds(nextIds)
    },
    [masterDetail, resolvedChatIds, setModelIds],
  )

  const toggleCodeModel = useCallback(
    (modelId: string) => {
      const nextIds = buildSinglePreferredIds(resolvedCodeIds, modelId)
      if (!masterDetail) setOverrideCodeIds(nextIds)
      setCodeModelIds(nextIds)
    },
    [masterDetail, resolvedCodeIds, setCodeModelIds],
  )

  const selectCodeModel = useCallback(
    (modelId: string) => {
      const normalized = modelId.trim()
      if (!normalized) return
      if (!masterDetail) setOverrideCodeIds([normalized])
      setCodeModelIds([normalized])
    },
    [masterDetail, setCodeModelIds],
  )

  // 陈旧 id 自愈已迁移到 useChatModelSelection —— 主路径始终挂载，即使 picker
  // 从未打开也能回写 master agent。这里不再重复一份 effect，避免两处写入互相踩踏。

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
    codeModels,
    isCloudSource,
    preferredChatIds,
    preferredCodeIds,
    authLoggedIn,
    isUnconfigured,
    showCloudLogin,
    hasPreferredReasoningModel,
    // 操作
    toggleChatModel,
    toggleCodeModel,
    selectCodeModel,
    setCloudSource,
    refreshOnOpen,
    syncCloudModelsOnOpen,
    openProviderSettings,
  }
}
