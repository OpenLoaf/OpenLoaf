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
import { buildAuthHeaders } from '@/lib/saas-media'

export type MediaUploadResult =
  | { url: string }
  | { base64: string; mediaType: string }

/**
 * Upload a board-relative path to get a public URL.
 * Calls POST /ai/v3/media/upload with JSON body.
 */
export async function uploadBoardAsset(
  path: string,
  boardId: string,
): Promise<MediaUploadResult> {
  const base = resolveServerUrl()
  const authHeaders = await buildAuthHeaders()
  const res = await fetch(`${base}/ai/v3/media/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ path, boardId }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.message || 'Upload failed')
  return json.data as MediaUploadResult
}

/**
 * Upload a blob/file to get a public URL.
 * Calls POST /ai/v3/media/upload with multipart body.
 */
export async function uploadBlob(
  blob: Blob,
  fileName?: string,
): Promise<MediaUploadResult> {
  const base = resolveServerUrl()
  const authHeaders = await buildAuthHeaders()
  const formData = new FormData()
  formData.append('file', blob, fileName || 'upload')
  const res = await fetch(`${base}/ai/v3/media/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders,
    body: formData,
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.message || 'Upload failed')
  return json.data as MediaUploadResult
}

/**
 * Upload a data URL to get a public URL.
 * Converts data URL to blob first, then uploads.
 */
export async function uploadDataUrl(
  dataUrl: string,
): Promise<MediaUploadResult> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const ext = dataUrl.match(/^data:image\/(\w+)/)?.[1] || 'png'
  return uploadBlob(blob, `upload.${ext}`)
}

/** Check whether a URL is already publicly accessible. */
export function isPublicUrl(value: string): boolean {
  if (value.startsWith('https://')) return true
  if (!value.startsWith('http://')) return false
  try {
    const parsed = new URL(value)
    const host = parsed.hostname
    return (
      host !== 'localhost' &&
      host !== '127.0.0.1' &&
      host !== '0.0.0.0' &&
      host !== '::1' &&
      !host.endsWith('.local')
    )
  } catch {
    return false
  }
}

/** Check if a value looks like a media input record (has url, path, or base64 field). */
function isMediaInput(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const rec = value as Record<string, unknown>
  return (
    typeof rec.path === 'string' ||
    typeof rec.url === 'string' ||
    typeof rec.base64 === 'string'
  )
}

/**
 * Resolve a single media input record to a public URL.
 * Handles: { path }, { url: "data:..." }, { url: "http://localhost..." }, { base64, mediaType }
 * Passes through: { url: "https://..." } (already public)
 */
async function resolveOneMediaInput(
  input: Record<string, unknown>,
  boardId?: string,
): Promise<Record<string, unknown>> {
  // Already a public URL — pass through
  if (typeof input.url === 'string' && isPublicUrl(input.url)) {
    return input
  }

  // Board-relative path — upload via server
  if (typeof input.path === 'string' && boardId) {
    const result = await uploadBoardAsset(input.path, boardId)
    return 'url' in result ? { url: result.url } : result
  }

  // data URL — upload via server
  if (typeof input.url === 'string' && input.url.startsWith('data:')) {
    const result = await uploadDataUrl(input.url)
    return 'url' in result ? { url: result.url } : result
  }

  // base64 field — convert to data URL and upload
  if (typeof input.base64 === 'string' && typeof input.mediaType === 'string') {
    const dataUrl = `data:${input.mediaType};base64,${input.base64}`
    const result = await uploadDataUrl(dataUrl)
    return 'url' in result ? { url: result.url } : result
  }

  // localhost URL — extract path, but we can't reliably resolve, pass through
  // (server-side resolvePayloadMediaInputs will handle as fallback)
  return input
}

/**
 * Traverse an inputs object and upload all media fields to public URLs.
 * Automatically detects media inputs (objects with path/url/base64 fields)
 * at any level — single objects or arrays of objects.
 *
 * This is the main function panels should call before submitting to v3 generate.
 */
export async function resolveAllMediaInputs(
  inputs: Record<string, unknown>,
  boardId?: string,
): Promise<Record<string, unknown>> {
  const result = { ...inputs }

  for (const [key, value] of Object.entries(result)) {
    if (isMediaInput(value)) {
      result[key] = await resolveOneMediaInput(value, boardId)
    } else if (Array.isArray(value)) {
      const hasMedia = value.some(isMediaInput)
      if (hasMedia) {
        result[key] = await Promise.all(
          value.map((item) =>
            isMediaInput(item) ? resolveOneMediaInput(item, boardId) : item,
          ),
        )
      }
    }
  }

  return result
}
