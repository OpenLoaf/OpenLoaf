/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * SaaS multimodal understanding wrapper for the unified Read tool.
 *
 * When the Read tool encounters an image / video / audio file, it delegates
 * to these functions to get a text description / transcript from the SaaS
 * platform. The Read tool then embeds the returned text in its XML-tagged
 * response so the chat model can consume it like any other file content.
 *
 * Design rules:
 *   1. NEVER throw — always return `{ ok: false, reason }` on any failure.
 *      The Read tool forwards `reason` to the model so it can decide to
 *      retry, fall back, or surface the error to the user.
 *   2. Reuse the existing `getSaasClient` + `ensureServerAccessToken`
 *      helpers. Do not instantiate a bare `SaaSClient` here.
 *   3. All media features are called through `client.ai.v3ToolExecute`
 *      which is the synchronous per-call tool endpoint. We first upload
 *      the local file via `client.ai.uploadFile` to get a public URL, then
 *      pass that URL as the input slot.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { SaaSHttpError, SaaSNetworkError } from '@openloaf-saas/sdk'
import { getSaasClient } from '@/modules/saas/client'
import { ensureServerAccessToken } from '@/modules/auth/tokenStore'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result of a SaaS multimodal understanding call. */
export type SaasMediaResult =
  | {
      ok: true
      /** Free-form caption / transcript text — goes straight into Read tool content. */
      text: string
      /** Optional format-specific extras — duration, OCR text, etc. */
      extras?: Record<string, unknown>
    }
  | {
      ok: false
      /** User-facing reason: not logged in, no credits, network error, feature unavailable. */
      reason: string
    }

// ---------------------------------------------------------------------------
// File size caps
// ---------------------------------------------------------------------------
//
// Caps are enforced *before* upload to avoid burning SaaS quota on files the
// upstream providers will reject anyway. Numbers picked to match typical CDN
// upload ceilings:
//   - image: most captioning models max out well below 50MB
//   - video: video captioning runs on transcoded frames; 500MB covers most
//     short-clip use cases without DoS'ing the upload pipeline
//   - audio: 200MB covers a ~3h WAV or much longer MP3

const MB = 1024 * 1024
const IMAGE_MAX_BYTES = 50 * MB
const VIDEO_MAX_BYTES = 500 * MB
const AUDIO_MAX_BYTES = 200 * MB

// ---------------------------------------------------------------------------
// Feature IDs
// ---------------------------------------------------------------------------
//
// These are the REST `feature` values accepted by `v3ToolExecute`. Confirmed
// from @openloaf-saas/sdk `MEDIA_FEATURES` dictionary (node_modules/
// @openloaf-saas/sdk/dist/index.d.ts ~ line 11629+):
//   - imageCaption    — image understanding / captioning (line 12140)
//   - videoCaption    — video understanding / captioning (line 12155)
//   - speechToText    — audio transcription (line 11885)
//   - ocrRecognize    — text extraction from images (line 12110; reserved
//                       for a future image+OCR concat in understandImage)
//
// Note: the task brief mentioned `speechRecognize` but the SDK dictionary
// actually calls this feature `speechToText`. We use the SDK name.

const FEATURE_IMAGE_CAPTION = 'imageCaption'
const FEATURE_VIDEO_CAPTION = 'videoCaption'
const FEATURE_SPEECH_TO_TEXT = 'speechToText'

// ---------------------------------------------------------------------------
// Mime-type inference
// ---------------------------------------------------------------------------
//
// The SaaS uploadFile endpoint wants a real MIME type on the Blob. We keep
// a minimal ext→mime map inlined here — adding `mime-types` as a dep just
// for three handlers would be overkill, and the Read tool already constrains
// which file types reach us to a small set.

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.svg': 'image/svg+xml',
}

const VIDEO_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.m4v': 'video/x-m4v',
  '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv',
}

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
  '.wma': 'audio/x-ms-wma',
  '.amr': 'audio/amr',
  '.aiff': 'audio/aiff',
}

function mimeFromExt(absPath: string, table: Record<string, string>, fallback: string): string {
  const ext = path.extname(absPath).toLowerCase()
  return table[ext] ?? fallback
}

// ---------------------------------------------------------------------------
// Shared pipeline: read → cap → upload → v3ToolExecute
// ---------------------------------------------------------------------------

type MediaKind = 'image' | 'video' | 'audio'

