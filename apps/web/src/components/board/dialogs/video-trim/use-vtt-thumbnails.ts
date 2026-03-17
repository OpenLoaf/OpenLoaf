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

type ThumbnailEntry = { startTime: number; endTime: number; url: string }

function parseVttTime(str: string): number {
  const parts = str.split(':')
  const h = Number(parts[0])
  const m = Number(parts[1])
  const s = Number(parts[2])
  return h * 3600 + m * 60 + s
}

/** Extract origin from a URL string, e.g. "http://host:port" from a full URL. */
function extractOrigin(urlStr: string): string {
  try {
    const u = new URL(urlStr)
    return u.origin
  } catch {
    return ''
  }
}

/** Parse HLS VTT thumbnail manifest into entries. */
function parseVttThumbnails(vttText: string, baseUrl: string): ThumbnailEntry[] {
  const origin = extractOrigin(baseUrl)
  const entries: ThumbnailEntry[] = []
  const lines = vttText.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!.trim()
    const timeMatch = line.match(
      /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})$/,
    )
    if (timeMatch) {
      const startTime = parseVttTime(timeMatch[1]!)
      const endTime = parseVttTime(timeMatch[2]!)
      const urlLine = lines[i + 1]?.trim()
      if (urlLine && !urlLine.includes('-->')) {
        let url: string
        if (urlLine.startsWith('http')) {
          url = urlLine
        } else if (urlLine.startsWith('/')) {
          // VTT returns server-relative paths; prepend API origin to ensure
          // fetch goes to the correct server (page origin may differ).
          url = origin ? `${origin}${urlLine}` : urlLine
        } else {
          url = new URL(urlLine, baseUrl).toString()
        }
        entries.push({ startTime, endTime, url })
      }
      i += 2
    } else {
      i++
    }
  }
  return entries
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/** Load thumbnail images and return data URLs. */
async function loadThumbnailImages(
  entries: ThumbnailEntry[],
  signal?: AbortSignal,
): Promise<string[]> {
  const results: string[] = []
  const promises = entries.map(async (entry, idx) => {
    try {
      const res = await fetch(entry.url, { signal, cache: 'force-cache' })
      if (!res.ok) return
      const blob = await res.blob()
      const dataUrl = await blobToDataUrl(blob)
      results[idx] = dataUrl
    } catch {
      // ignore single frame load failure
    }
  })
  await Promise.all(promises)
  return results
}

/** Hook to fetch and parse VTT thumbnails into data URL array. */
export function useVttThumbnails(thumbnailsUrl: string | undefined): string[] {
  const [images, setImages] = useState<string[]>([])

  useEffect(() => {
    if (!thumbnailsUrl) return
    let cancelled = false
    const controller = new AbortController()

    const run = async () => {
      try {
        const res = await fetch(thumbnailsUrl, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!res.ok || cancelled) return
        const text = await res.text()
        if (cancelled) return
        const parsed = parseVttThumbnails(text, thumbnailsUrl)
        const imgs = await loadThumbnailImages(parsed, controller.signal)
        if (!cancelled) setImages(imgs)
      } catch {
        // VTT load failure should not block UI
      }
    }
    run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [thumbnailsUrl])

  return images
}
