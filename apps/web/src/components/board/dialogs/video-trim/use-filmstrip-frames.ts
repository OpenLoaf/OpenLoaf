/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { useEffect, useState } from 'react'
import { buildFrameUrl } from './video-trim-utils'

const FRAME_COUNT = 12

/**
 * Fetch filmstrip frames from the backend via ffmpeg frame extraction.
 * Returns an array of image URLs (one per time slice).
 */
export function useFilmstripFrames(
  videoPath: string,
  ids: { projectId?: string; boardId?: string },
  duration: number,
): string[] {
  const [frames, setFrames] = useState<string[]>([])

  useEffect(() => {
    if (!videoPath || duration <= 0) {
      setFrames([])
      return
    }

    let cancelled = false
    const urls: string[] = []

    // Compute time points spread evenly across the video
    const step = duration / FRAME_COUNT
    for (let i = 0; i < FRAME_COUNT; i++) {
      const time = Math.min(step * i + step * 0.5, duration - 0.1)
      urls.push(buildFrameUrl(videoPath, ids, time))
    }

    // Set URLs directly — browser handles loading via <img src>
    if (!cancelled) setFrames(urls)

    return () => {
      cancelled = true
    }
  }, [videoPath, ids.projectId, ids.boardId, duration])

  return frames
}
