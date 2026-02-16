'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  areStoredSelectionsEqual,
  CHAT_MODEL_SELECTION_EVENT,
  CHAT_MODEL_SELECTION_TAB_PARAMS_KEY,
  MODEL_SELECTION_STORAGE_KEY,
  type ModelSourceKey,
  type StoredModelSelections,
  type MediaModelSelection,
  normalizeStoredSelections,
  readStoredSelections,
  writeStoredSelections,
  notifyChatModelSelectionChange,
  createDefaultMediaModelSelection,
} from '../chat-model-selection-storage'
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
  const setTabChatParams = useTabs((s) => s.setTabChatParams)
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)

  const tabStoredSelectionsRaw = useTabs((state) => {
    const targetTabId = chatSession?.tabId ?? state.activeTabId
    if (!targetTabId) return undefined
    const tab = state.tabs.find((item) => item.id === targetTabId)
    return (tab?.chatParams as Record<string, unknown> | undefined)?.[
      CHAT_MODEL_SELECTION_TAB_PARAMS_KEY
    ]
  })
  const tabStoredSelections = useMemo(
    () => normalizeStoredSelections(tabStoredSelectionsRaw),
    [tabStoredSelectionsRaw],
  )

  const tabId = chatSession?.tabId ?? activeTabId
  const modelSelectionMemoryScope: 'tab' | 'global' =
    basic.chatOnlineSearchMemoryScope === 'global' ? 'global' : 'tab'
  const chatModelSource = normalizeChatModelSource(basic.chatSource)
  const isCloudSource = chatModelSource === 'cloud'
  const sourceKey: ModelSourceKey = isCloudSource ? 'cloud' : 'local'

  const [globalStoredSelections, setGlobalStoredSelections] =
    useState<StoredModelSelections>(() => readStoredSelections())
  const modelSelectionScopeRef = useRef<'tab' | 'global'>(
    modelSelectionMemoryScope,
  )
  const storedSelections =
    modelSelectionMemoryScope === 'tab' && tabId
      ? tabStoredSelections
      : globalStoredSelections

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

  const currentSelection = storedSelections[sourceKey] ?? {
    lastModelId: '',
    isAuto: true,
  }
  const isAuto = currentSelection.isAuto

  // 逻辑：偏好列表 fallback 到 lastModelId（向后兼容）
  const preferredChatIds = useMemo(
    () =>
      currentSelection.preferredModelIds ??
      (currentSelection.lastModelId
        ? [currentSelection.lastModelId]
        : []),
    [currentSelection.preferredModelIds, currentSelection.lastModelId],
  )

  const mediaSelection =
    storedSelections.media ?? createDefaultMediaModelSelection()
  const preferredImageIds = useMemo(
    () =>
      mediaSelection.preferredImageModelIds ??
      (mediaSelection.imageModelId ? [mediaSelection.imageModelId] : []),
    [mediaSelection.preferredImageModelIds, mediaSelection.imageModelId],
  )
  const preferredVideoIds = useMemo(
    () =>
      mediaSelection.preferredVideoModelIds ??
      (mediaSelection.videoModelId ? [mediaSelection.videoModelId] : []),
    [mediaSelection.preferredVideoModelIds, mediaSelection.videoModelId],
  )

  const hasConfiguredProviders = useMemo(
    () =>
      providerItems.some(
        (item) => (item.category ?? 'general') === 'provider',
      ),
    [providerItems],
  )
  const isUnconfigured = !authLoggedIn && !hasConfiguredProviders
  const showCloudLogin = isCloudSource && !authLoggedIn

  // ── 写入 helpers ──

  const writeSelections = useCallback(
    (updated: StoredModelSelections) => {
      if (modelSelectionMemoryScope === 'tab' && tabId) {
        if (areStoredSelectionsEqual(tabStoredSelections, updated)) return
        setTabChatParams(tabId, {
          [CHAT_MODEL_SELECTION_TAB_PARAMS_KEY]: updated,
        })
        notifyChatModelSelectionChange()
        return
      }
      setGlobalStoredSelections((prev) => {
        if (areStoredSelectionsEqual(prev, updated)) return prev
        writeStoredSelections(updated)
        notifyChatModelSelectionChange()
        return updated
      })
    },
    [
      modelSelectionMemoryScope,
      setTabChatParams,
      tabId,
      tabStoredSelections,
    ],
  )

  const currentSelections = useMemo(
    () =>
      modelSelectionMemoryScope === 'tab' && tabId
        ? tabStoredSelections
        : globalStoredSelections,
    [
      globalStoredSelections,
      modelSelectionMemoryScope,
      tabId,
      tabStoredSelections,
    ],
  )

  const toggleChatModel = useCallback(
    (modelId: string) => {
      const prev = currentSelections[sourceKey]?.preferredModelIds
      const current = prev ?? preferredChatIds
      const next = current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId]
      writeSelections({
        ...currentSelections,
        [sourceKey]: {
          ...currentSelections[sourceKey],
          preferredModelIds: next,
        },
      })
    },
    [currentSelections, preferredChatIds, sourceKey, writeSelections],
  )

  const toggleImageModel = useCallback(
    (modelId: string) => {
      const prev =
        currentSelections.media?.preferredImageModelIds ?? preferredImageIds
      const next = prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId]
      writeSelections({
        ...currentSelections,
        media: {
          ...(currentSelections.media ?? createDefaultMediaModelSelection()),
          preferredImageModelIds: next,
        },
      })
    },
    [currentSelections, preferredImageIds, writeSelections],
  )

  const toggleVideoModel = useCallback(
    (modelId: string) => {
      const prev =
        currentSelections.media?.preferredVideoModelIds ?? preferredVideoIds
      const next = prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId]
      writeSelections({
        ...currentSelections,
        media: {
          ...(currentSelections.media ?? createDefaultMediaModelSelection()),
          preferredVideoModelIds: next,
        },
      })
    },
    [currentSelections, preferredVideoIds, writeSelections],
  )

  const setIsAuto = useCallback(
    (auto: boolean) => {
      writeSelections({
        ...currentSelections,
        [sourceKey]: {
          ...currentSelections[sourceKey],
          isAuto: auto,
        },
      })
    },
    [currentSelections, sourceKey, writeSelections],
  )

  const setCloudSource = useCallback(
    (next: string) => {
      const normalized = next === 'cloud' ? 'cloud' : 'local'
      void setBasic({ chatSource: normalized })
    },
    [setBasic],
  )

  // ── 副作用：同步 storage 事件 ──

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== MODEL_SELECTION_STORAGE_KEY) return
      setGlobalStoredSelections(readStoredSelections())
    }
    const handleSelection = () => {
      setGlobalStoredSelections(readStoredSelections())
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener(CHAT_MODEL_SELECTION_EVENT, handleSelection)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(CHAT_MODEL_SELECTION_EVENT, handleSelection)
    }
  }, [])

  // 逻辑：scope 切换时同步 tab ↔ global
  useEffect(() => {
    if (modelSelectionScopeRef.current === modelSelectionMemoryScope) return
    if (modelSelectionMemoryScope === 'global') {
      const nextSelections = tabId
        ? tabStoredSelections
        : globalStoredSelections
      if (!areStoredSelectionsEqual(globalStoredSelections, nextSelections)) {
        writeStoredSelections(nextSelections)
        setGlobalStoredSelections(nextSelections)
        notifyChatModelSelectionChange()
      }
    } else if (
      tabId &&
      !areStoredSelectionsEqual(tabStoredSelections, globalStoredSelections)
    ) {
      setTabChatParams(tabId, {
        [CHAT_MODEL_SELECTION_TAB_PARAMS_KEY]: globalStoredSelections,
      })
    }
    modelSelectionScopeRef.current = modelSelectionMemoryScope
  }, [
    globalStoredSelections,
    modelSelectionMemoryScope,
    setTabChatParams,
    tabId,
    tabStoredSelections,
  ])

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
    setCloudSource,
    refreshOnOpen,
    syncCloudModelsOnOpen,
    openProviderSettings,
  }
}
