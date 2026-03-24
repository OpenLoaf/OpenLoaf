/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { resolveServerUrl } from '@/utils/server-url'

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

/** Format seconds into m:ss */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Format seconds into m:ss.s (single decimal). */
export function formatTimePrecise(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

/** Build a direct stream URL for video playback. */
export function buildStreamUrl(
  sourcePath: string,
  ids: { projectId?: string; boardId?: string },
) {
  const baseUrl = resolveServerUrl()
  const prefix = baseUrl ? `${baseUrl}/media/stream` : '/media/stream'
  if (ids.boardId) {
    const query = new URLSearchParams({ boardId: ids.boardId, file: sourcePath })
    if (ids.projectId) query.set('projectId', ids.projectId)
    return `${prefix}?${query.toString()}`
  }
  const query = new URLSearchParams({ path: sourcePath })
  if (ids.projectId) query.set('projectId', ids.projectId)
  return `${prefix}?${query.toString()}`
}

/** Build a URL to extract a single JPEG frame at the given time. */
export function buildFrameUrl(
  sourcePath: string,
  ids: { projectId?: string; boardId?: string },
  time: number,
  width = 160,
) {
  const baseUrl = resolveServerUrl()
  const prefix = baseUrl ? `${baseUrl}/media/video-frame` : '/media/video-frame'
  const query = new URLSearchParams({ time: String(time), width: String(width) })
  if (ids.boardId) {
    query.set('boardId', ids.boardId)
    query.set('file', sourcePath)
  } else {
    query.set('path', sourcePath)
  }
  if (ids.projectId) query.set('projectId', ids.projectId)
  return `${prefix}?${query.toString()}`
}
