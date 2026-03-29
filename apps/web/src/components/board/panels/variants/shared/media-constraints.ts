/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { MediaType } from '../slot-types'
import { formatDuration, formatFileSize } from '@/lib/format-utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MediaConstraints = {
  maxFileSize?: number
  acceptFormats?: string[]
  minResolution?: number
  maxResolution?: number
  minDuration?: number
  maxDuration?: number
}

export type MediaFileMetadata = {
  file: File
  width?: number
  height?: number
  duration?: number
}

export type ValidationError = {
  type:
    | 'fileSize'
    | 'format'
    | 'resolution-min'
    | 'resolution-max'
    | 'duration-min'
    | 'duration-max'
  messageKey: string
  params: Record<string, string | number>
}

// ---------------------------------------------------------------------------
// Metadata reading
// ---------------------------------------------------------------------------

function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

function getVideoDimensionsAndDuration(
  file: File,
): Promise<{ width: number; height: number; duration: number } | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => {
      const w = video.videoWidth || 0
      const h = video.videoHeight || 0
      const d = Number.isFinite(video.duration) ? video.duration : 0
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      video.load()
      if (!w || !h) {
        resolve(null)
        return
      }
      resolve({ width: w, height: h, duration: d })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      video.load()
      resolve(null)
    }
    video.src = url
  })
}

function getAudioDurationFromFile(file: File): Promise<number | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const audio = document.createElement('audio')
    const url = URL.createObjectURL(file)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const d = Number.isFinite(audio.duration) ? audio.duration : null
      URL.revokeObjectURL(url)
      resolve(d)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    audio.src = url
  })
}

