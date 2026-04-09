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

import { useEffect } from 'react'
import { create } from 'zustand'
import type { V3CapabilitiesData, CapabilitiesCategory } from '@/lib/saas-media'
import { fetchCapabilities } from '@/lib/saas-media'

type CapabilitiesState = {
  /** Cached capabilities per category. */
  image: V3CapabilitiesData | null
  video: V3CapabilitiesData | null
  audio: V3CapabilitiesData | null
  text: V3CapabilitiesData | null
  /** Loading flag per category. */
  loadingImage: boolean
  loadingVideo: boolean
  loadingAudio: boolean
  loadingText: boolean
  /** Error message per category. */
  errorImage: string | null
  errorVideo: string | null
  errorAudio: string | null
  errorText: string | null
  /** Load once if not already loaded. */
  load: (category: CapabilitiesCategory) => Promise<void>
  /** Force reload capabilities for a category. */
  refresh: (category: CapabilitiesCategory) => Promise<void>
}

function loadingKey(category: CapabilitiesCategory) {
  return `loading${category[0].toUpperCase()}${category.slice(1)}` as
    | 'loadingImage'
    | 'loadingVideo'
    | 'loadingAudio'
    | 'loadingText'
}

function errorKey(category: CapabilitiesCategory) {
  return `error${category[0].toUpperCase()}${category.slice(1)}` as
    | 'errorImage'
    | 'errorVideo'
    | 'errorAudio'
    | 'errorText'
}

const useCapabilitiesStore = create<CapabilitiesState>((set, get) => ({
  image: null,
  video: null,
  audio: null,
  text: null,
  loadingImage: false,
  loadingVideo: false,
  loadingAudio: false,
  loadingText: false,
  errorImage: null,
  errorVideo: null,
  errorAudio: null,
  errorText: null,

  load: async (category) => {
    const lk = loadingKey(category)
    if (get()[lk] || get()[category]) return
    await get().refresh(category)
  },

  refresh: async (category) => {
    const lk = loadingKey(category)
    const ek = errorKey(category)
    if (get()[lk]) return
    set({ [lk]: true, [ek]: null } as any)
    try {
      const data = await fetchCapabilities(category)
      set({ [category]: data, [lk]: false } as any)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load capabilities'
      set({ [ek]: message, [lk]: false } as any)
    }
  },
}))

/** 确保所有 3 个媒体 category 的 capabilities 都已加载（首次）。text 按需加载。 */
export function ensureAllCapabilitiesLoaded(): void {
  const { load } = useCapabilitiesStore.getState()
  void load('image')
  void load('video')
  void load('audio')
}

/** 强制刷新所有 capabilities（重试时使用）。 */
export function refreshAllCapabilities(): void {
  const { refresh } = useCapabilitiesStore.getState()
  void refresh('image')
  void refresh('video')
  void refresh('audio')
}

/** 获取所有已缓存的 capabilities 数据（非 hook，可在任意上下文使用）。 */
export function getAllCachedCapabilities(): V3CapabilitiesData[] {
  const state = useCapabilitiesStore.getState()
  return [state.image, state.video, state.audio].filter(Boolean) as V3CapabilitiesData[]
}

/** React hook：读取所有 capabilities + loading/error 状态。 */
export function useAllCapabilities() {
  const image = useCapabilitiesStore((s) => s.image)
  const video = useCapabilitiesStore((s) => s.video)
  const audio = useCapabilitiesStore((s) => s.audio)
  const loadingImage = useCapabilitiesStore((s) => s.loadingImage)
  const loadingVideo = useCapabilitiesStore((s) => s.loadingVideo)
  const loadingAudio = useCapabilitiesStore((s) => s.loadingAudio)
  const errorImage = useCapabilitiesStore((s) => s.errorImage)
  const errorVideo = useCapabilitiesStore((s) => s.errorVideo)
  const errorAudio = useCapabilitiesStore((s) => s.errorAudio)

  const data = [image, video, audio].filter(Boolean) as V3CapabilitiesData[]
  const loading = loadingImage || loadingVideo || loadingAudio
  const error = errorImage ?? errorVideo ?? errorAudio

  return { data, loading, error }
}

/** React hook for v3 capabilities (supports all categories including text). */
export function useCapabilities(category: CapabilitiesCategory) {
  const data = useCapabilitiesStore((state) => state[category])
  const loading = useCapabilitiesStore((state) => state[loadingKey(category)])
  const error = useCapabilitiesStore((state) => state[errorKey(category)])
  const load = useCapabilitiesStore((state) => state.load)
  const refreshFn = useCapabilitiesStore((state) => state.refresh)

  useEffect(() => {
    if (data) return
    void load(category)
  }, [data, category, load])

  return {
    data,
    loading,
    error,
    refresh: () => refreshFn(category),
  }
}
