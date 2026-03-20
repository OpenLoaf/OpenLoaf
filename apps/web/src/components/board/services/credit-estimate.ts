/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import type { AiModel } from '@openloaf-saas/sdk'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModelPricing = {
  /** Fixed credits per task (image, video base). */
  creditsPerTask?: number
  /** Additional credits per second of duration (video). */
  creditsPerSecond?: number
  /** Credits per 10,000 characters (TTS audio). */
  creditsPer10kChars?: number
}

type ImageEstimateParams = {
  modelId: string
  aspectRatio?: string
  resolution?: string
  count?: number
}

type VideoEstimateParams = {
  modelId: string
  duration?: number
  aspectRatio?: string
  count?: number
}

type AudioEstimateParams = {
  modelId: string
  textLength?: number
  duration?: number | 'auto'
  mode?: 'tts' | 'music' | 'sfx'
}

// ---------------------------------------------------------------------------
// Pricing table (client-side estimates)
// ---------------------------------------------------------------------------

/**
 * Client-side pricing table keyed by model ID.
 * Credits are approximate and should be updated when real pricing data is available.
 * Falls back to family-based matching when exact ID is not found.
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  // ── Image models ──
  'wan2.1-t2i': { creditsPerTask: 2 },
  'wan2.6-t2i': { creditsPerTask: 2 },
  'flux-schnell': { creditsPerTask: 1 },
  'flux-dev': { creditsPerTask: 3 },
  'kolors': { creditsPerTask: 2 },
  'stable-diffusion-xl': { creditsPerTask: 2 },

  // ── Video models ──
  'wan2.6-t2v': { creditsPerTask: 5, creditsPerSecond: 2 },
  'wan2.6-i2v': { creditsPerTask: 5, creditsPerSecond: 2 },
  'wan2.6-i2v-flash': { creditsPerTask: 3, creditsPerSecond: 1 },
  'wan2.6-t2v-turbo': { creditsPerTask: 3, creditsPerSecond: 1 },

  // ── Audio models (TTS) ──
  'cosyvoice-v3-flash': { creditsPer10kChars: 10 },
  'cosyvoice-v3-plus': { creditsPer10kChars: 20 },
  'cosyvoice-v3.5-flash': { creditsPer10kChars: 8 },
  'cosyvoice-v3.5-plus': { creditsPer10kChars: 15 },
}

/** Default estimates when model is not in the pricing table. */
const DEFAULT_PRICING: Record<string, ModelPricing> = {
  image: { creditsPerTask: 2 },
  video: { creditsPerTask: 5, creditsPerSecond: 2 },
  audio: { creditsPer10kChars: 10 },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Try to read pricing from model metadata (future-proof for when API returns pricing).
 * The AiModel type allows `[key: string]: unknown`, so the SaaS API can return
 * a `pricing` field which we'll pick up automatically.
 */
function getModelPricing(model: AiModel | undefined, modelId: string): ModelPricing | undefined {
  // 1. Check model metadata for dynamic pricing
  if (model) {
    const dynamic = (model as Record<string, unknown>).pricing
    if (dynamic && typeof dynamic === 'object') {
      return dynamic as ModelPricing
    }
  }

  // 2. Exact ID match
  if (MODEL_PRICING[modelId]) {
    return MODEL_PRICING[modelId]
  }

  // 3. Prefix match (e.g. "wan2.6-t2i-xxx" → "wan2.6-t2i")
  for (const key of Object.keys(MODEL_PRICING)) {
    if (modelId.startsWith(key)) {
      return MODEL_PRICING[key]
    }
  }

  return undefined
}

/** Resolution multiplier for image pricing. */
function resolutionMultiplier(resolution?: string): number {
  switch (resolution) {
    case '4K': return 2
    case '2K': return 1.5
    default: return 1
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Estimate credits for an image generation task.
 * Returns null when estimation is not possible.
 */
export function estimateImageCredits(
  params: ImageEstimateParams,
  models?: AiModel[],
): number | null {
  const { modelId, resolution, count = 1 } = params
  if (!modelId || modelId === 'auto') return null

  const model = models?.find((m) => m.id === modelId)
  const pricing = getModelPricing(model, modelId) ?? DEFAULT_PRICING.image

  const base = pricing.creditsPerTask ?? DEFAULT_PRICING.image!.creditsPerTask!
  const resMult = resolutionMultiplier(resolution)

  return Math.round(base * resMult * count)
}

/**
 * Estimate credits for a video generation task.
 * Returns null when estimation is not possible.
 */
export function estimateVideoCredits(
  params: VideoEstimateParams,
  models?: AiModel[],
): number | null {
  const { modelId, duration = 5, count = 1 } = params
  if (!modelId || modelId === 'auto') return null

  const model = models?.find((m) => m.id === modelId)
  const pricing = getModelPricing(model, modelId) ?? DEFAULT_PRICING.video

  const base = pricing.creditsPerTask ?? DEFAULT_PRICING.video!.creditsPerTask!
  const perSec = pricing.creditsPerSecond ?? DEFAULT_PRICING.video!.creditsPerSecond!
  const total = base + perSec * duration

  return Math.round(total * count)
}

/**
 * Estimate credits for an audio (TTS) generation task.
 * Returns null when estimation is not possible (e.g. no text length for TTS).
 */
export function estimateAudioCredits(
  params: AudioEstimateParams,
  models?: AiModel[],
): number | null {
  const { modelId, textLength, mode } = params

  // TTS: estimate based on text length
  if (mode === 'tts') {
    if (!textLength || textLength === 0) return null
    const resolvedModelId = modelId || 'cosyvoice-v3-flash'
    const model = models?.find((m) => m.id === resolvedModelId)
    const pricing = getModelPricing(model, resolvedModelId) ?? DEFAULT_PRICING.audio
    const per10k = pricing.creditsPer10kChars ?? DEFAULT_PRICING.audio!.creditsPer10kChars!
    // Minimum 1 credit
    return Math.max(1, Math.round((textLength / 10000) * per10k))
  }

  // Music / SFX: fixed cost (placeholder until real pricing)
  return null
}