/** Human-readable size formatter for size-cap error messages. */
function formatMb(bytes: number): string {
  return `${(bytes / MB).toFixed(1)}mb`
}

/**
 * Build the `inputs` payload for `v3ToolExecute`.
 *
 * Slot-key convention in OpenLoaf cloud tools:
 *   - imageCaption uses a plain URL string under `image`
 *     (see apps/server/src/ai/builtin-skills/cloud-skills.ts:362 — OCR uses
 *      `inputs: { image: "<url>" }`).
 *   - videoCaption uses `{ video: { url: "..." } }`
 *     (see apps/web/src/components/board/panels/variants/__tests__/fixtures.ts:294).
 *   - speechToText uses `{ audio: { url: "..." } }`
 *     (see apps/web/src/components/board/panels/variants/__tests__/fixtures.ts:333).
 *
 * The server-side normalizer accepts either shape for most slots, but we
 * mirror the exact conventions already used by the panels/fixtures to stay
 * within tested code paths.
 */
function buildInputs(kind: MediaKind, url: string): Record<string, unknown> {
  switch (kind) {
    case 'image':
      return { image: url }
    case 'video':
      return { video: { url } }
    case 'audio':
      return { audio: { url } }
  }
}

/**
 * Map arbitrary error → user-facing reason string.
 *
 * Handles the three SDK error classes (SaaSHttpError / SaaSNetworkError /
 * generic Error) plus the special 402 "insufficient credits" status.
 */
