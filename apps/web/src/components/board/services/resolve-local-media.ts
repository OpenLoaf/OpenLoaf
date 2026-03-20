/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { blobToBase64 } from '../utils/base64'

/** Check whether a URL points to a local server that the SaaS backend cannot access. */
export function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin)
    const host = parsed.hostname
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local')
    )
  } catch {
    // Relative path → local
    return !url.startsWith('http://') && !url.startsWith('https://')
  }
}

/**
 * Fetch a local media file and return { base64, mediaType } for the SaaS API.
 * Used when the media URL is on localhost and the SaaS backend cannot download it.
 */
export async function fetchMediaAsBase64(
  url: string,
  fallbackMediaType = 'image/jpeg',
): Promise<{ base64: string; mediaType: string }> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch media: ${response.status}`)
  const blob = await response.blob()
  const base64 = await blobToBase64(blob)
  return { base64, mediaType: blob.type || fallbackMediaType }
}
