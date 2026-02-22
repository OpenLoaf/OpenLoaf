'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSettingsValues } from '@/hooks/use-settings'
import { useBasicConfig } from '@/hooks/use-basic-config'
import {
  fetchCloudModelsUpdatedAt,
  useCloudModels,
} from '@/hooks/use-cloud-models'
import { useMediaModels } from '@/hooks/use-media-models'
import { useInstalledCliProviderIds } from '@/hooks/use-cli-tools-installed'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { useTabs } from '@/hooks/use-tabs'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import {
  buildChatModelOptions,
  normalizeChatModelSource,
} from '@/lib/provider-models'
import { useMainAgentModel } from '../../hooks/use-main-agent-model'
import { useOptionalChatSession } from '../../context'

export function useModelPreferences() {
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
  const activeTabId = useTabs((s) => s.activeTabId)
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)
  const {
    modelIds: masterModelIds,
    detail: masterDetail,
    setModelIds,
    setImageModelIds,
    setVideoModelIds,
  } = useMainAgentModel()

  const tabId = chatSession?.tabId ?? activeTabId
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
  const normalizeIds = useCallback((value?: string[] | null) => {
    if (!Array.isArray(value)) return []
    const normalized = value
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    return Array.from(new Set(normalized))
  }, [])

  const [preferredChatIds, setPreferredChatIds] = useState<string[]>(() =>
    normalizeIds(masterModelIds),
  )
  const [preferredImageIds, setPreferredImageIds] = useState<string[]>(() =>
    normalizeIds(masterDetail?.imageModelIds),
  )
  const [preferredVideoIds, setPreferredVideoIds] = useState<string[]>(() =>
    normalizeIds(masterDetail?.videoModelIds),
  )

  useEffect(() => {
    setPreferredChatIds(normalizeIds(masterModelIds))
  }, [masterModelIds, normalizeIds])

  useEffect(() => {
    setPreferredImageIds(normalizeIds(masterDetail?.imageModelIds))
  }, [masterDetail?.imageModelIds, normalizeIds])

  useEffect(() => {
    setPreferredVideoIds(normalizeIds(masterDetail?.videoModelIds))
  }, [masterDetail?.videoModelIds, normalizeIds])

  const isAuto = preferredChatIds.length === 0
  const isImageAuto = preferredImageIds.length === 0
  const isVideoAuto = preferredVideoIds.length === 0

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
      const normalized = modelId.trim()
      if (!normalized) return
      const nextIds = preferredChatIds.includes(normalized)
        ? preferredChatIds.filter((id) => id !== normalized)
        : [...preferredChatIds, normalized]
      setPreferredChatIds(nextIds)
      setModelIds(nextIds)
    },
    [preferredChatIds, setModelIds],
  )

  const toggleImageModel = useCallback(
    (modelId: string) => {
      const normalized = modelId.trim()
      if (!normalized) return
      const nextIds = preferredImageIds.includes(normalized)
        ? preferredImageIds.filter((id) => id !== normalized)
        : [...preferredImageIds, normalized]
      setPreferredImageIds(nextIds)
      setImageModelIds(nextIds)
    },
    [preferredImageIds, setImageModelIds],
  )

  const toggleVideoModel = useCallback(
    (modelId: string) => {
      const normalized = modelId.trim()
      if (!normalized) return
      const nextIds = preferredVideoIds.includes(normalized)
        ? preferredVideoIds.filter((id) => id !== normalized)
        : [...preferredVideoIds, normalized]
      setPreferredVideoIds(nextIds)
      setVideoModelIds(nextIds)
    },
    [preferredVideoIds, setVideoModelIds],
  )

  const setIsAuto = useCallback(
    (auto: boolean) => {
      if (auto) {
        if (preferredChatIds.length === 0) return
        setPreferredChatIds([])
        setModelIds([])
        return
      }
      if (preferredChatIds.length > 0) return
      const fallback = chatModels[0]?.id
      if (fallback) {
        setPreferredChatIds([fallback])
        setModelIds([fallback])
      }
    },
    [chatModels, preferredChatIds, setModelIds],
  )

  const setImageAuto = useCallback(
    (auto: boolean) => {
      if (auto) {
        if (preferredImageIds.length === 0) return
        setPreferredImageIds([])
        setImageModelIds([])
        return
      }
      if (preferredImageIds.length > 0) return
      const fallback = imageModels[0]?.id
      if (fallback) {
        setPreferredImageIds([fallback])
        setImageModelIds([fallback])
      }
    },
    [imageModels, preferredImageIds, setImageModelIds],
  )

  const setVideoAuto = useCallback(
    (auto: boolean) => {
      if (auto) {
        if (preferredVideoIds.length === 0) return
        setPreferredVideoIds([])
        setVideoModelIds([])
        return
      }
      if (preferredVideoIds.length > 0) return
      const fallback = videoModels[0]?.id
      if (fallback) {
        setPreferredVideoIds([fallback])
        setVideoModelIds([fallback])
      }
    },
    [preferredVideoIds, setVideoModelIds, videoModels],
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
    if (!tabId) return
    pushStackItem(
      tabId,
      {
        id: 'provider-management',
        sourceKey: 'provider-management',
        component: 'provider-management',
        title: '管理模型',
      },
      100,
    )
  }, [pushStackItem, tabId])

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
    isCloudSource,
    isAuto,
    isImageAuto,
    isVideoAuto,
    preferredChatIds,
    preferredImageIds,
    preferredVideoIds,
    authLoggedIn,
    isUnconfigured,
    showCloudLogin,
    hasPreferredReasoningModel,
    // 操作
    toggleChatModel,
    toggleImageModel,
    toggleVideoModel,
    setIsAuto,
    setImageAuto,
    setVideoAuto,
    setCloudSource,
    refreshOnOpen,
    syncCloudModelsOnOpen,
    openProviderSettings,
  }
}