function errorToReason(err: unknown, feature: string): string {
  // SaaSHttpError carries a numeric status we can inspect directly.
  if (err instanceof SaaSHttpError) {
    const status = err.status
    if (status === 401 || status === 403) {
      return 'Not logged in to SaaS account'
    }
    if (status === 402) {
      return 'Insufficient SaaS credits'
    }
    if (status === 404) {
      return `Feature ${feature} not available for your account tier`
    }
    if (status === 413) {
      return 'File too large for SaaS upload'
    }
    if (status >= 500) {
      return `SaaS server error (${status})`
    }
    return `SaaS error ${status}: ${err.message}`
  }
  // Network-level failure (socket, DNS, timeout).
  if (err instanceof SaaSNetworkError) {
    return 'Network error contacting SaaS'
  }
  // Fallback: anything we didn't classify — return the message verbatim so
  // the model can at least see what happened.
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * Parse the `data` field of a V3ToolExecuteResponse into a display string.
 *
 * TODO: The SDK types `data` as `z.ZodUnknown` — the actual shape returned
 * by the SaaS server for imageCaption / videoCaption / speechToText has not
 * been observed in code yet. We defensively probe common field names:
 *   - `.caption`      (image/video captioners)
 *   - `.text`         (generic / OCR / transcription)
 *   - `.transcript`   (explicit speechToText naming)
 *   - `.description`  (alternative captioner naming)
 *   - `.result`       (nested container)
 * and fall back to `JSON.stringify(data)` as a last resort. Once we have a
 * confirmed response shape, tighten this up.
 */
function extractText(data: unknown): { text: string; extras?: Record<string, unknown> } {
  if (data == null) return { text: '' }
  if (typeof data === 'string') return { text: data }
  if (typeof data !== 'object') return { text: String(data) }

  const obj = data as Record<string, unknown>
  const pickString = (key: string): string | undefined => {
    const v = obj[key]
    return typeof v === 'string' && v.length > 0 ? v : undefined
  }
  // 逻辑：优先挑出人类可读字段；保留原始 data 在 extras 里供调用方 inspect。
  const text =
    pickString('caption') ??
    pickString('text') ??
    pickString('transcript') ??
    pickString('description') ??
    (obj.result && typeof obj.result === 'object'
      ? (() => {
          const r = obj.result as Record<string, unknown>
          return (
            (typeof r.caption === 'string' ? r.caption : undefined) ??
            (typeof r.text === 'string' ? r.text : undefined) ??
            (typeof r.transcript === 'string' ? r.transcript : undefined)
          )
        })()
      : undefined) ??
    JSON.stringify(data)

  return { text, extras: obj }
}

/**
 * Low-level worker: read file, enforce cap, grab authed SaaS client,
 * upload to CDN, run v3ToolExecute, parse response.
 *
 * All error paths collapse into `{ ok: false, reason }`.
 */
async function runMediaPipeline(
  absPath: string,
  kind: MediaKind,
  feature: string,
  maxBytes: number,
  mimeTable: Record<string, string>,
  fallbackMime: string,
): Promise<SaasMediaResult> {
  // 1. Stat + cap check. We stat before loading the whole file into memory
  //    to avoid OOM on huge clips — this matches the Canvas pixel-buffer
  //    cleanup rule in MEMORY.md.
  let size: number
  try {
    const stat = await fs.stat(absPath)
    size = stat.size
  } catch (err) {
    return {
      ok: false,
      reason: `Failed to stat file: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (size > maxBytes) {
    return {
      ok: false,
      reason: `File too large for SaaS upload (${formatMb(size)}, max ${formatMb(maxBytes)})`,
    }
  }

  // 2. Authenticated SaaS client. Reuses the memoized token refresh path
  //    — see apps/server/src/modules/auth/tokenStore.ts:ensureServerAccessToken.
  let token: string
  try {
    token = (await ensureServerAccessToken()) ?? ''
  } catch (err) {
    return {
      ok: false,
      reason: `Failed to refresh SaaS token: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (!token) {
    return { ok: false, reason: 'Not logged in to SaaS account' }
  }

  // 3. Read file body. We hold the whole buffer in memory during upload —
  //    this is bounded by the caps above. For 500MB video this is ~500MB
  //    of transient RSS; acceptable for a per-call tool invocation but
  //    noted in the limitations section.
  let buffer: Buffer
  try {
    buffer = await fs.readFile(absPath)
  } catch (err) {
    return {
      ok: false,
      reason: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const contentType = mimeFromExt(absPath, mimeTable, fallbackMime)
  const filename = path.basename(absPath)

  // 4. Upload → URL. Matches the pattern in
  //    apps/server/src/modules/saas/modules/media/client.ts:uploadMediaFile.
  let uploadedUrl: string
  try {
    const client = getSaasClient(token)
    const blob = new Blob([new Uint8Array(buffer)], { type: contentType })
    const response = await client.ai.uploadFile(blob, filename)
    if (!response?.url) {
      return { ok: false, reason: 'SaaS upload returned no URL' }
    }
    uploadedUrl = response.url
  } catch (err) {
    return { ok: false, reason: errorToReason(err, feature) }
  }

  // 5. v3ToolExecute → parse. Mirrors
  //    apps/server/src/ai/tools/cloud/cloudToolsDynamic.ts:101-116.
  try {
    const client = getSaasClient(token)
    const res = await client.ai.v3ToolExecute({
      feature,
      inputs: buildInputs(kind, uploadedUrl),
    })
    const { text, extras } = extractText(res.data)
    return {
      ok: true,
      text,
      extras: {
        feature,
        variantId: res.variantId,
        creditsConsumed: res.creditsConsumed,
        uploadedUrl,
        raw: extras,
      },
    }
  } catch (err) {
    return { ok: false, reason: errorToReason(err, feature) }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a text caption / description for an image.
 *
 * Uses the SaaS `imageCaption` feature. Currently does NOT call
 * `ocrRecognize` — callers that need OCR text can either request it
 * separately or we add a parallel OCR call here in a follow-up (see
 * deliverable notes).
 */
export async function understandImage(absPath: string): Promise<SaasMediaResult> {
  return runMediaPipeline(
    absPath,
    'image',
    FEATURE_IMAGE_CAPTION,
    IMAGE_MAX_BYTES,
    IMAGE_MIME,
    'image/jpeg',
  )
}

/**
 * Generate a text caption / description for a video.
 *
 * Uses the SaaS `videoCaption` feature. Returns a free-form description;
 * the underlying provider decides how densely to sample frames.
 */
export async function understandVideo(absPath: string): Promise<SaasMediaResult> {
  return runMediaPipeline(
    absPath,
    'video',
    FEATURE_VIDEO_CAPTION,
    VIDEO_MAX_BYTES,
    VIDEO_MIME,
    'video/mp4',
  )
}

/**
 * Transcribe the speech in an audio file to text.
 *
 * Uses the SaaS `speechToText` feature. Returns the transcript as plain
 * text in `result.text`. Timestamps / speaker diarization, if the provider
 * supplies them, end up in `result.extras.raw`.
 */
export async function transcribeAudio(absPath: string): Promise<SaasMediaResult> {
  return runMediaPipeline(
    absPath,
    'audio',
    FEATURE_SPEECH_TO_TEXT,
    AUDIO_MAX_BYTES,
    AUDIO_MIME,
    'audio/mpeg',
  )
}
