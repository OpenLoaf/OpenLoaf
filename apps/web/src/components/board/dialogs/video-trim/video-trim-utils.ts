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

function buildHlsUrl(
  endpoint: string,
  path: string,
  ids: { projectId?: string; boardId?: string },
  extra?: Record<string, string>,
) {
  const baseUrl = resolveServerUrl()
  const query = new URLSearchParams({ path, ...extra })
  if (ids.projectId) query.set('projectId', ids.projectId)
  if (ids.boardId) query.set('boardId', ids.boardId)
  const prefix = baseUrl ? `${baseUrl}${endpoint}` : endpoint
  return `${prefix}?${query.toString()}`
}

export function buildHlsManifestUrl(
  path: string,
  ids: { projectId?: string; boardId?: string },
) {
  return buildHlsUrl('/media/hls/manifest', path, ids)
}

export function buildHlsQualityUrl(
  path: string,
  quality: string,
  ids: { projectId?: string; boardId?: string },
) {
  return buildHlsUrl('/media/hls/manifest', path, ids, { quality })
}

export function buildHlsThumbnailsUrl(
  path: string,
  ids: { projectId?: string; boardId?: string },
) {
  return buildHlsUrl('/media/hls/thumbnails', path, ids)
}
