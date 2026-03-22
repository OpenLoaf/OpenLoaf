/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useMemo } from 'react'
import type { BoardFileContext } from '../../board-contracts'
import type { UpstreamData } from '../../engine/upstream-data'
import type { VersionStackEntry } from '../../engine/types'
import { resolveMediaSource } from './resolveMediaSource'

/**
 * Unified upstream data returned by useEffectiveUpstream.
 *
 * When a version entry is "ready" and has frozen upstreamRefs, those are used.
 * Otherwise, live upstream data is returned.
 */
export interface EffectiveUpstream {
  text?: string
  /** Browser-friendly resolved URLs for upstream images. */
  images?: string[]
  /** Raw board-relative paths for upstream images (as-stored). */
  imagePaths?: string[]
  audioUrl?: string
  videoUrl?: string
}

/**
 * Compute effective upstream data for a media node.
 *
 * Logic:
 * - If primaryEntry.status === 'ready' and upstreamRefs is non-empty:
 *   use the frozen snapshot refs (so version-switching keeps inputs stable).
 * - Otherwise: use live upstream data resolved from the connected graph.
 *
 * Image paths are resolved to browser-accessible URLs via resolveMediaSource.
 */
export function useEffectiveUpstream(
  primaryEntry: VersionStackEntry | undefined,
  upstream: UpstreamData | undefined | null,
  fileContext: BoardFileContext | undefined,
): EffectiveUpstream {
  return useMemo<EffectiveUpstream>(() => {
    const resolveImages = (srcs: string[] | undefined): string[] | undefined => {
      if (!srcs || srcs.length === 0) return undefined
      const resolved = srcs
        .map(src => resolveMediaSource(src, fileContext))
        .filter(Boolean) as string[]
      return resolved.length > 0 ? resolved : undefined
    }

    const refs = primaryEntry?.input?.upstreamRefs
    if (primaryEntry?.status === 'ready' && refs && refs.length > 0) {
      const text =
        refs
          .filter(r => r.nodeType === 'text')
          .map(r => r.data)
          .join('\n') || undefined
      const rawPaths = refs
        .filter(r => r.nodeType === 'image')
        .map(r => r.data)
        .filter(Boolean)
      const images = resolveImages(rawPaths)
      const imagePaths = rawPaths.length > 0 ? rawPaths : undefined
      const audioUrl = refs.find(r => r.nodeType === 'audio')?.data
      const videoUrl = refs.find(r => r.nodeType === 'video')?.data
      return { text, images, imagePaths, audioUrl, videoUrl }
    }

    // Live upstream data
    const text = upstream?.textList.join('\n') || undefined
    const rawPaths = upstream?.imageList?.filter(Boolean) ?? []
    const images = resolveImages(rawPaths)
    const imagePaths = rawPaths.length > 0 ? rawPaths : undefined
    const audioUrl = upstream?.audioList?.[0]
    const videoUrl = upstream?.videoList?.[0]
    return { text, images, imagePaths, audioUrl, videoUrl }
  }, [primaryEntry, upstream, fileContext])
}
