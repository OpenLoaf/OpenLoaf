/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Named cloud tools — flat semantic entry points that collapse the
 * progressive-discovery chain (Browse → Detail → Generate) into a single
 * tool call. Each named tool picks a suitable variant from the cached
 * capability snapshot and delegates to the shared `runV3GenerateAndSave`
 * pipeline.
 *
 * Design rules:
 *   - A named tool is registered unconditionally, but if the cloud backend
 *     doesn't expose any matching variant it returns a friendly error that
 *     tells the model to fall back to CloudCapBrowse.
 *   - Parameter names follow human semantics (prompt / aspectRatio /
 *     referenceImage / modelHint). They map to the SaaS v3 payload's
 *     `inputs` / `params` using reasonable defaults — mismatches are
 *     silently ignored by the backend rather than breaking the call.
 */
import { tool, zodSchema } from 'ai'
import { cloudImageGenerateToolDef } from '@openloaf/api/types/tools/cloud'
import { createToolProgress } from '@/ai/tools/toolProgress'
import {
  getAllCachedVariantDetails,
  cloudSkillsInitialized,
  refreshCloudSkills,
  type CachedVariantDetail,
} from '@/ai/builtin-skills/cloud-skills'
import { runV3GenerateAndSave } from '@/ai/tools/cloud/cloudTools'
import type { ToolProgressEmitter } from '@/ai/tools/toolProgress'

// ---------------------------------------------------------------------------
// Cold-start handling
// ---------------------------------------------------------------------------

/**
 * Ensure the capability snapshot is ready before picking a variant. On
 * server cold-start the periodic refresh may not have run yet — in that
 * case we trigger an on-demand refresh and wait up to ~10s for it to land.
 *
 * This is crucial because the named tools are a "first-call" entry point:
 * without this guard, the very first invocation after a reload returns
 * `capabilities_probing` and the model wastes multiple retry rounds before
 * falling back to Browse. The 10s ceiling is set generous enough to cover
 * the typical 60-100 detail fanout batched 6-at-a-time.
 */
async function ensureCapabilitiesReady(
  progress: ToolProgressEmitter,
  maxWaitMs = 10_000,
): Promise<void> {
  if (cloudSkillsInitialized()) return
  progress.delta('warming up cloud capabilities catalog…\n')
  // Kick off an on-demand refresh — await it directly so we don't race the
  // periodic loop. If a refresh is already running, this one becomes a
  // cheap no-op on the SaaS side (cache hits) and resolves in sync with it.
  const refreshPromise = refreshCloudSkills()
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline && !cloudSkillsInitialized()) {
    await Promise.race([
      refreshPromise,
      new Promise((r) => setTimeout(r, 200)),
    ])
    if (cloudSkillsInitialized()) break
  }
}

// ---------------------------------------------------------------------------
// Variant picker
// ---------------------------------------------------------------------------

/**
 * Pick the best variant under the given feature id(s).
 *
 * Strategy:
 *   1. If `modelHint` is provided, try exact variantId match first, then a
 *      case-insensitive substring match against variantId + variantName.
 *   2. Otherwise, among variants matching any of the `featureIds`, choose
 *      the one with the lowest `creditsPerCall` (cheapest accessible model).
 *
 * Returns null if no variant matches. Callers should surface a friendly
 * error pointing the model at CloudCapBrowse as a fallback.
 *
 * Note: we don't gate by user tier here. The backend enforces tier access
 * and returns 402/403 which `runV3GenerateAndSave` surfaces as a structured
 * error — the model can then prompt the user to upgrade.
 */