/** Read file metadata (dimensions, duration) based on media type. */
export async function readMediaMetadata(
  file: File,
  mediaType: MediaType,
): Promise<MediaFileMetadata> {
  const meta: MediaFileMetadata = { file }
  if (mediaType === 'image') {
    const dims = await getImageDimensions(file)
    if (dims) {
      meta.width = dims.width
      meta.height = dims.height
    }
  } else if (mediaType === 'video') {
    const info = await getVideoDimensionsAndDuration(file)
    if (info) {
      meta.width = info.width
      meta.height = info.height
      meta.duration = info.duration
    }
  } else if (mediaType === 'audio') {
    const d = await getAudioDurationFromFile(file)
    if (d != null) meta.duration = d
  }
  return meta
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function getFileExtension(file: File): string {
  const name = file.name || ''
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** Synchronously validate metadata against constraints. Returns all violations. */
export function validateMediaFile(
  metadata: MediaFileMetadata,
  constraints: MediaConstraints,
): ValidationError[] {
  const errors: ValidationError[] = []

  // File size
  if (
    constraints.maxFileSize != null &&
    metadata.file.size > constraints.maxFileSize
  ) {
    errors.push({
      type: 'fileSize',
      messageKey: 'fileTooLarge',
      params: {
        actual: formatFileSize(metadata.file.size),
        max: formatFileSize(constraints.maxFileSize),
      },
    })
  }

  // Format
  if (constraints.acceptFormats && constraints.acceptFormats.length > 0) {
    const ext = getFileExtension(metadata.file)
    const allowed = new Set(
      constraints.acceptFormats.map((f) => f.toLowerCase().replace(/^\./, '')),
    )
    if (ext && !allowed.has(ext)) {
      errors.push({
        type: 'format',
        messageKey: 'formatNotAllowed',
        params: {
          ext,
          formats: constraints.acceptFormats.join(', '),
        },
      })
    }
  }

  // Resolution min (shortest edge)
  if (
    constraints.minResolution != null &&
    metadata.width != null &&
    metadata.height != null
  ) {
    const shortest = Math.min(metadata.width, metadata.height)
    if (shortest < constraints.minResolution) {
      errors.push({
        type: 'resolution-min',
        messageKey: 'resolutionTooLow',
        params: {
          actual: shortest,
          min: constraints.minResolution,
        },
      })
    }
  }

  // Resolution max (longest edge)
  if (
    constraints.maxResolution != null &&
    metadata.width != null &&
    metadata.height != null
  ) {
    const longest = Math.max(metadata.width, metadata.height)
    if (longest > constraints.maxResolution) {
      errors.push({
        type: 'resolution-max',
        messageKey: 'resolutionTooHigh',
        params: {
          actual: longest,
          max: constraints.maxResolution,
        },
      })
    }
  }

  // Duration min
  if (constraints.minDuration != null && metadata.duration != null) {
    if (metadata.duration < constraints.minDuration) {
      errors.push({
        type: 'duration-min',
        messageKey: 'durationTooShort',
        params: {
          actual: formatDuration(metadata.duration),
          min: formatDuration(constraints.minDuration),
        },
      })
    }
  }

  // Duration max
  if (constraints.maxDuration != null && metadata.duration != null) {
    if (metadata.duration > constraints.maxDuration) {
      errors.push({
        type: 'duration-max',
        messageKey: 'durationTooLong',
        params: {
          actual: formatDuration(metadata.duration),
          max: formatDuration(constraints.maxDuration),
        },
      })
    }
  }

  return errors
}

/** Async: read metadata then validate. */
export async function validateMediaFileAsync(
  file: File,
  mediaType: MediaType,
  constraints: MediaConstraints,
): Promise<ValidationError[]> {
  const metadata = await readMediaMetadata(file, mediaType)
  return validateMediaFile(metadata, constraints)
}

// ---------------------------------------------------------------------------
// Accept attribute builder
// ---------------------------------------------------------------------------

/** Build HTML `<input accept>` value from slot constraints. */
export function buildAcceptAttribute(
  mediaType: MediaType,
  acceptFormats?: string[],
): string {
  if (acceptFormats && acceptFormats.length > 0) {
    return acceptFormats
      .map((f) => {
        const ext = f.toLowerCase().replace(/^\./, '')
        return `.${ext}`
      })
      .join(',')
  }
  switch (mediaType) {
    case 'video':
      return 'video/*'
    case 'audio':
      return 'audio/*'
    default:
      return 'image/*'
  }
}

// ---------------------------------------------------------------------------
// Constraint summary builder
// ---------------------------------------------------------------------------

/** Check if any media constraint is defined. */
export function hasMediaConstraints(c: MediaConstraints): boolean {
  return (
    c.maxFileSize != null ||
    (c.acceptFormats != null && c.acceptFormats.length > 0) ||
    c.minResolution != null ||
    c.maxResolution != null ||
    c.minDuration != null ||
    c.maxDuration != null
  )
}

/** Build a concise summary string for display under slot labels. */
export function buildConstraintsSummary(constraints: MediaConstraints): string {
  const parts: string[] = []

  if (constraints.maxFileSize != null) {
    parts.push(`≤${formatFileSize(constraints.maxFileSize)}`)
  }

  if (constraints.acceptFormats && constraints.acceptFormats.length > 0) {
    parts.push(
      constraints.acceptFormats
        .map((f) => f.toUpperCase().replace(/^\./, ''))
        .join('/')
    )
  }

  if (constraints.minResolution != null && constraints.maxResolution != null) {
    parts.push(`${constraints.minResolution}-${constraints.maxResolution}px`)
  } else if (constraints.minResolution != null) {
    parts.push(`≥${constraints.minResolution}px`)
  } else if (constraints.maxResolution != null) {
    parts.push(`≤${constraints.maxResolution}px`)
  }

  if (constraints.minDuration != null && constraints.maxDuration != null) {
    parts.push(
      `${formatDuration(constraints.minDuration)}-${formatDuration(constraints.maxDuration)}`,
    )
  } else if (constraints.minDuration != null) {
    parts.push(`≥${formatDuration(constraints.minDuration)}`)
  } else if (constraints.maxDuration != null) {
    parts.push(`≤${formatDuration(constraints.maxDuration)}`)
  }

  return parts.join(' · ')
}

/** Extract MediaConstraints from a slot-like object. */
export function pickConstraints(slot: {
  maxFileSize?: number
  acceptFormats?: string[]
  minResolution?: number
  maxResolution?: number
  minDuration?: number
  maxDuration?: number
}): MediaConstraints {
  return {
    maxFileSize: slot.maxFileSize,
    acceptFormats: slot.acceptFormats,
    minResolution: slot.minResolution,
    maxResolution: slot.maxResolution,
    minDuration: slot.minDuration,
    maxDuration: slot.maxDuration,
  }
}
