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
import type { V3CapabilitiesData } from '@/lib/saas-media'
import { fetchCapabilities } from '@/lib/saas-media'

type MediaCategory = 'image' | 'video' | 'audio'

type CapabilitiesState = {
  /** Cached capabilities per category. */
  image: V3CapabilitiesData | null
  video: V3CapabilitiesData | null
  audio: V3CapabilitiesData | null
  /** Loading flag per category. */
  loadingImage: boolean
  loadingVideo: boolean
  loadingAudio: boolean
  /** Error message per category. */
  errorImage: string | null
  errorVideo: string | null
  errorAudio: string | null
  /** Load once if not already loaded. */
  load: (category: MediaCategory) => Promise<void>
  /** Force reload capabilities for a category. */
  refresh: (category: MediaCategory) => Promise<void>
}

function loadingKey(category: MediaCategory) {
  return `loading${category[0].toUpperCase()}${category.slice(1)}` as
    | 'loadingImage'
    | 'loadingVideo'
    | 'loadingAudio'
}

function errorKey(category: MediaCategory) {
  return `error${category[0].toUpperCase()}${category.slice(1)}` as
    | 'errorImage'
    | 'errorVideo'
    | 'errorAudio'
}

const useCapabilitiesStore = create<CapabilitiesState>((set, get) => ({
  image: null,
  video: null,
  audio: null,
  loadingImage: false,
  loadingVideo: false,
  loadingAudio: false,
  errorImage: null,
  errorVideo: null,
  errorAudio: null,

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

/** React hook for v3 media capabilities. */
export function useCapabilities(category: MediaCategory) {
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
