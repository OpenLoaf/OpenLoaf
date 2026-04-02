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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsValues } from '@/hooks/use-settings'
import { useBasicConfig } from '@/hooks/use-basic-config'
import {
  fetchCloudModelsUpdatedAt,
  useCloudModels,
} from '@/hooks/use-cloud-models'
import { useMediaModels } from '@/hooks/use-media-models'
import { useInstalledCliProviderIds } from '@/hooks/use-cli-tools-installed'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { useAppView } from '@/hooks/use-app-view'
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
  const {
    imageModels,
    videoModels,
    imageUpdatedAt,
    videoUpdatedAt,
    loaded: mediaModelsLoaded,
    refresh: refreshMediaModels,
  } = useMediaModels()
  const installedCliProviderIds = useInstalledCliProviderIds()
  const { basic, setBasic } = useBasicConfig()
  const { loggedIn: authLoggedIn, refreshSession } = useSaasAuth()
  const chatSession = useOptionalChatSession()
  const projectId = chatSession?.projectId
  const chatSessionId = useAppView((s) => s.chatSessionId)
  const pushStackItem = useLayoutState((s) => s.pushStackItem)
  const {
    modelIds: masterModelIds,
    detail: masterDetail,
    setModelIds,
    setImageModelIds,
    setVideoModelIds,
    setCodeModelIds,
  } = useMainAgentModel(projectId)

  const tabId = chatSession?.tabId ?? chatSessionId
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
  const cachedImageIds = useMemo(
    () => normalizeIds(masterDetail?.imageModelIds),
    [masterDetail?.imageModelIds],
  )
  const cachedVideoIds = useMemo(
    () => normalizeIds(masterDetail?.videoModelIds),
    [masterDetail?.videoModelIds],
  )
  const cachedCodeIds = useMemo(
    () => normalizeIds(masterDetail?.codeModelIds),
    [masterDetail?.codeModelIds],
  )

  // 本地 override：仅在 master agent 不存在时提供即时反馈。
  // 当缓存数据到达后自动清除。
  const [overrideChatIds, setOverrideChatIds] = useState<string[] | null>(null)
  const [overrideImageIds, setOverrideImageIds] = useState<string[] | null>(null)
  const [overrideVideoIds, setOverrideVideoIds] = useState<string[] | null>(null)
  const [overrideCodeIds, setOverrideCodeIds] = useState<string[] | null>(null)
  const prefersCachedModels = Boolean(masterDetail)
  const resolvedChatIds = prefersCachedModels
    ? cachedChatIds
    : overrideChatIds ?? cachedChatIds
  const resolvedImageIds = prefersCachedModels
    ? cachedImageIds
    : overrideImageIds ?? cachedImageIds
  const resolvedVideoIds = prefersCachedModels
    ? cachedVideoIds
    : overrideVideoIds ?? cachedVideoIds
  const resolvedCodeIds = prefersCachedModels
    ? cachedCodeIds
    : overrideCodeIds ?? cachedCodeIds
  const preferredChatIds = normalizeSinglePreferredIds(resolvedChatIds)
  const preferredImageIds = normalizeSinglePreferredIds(resolvedImageIds)
  const preferredVideoIds = normalizeSinglePreferredIds(resolvedVideoIds)
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

  const toggleImageModel = useCallback(
    (modelId: string) => {
      const nextIds = buildSinglePreferredIds(resolvedImageIds, modelId)
      if (!masterDetail) setOverrideImageIds(nextIds)
      setImageModelIds(nextIds)
    },
    [masterDetail, resolvedImageIds, setImageModelIds],
  )

  const toggleVideoModel = useCallback(
    (modelId: string) => {
      const nextIds = buildSinglePreferredIds(resolvedVideoIds, modelId)
      if (!masterDetail) setOverrideVideoIds(nextIds)
      setVideoModelIds(nextIds)
    },
    [masterDetail, resolvedVideoIds, setVideoModelIds],
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

  // 空选或选中模型不在当前列表中时，自动选第一个（删除了 auto 模式）。
  const chatModelIds = useMemo(
    () => new Set(chatModels.map((m) => m.id)),
    [chatModels],
  )
  useEffect(() => {
    if (chatModels.length === 0) return
    const hasValidSelection = preferredChatIds.some((id) =>
      chatModelIds.has(id),
    )
    if (!hasValidSelection) {
      const fallback = chatModels[0].id
      if (!masterDetail) setOverrideChatIds([fallback])
      setModelIds([fallback])
    }
  }, [chatModelIds, chatModels, masterDetail, preferredChatIds, setModelIds])

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
        if (!mediaModelsLoaded) await refreshMediaModels()
        return
      }
      const tasks: Array<Promise<void>> = []
      const chatChanged = updatedAt.chatUpdatedAt !== cloudModelsUpdatedAt
      if (!cloudModelsLoaded || chatChanged) {
        tasks.push(
          refreshCloudModels({
            force: cloudModelsLoaded && chatChanged,
          }),
        )
      }
      const mediaKinds: Array<'image' | 'video'> = []
      let mediaChanged = false
      const imageChanged = updatedAt.imageUpdatedAt !== imageUpdatedAt
      if (!mediaModelsLoaded || imageChanged) {
        mediaKinds.push('image')
        mediaChanged = mediaChanged || imageChanged
      }
      const videoChanged = updatedAt.videoUpdatedAt !== videoUpdatedAt
      if (!mediaModelsLoaded || videoChanged) {
        mediaKinds.push('video')
        mediaChanged = mediaChanged || videoChanged
      }
      if (mediaKinds.length > 0) {
        tasks.push(
          refreshMediaModels({
            kinds: mediaKinds,
            force: mediaModelsLoaded && mediaChanged,
          }),
        )
      }
      if (tasks.length > 0) await Promise.all(tasks)
    }
    void sync()
    return () => {
      canceled = true
    }
  }, [
    cloudModelsLoaded,
    cloudModelsUpdatedAt,
    imageUpdatedAt,
    isCloudSource,
    mediaModelsLoaded,
    refreshCloudModels,
    refreshMediaModels,
    videoUpdatedAt,
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
    imageModels,
    videoModels,
    codeModels,
    isCloudSource,
    preferredChatIds,
    preferredImageIds,
    preferredVideoIds,
    preferredCodeIds,
    authLoggedIn,
    isUnconfigured,
    showCloudLogin,
    hasPreferredReasoningModel,
    // 操作
    toggleChatModel,
    toggleImageModel,
    toggleVideoModel,
    toggleCodeModel,
    selectCodeModel,
    setCloudSource,
    refreshOnOpen,
    syncCloudModelsOnOpen,
    openProviderSettings,
  }
}