function pickVariant(
  featureIds: readonly string[],
  modelHint?: string,
): CachedVariantDetail | null {
  const all = getAllCachedVariantDetails()
  if (all.length === 0) return null

  if (modelHint) {
    const trimmed = modelHint.trim()
    if (trimmed) {
      const exact = all.find((v) => v.variantId === trimmed)
      if (exact) return exact
      const lower = trimmed.toLowerCase()
      const fuzzy = all.find(
        (v) =>
          v.variantId.toLowerCase().includes(lower) ||
          v.variantName.toLowerCase().includes(lower),
      )
      if (fuzzy) return fuzzy
    }
  }

  const featureSet = new Set(featureIds)
  const candidates = all.filter((v) => featureSet.has(v.featureId))
  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.creditsPerCall - b.creditsPerCall)
  return candidates[0] ?? null
}

/**
 * Build a user-facing error message for the "no variant available" case.
 * Returns an AI-readable JSON string so the model can surface a friendly
 * message and potentially retry via CloudCapBrowse.
 */
function noVariantError(toolName: string, featureIds: readonly string[]): string {
  // By the time callers hit this branch, ensureCapabilitiesReady has already
  // awaited an on-demand refresh with a 10s ceiling. Either the backend truly
  // doesn't offer the capability, or the user's account tier can't access any
  // variant. Either way the correct next step is to stop retrying and either
  // tell the user or fall back to the advanced (Browse) path — NEVER retry
  // the same named tool, which only wastes rounds and credits.
  return JSON.stringify({
    ok: false,
    code: 'no_variant_available',
    error: `No cloud variant found for feature(s): ${featureIds.join(', ')}. The cloud backend may not offer this capability, or no accessible variant matches your current account tier.`,
    hint: 'Do NOT retry this tool. Either tell the user the capability is unavailable, or fall back to CloudCapBrowse → CloudCapDetail → CloudModelGenerate if they need an alternative.',
    featureIds,
    toolName,
  })
}

// ---------------------------------------------------------------------------
// Media input coercion
// ---------------------------------------------------------------------------

/**
 * Normalize a reference image value into the shape `normalizeCloudInputs`
 * understands. Accepts:
 *   - URL string      → passed through
 *   - { url: "..." }  → passed through
 *   - { path: "..." } → passed through (local path upload handled downstream)
 *   - any other shape → dropped silently (better than failing the call)
 */
function coerceMediaInput(value: unknown): unknown | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    if (typeof obj.url === 'string' || typeof obj.path === 'string') return obj
  }
  return undefined
}

// ---------------------------------------------------------------------------
// cloudImageGenerate
// ---------------------------------------------------------------------------

const IMAGE_GENERATE_FEATURES = ['imageGenerate'] as const

export const cloudImageGenerateTool = tool({
  description: cloudImageGenerateToolDef.description,
  inputSchema: zodSchema(cloudImageGenerateToolDef.parameters),
  // Consumes credits like CloudModelGenerate → requires approval.
  needsApproval: true,
  execute: async (input, { toolCallId }): Promise<string> => {
    const {
      prompt,
      aspectRatio,
      style,
      referenceImage,
      modelHint,
    } = input as {
      prompt: string
      aspectRatio?: string
      style?: string
      referenceImage?: unknown
      modelHint?: string
    }

    const progress = createToolProgress(toolCallId, 'CloudImageGenerate')
    await ensureCapabilitiesReady(progress)
    const picked = pickVariant(IMAGE_GENERATE_FEATURES, modelHint)
    if (!picked) {
      progress.error('no matching variant')
      return noVariantError('CloudImageGenerate', IMAGE_GENERATE_FEATURES)
    }

    progress.delta(`picked ${picked.variantId} (${picked.variantName}) · ${picked.creditsPerCall} credits\n`)

    const inputs: Record<string, unknown> = { prompt }
    const coercedRef = coerceMediaInput(referenceImage)
    if (coercedRef !== undefined) inputs.referenceImage = coercedRef

    const params: Record<string, unknown> = {}
    if (aspectRatio) params.aspectRatio = aspectRatio
    if (style) params.style = style

    return runV3GenerateAndSave({
      feature: picked.featureId,
      variant: picked.variantId,
      inputs,
      params,
      waitForCompletion: true,
      progress,
      toolName: 'CloudImageGenerate',
    })
  },
})
