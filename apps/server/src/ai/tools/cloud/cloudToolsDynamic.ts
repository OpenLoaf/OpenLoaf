/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Dynamic cloud tools — tools category (v0.1.41+ flat V3ToolFeature shape).
 *
 * Each feature in the `tools` category becomes its own local deferred tool
 * (id = feature.id, e.g. `webSearch`, `webSearchImage`). At startup we
 * preload `v3ToolsCapabilities`, cache the flat features, generate one
 * `tool()` per feature (zod schema derived from `inputSlots + paramsSchema`)
 * and register them in a runtime cloud tool registry so `buildToolset` and
 * `getToolJsonSchemas` can resolve them.
 *
 * Consumers:
 *   - getCloudToolIds()        → agentFactory merges into allToolIds
 *   - getCloudToolEntry(id)    → toolRegistry.getToolById fallback
 *   - getCloudToolDef(id)      → toolRegistry.getToolJsonSchemas fallback
 *   - buildCloudToolsXmlBlock()→ master prompt injection
 */
import { tool, zodSchema } from 'ai'
import type { V3ToolFeature } from '@openloaf-saas/sdk'

// Sync (per_call) variant of the V3ToolFeature discriminated union.
// Only per_call features can run through v3ToolExecute — realtime (per_minute)
// features require a WebSocket session and are out of scope for this registry.
type V3SyncToolFeature = Extract<V3ToolFeature, { billingType: 'per_call' }>
import { getSaasClient } from '@/modules/saas/client'
import { addCreditsConsumed } from '@/ai/shared/context/requestContext'
import { createToolProgress } from '@/ai/tools/toolProgress'
import { isWebSearchConfigured } from '@/ai/tools/webSearchTool'
import { logger } from '@/common/logger'
import { buildFeatureZodSchema, splitInputsAndParams } from './paramsSchemaToZod'

// ---------------------------------------------------------------------------
// Canonical ID mapping
// ---------------------------------------------------------------------------
// The SaaS backend emits feature ids in its own casing (e.g. `webSearch`
// lowercase). The rest of the codebase — static TOOL_CATALOG, TOOL_REGISTRY,
// master prompt references — uses canonical PascalCase ids (`WebSearch`).
// Registering cloud tools under the canonical id keeps name resolution
// unambiguous: models see one name, ToolSearch loads one schema, and runtime
// repair never has to fuzzy-match between cases. Execution still uses the
// original `feature.id` when calling the backend; only the local registry
// key and the exposed def id are canonicalized.

const CLOUD_FEATURE_ID_REMAP: Record<string, string> = {
  webSearch: 'WebSearch',
}

function canonicalIdFor(featureId: string): string {
  return CLOUD_FEATURE_ID_REMAP[featureId] ?? featureId
}

/**
 * Cloud features that must not register because a static implementation of
 * the same canonical id is actively configured. Jina is the explicit static
 * alternative for WebSearch — when Jina provider + api key are set, the
 * static tool wins and the cloud SaaS version must not shadow it.
 */
function shouldSkipFeature(featureId: string): boolean {
  if (featureId === 'webSearch' && isWebSearchConfigured()) return true
  return false
}

const LOG_PREFIX = '[cloud-tools]'
const REFRESH_INTERVAL_MS = 30 * 60 * 1000
/** Retry cadence while refresh keeps failing (before first successful load). */
const RETRY_INTERVAL_MS = 60 * 1000

type CloudToolEntry = {
  tool: any
  def: { id: string; parameters: any; description: string }
  feature: V3SyncToolFeature
}

/** Runtime-mutable registry for cloud tools (keyed by feature.id). */
const CLOUD_TOOL_REGISTRY = new Map<string, CloudToolEntry>()

/**
 * Type guard — the features array in v0.1.41+ is a union of legacy media
 * features (with `variants`) and flat tool features. We only want the
 * latter for the tools category.
 */
function isFlatToolFeature(f: unknown): f is V3SyncToolFeature {
  return (
    typeof f === 'object' &&
    f !== null &&
    !('variants' in f) &&
    'inputSlots' in f &&
    'paramsSchema' in f &&
    (f as { billingType?: unknown }).billingType === 'per_call'
  )
}

function buildCloudToolForFeature(
  feature: V3SyncToolFeature,
  canonicalId: string,
): CloudToolEntry {
  const paramsZod = buildFeatureZodSchema(feature)
  const description = buildToolDescription(feature)

  const def = {
    id: canonicalId,
    parameters: paramsZod,
    description,
  }

  const toolInstance = tool({
    description,
    inputSchema: zodSchema(paramsZod),
    // sync + paid-but-cheap (5 credits typical, free tier allowed) —
    // read-only discovery style: no approval prompt, let the agent run.
    needsApproval: false,
    execute: async (rawInput, { toolCallId }): Promise<string> => {
      const progress = createToolProgress(toolCallId, feature.id)
      const { ensureServerAccessToken } = await import('@/modules/auth/tokenStore')
      const token = (await ensureServerAccessToken()) ?? ''
      if (!token) {
        const err =
          'Cloud access token not available. User must sign in to the cloud platform first. Call CloudLogin to prompt sign-in.'
        progress.error(err)
        return JSON.stringify({ ok: false, code: 'not_signed_in', error: err })
      }

      const flat = (rawInput ?? {}) as Record<string, unknown>
      const { inputs, params } = splitInputsAndParams(feature, flat)

      progress.start(`executing ${feature.id}`)
      try {
        const client = getSaasClient(token)
        const res = await client.ai.v3ToolExecute({
          feature: feature.id,
          inputs: inputs as Record<string, string>,
          params,
        })
        if (res.creditsConsumed > 0) {
          addCreditsConsumed(res.creditsConsumed)
        }
        progress.done(`${feature.displayName} done (${res.creditsConsumed} credits)`)
        return JSON.stringify({
          ok: true,
          feature: feature.id,
          creditsConsumed: res.creditsConsumed,
          variantId: res.variantId,
          data: res.data,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        progress.error(message)
        return JSON.stringify({ ok: false, feature: feature.id, error: message })
      }
    },
  })

  return { tool: toolInstance, def, feature }
}

function buildToolDescription(feature: V3SyncToolFeature): string {
  // Description is what the model sees *after* ToolSearch loads the schema.
  // Keep it dense: what it does + how inputs are shaped + credits + hints.
  const slotLines = feature.inputSlots.map((s) => {
    const key = s.key ?? s.role
    const label = s.label ? ` (${s.label})` : ''
    const req = s.required ? ' [required]' : ''
    return `- ${key}${label}${req}`
  })
  const paramLines = feature.paramsSchema.map((p) => {
    const opts =
      'options' in p && Array.isArray(p.options)
        ? ` [${p.options.map((o: { value: unknown }) => String(o.value)).join('|')}]`
        : ''
    const hint = p.hint ? ` — ${p.hint}` : ''
    return `- ${p.key} (${p.type})${opts}${hint}`
  })

  return [
    feature.description,
    '',
    `Credits: ${feature.creditsPerCall} per call (${feature.billingType}). Min membership: ${feature.minMembershipLevel}. Mode: ${feature.executionMode}.`,
    slotLines.length ? '\nInputs:' : '',
    ...slotLines,
    paramLines.length ? '\nParams (all optional):' : '',
    ...paramLines,
  ]
    .filter(Boolean)
    .join('\n')
}

// ---------------------------------------------------------------------------
// Public registry accessors — consumed by toolRegistry.ts
// ---------------------------------------------------------------------------

export function getCloudToolIds(): string[] {
  return [...CLOUD_TOOL_REGISTRY.keys()]
}

export function getCloudToolEntry(toolId: string): { tool: any } | undefined {
  const entry = CLOUD_TOOL_REGISTRY.get(toolId)
  return entry ? { tool: entry.tool } : undefined
}

export function getCloudToolDef(toolId: string): { parameters: any } | undefined {
  const entry = CLOUD_TOOL_REGISTRY.get(toolId)
  return entry ? { parameters: entry.def.parameters } : undefined
}

// ---------------------------------------------------------------------------
// Preload & refresh
// ---------------------------------------------------------------------------

let refreshTimer: NodeJS.Timeout | null = null
let loopStarted = false
let firstSuccessLogged = false

/**
 * Fetch tools capabilities once and rebuild the registry.
 * Returns true on success, false on any failure — caller can decide pacing.
 */
export async function refreshCloudTools(): Promise<boolean> {
  try {
    // v3ToolsCapabilities is unauthenticated for discovery; an empty access
    // token is fine. We only need the public capability list to register
    // tool defs — per-request auth happens at execute time.
    const client = getSaasClient('')
    const res = await client.ai.toolsCapabilities()
    const features = res.data.features.filter(isFlatToolFeature)

    const nextIds = new Set<string>()
    for (const feature of features) {
      if (shouldSkipFeature(feature.id)) {
        logger.info(
          `${LOG_PREFIX} skipping feature ${feature.id} — static implementation is configured`,
        )
        continue
      }
      const canonicalId = canonicalIdFor(feature.id)
      nextIds.add(canonicalId)
      CLOUD_TOOL_REGISTRY.set(canonicalId, buildCloudToolForFeature(feature, canonicalId))
    }
    // Drop any previously-registered features the server no longer advertises.
    for (const id of CLOUD_TOOL_REGISTRY.keys()) {
      if (!nextIds.has(id)) CLOUD_TOOL_REGISTRY.delete(id)
    }

    logger.info(`${LOG_PREFIX} registered ${nextIds.size} tool feature(s): ${[...nextIds].join(', ')}`)
    return true
  } catch (err) {
    logger.warn(
      `${LOG_PREFIX} refresh failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    return false
  }
}

/**
 * Start the preload + refresh loop.
 *
 * Pacing:
 *   - First refresh fires immediately.
 *   - While it keeps failing, retry every RETRY_INTERVAL_MS (1 min) so users
 *     don't sit in a 30-min dark window when SaaS is briefly down at boot.
 *   - Once a refresh succeeds, switch to the steady REFRESH_INTERVAL_MS
 *     (30 min) cadence. Later failures from the steady loop do NOT drop
 *     back to fast retry — the existing cached registry is still valid.
 */
export function startCloudToolsPreloadLoop(): void {
  if (loopStarted) {
    logger.debug(`${LOG_PREFIX} preload loop already started — ignoring duplicate call`)
    return
  }
  loopStarted = true
  logger.info(
    `${LOG_PREFIX} preload loop starting (retry=${RETRY_INTERVAL_MS / 1000}s until first success, then steady=${REFRESH_INTERVAL_MS / 1000 / 60}min)`,
  )

  const scheduleNext = (delayMs: number, reason: string) => {
    logger.debug(`${LOG_PREFIX} next refresh in ${delayMs / 1000}s (${reason})`)
    refreshTimer = setTimeout(() => {
      void tick()
    }, delayMs)
    if (refreshTimer && typeof refreshTimer.unref === 'function') {
      refreshTimer.unref()
    }
  }

  const tick = async () => {
    const success = await refreshCloudTools()
    if (success) {
      if (!firstSuccessLogged) {
        firstSuccessLogged = true
        logger.info(
          `${LOG_PREFIX} first successful refresh — switching to steady ${REFRESH_INTERVAL_MS / 1000 / 60}min cadence`,
        )
      }
      scheduleNext(REFRESH_INTERVAL_MS, 'steady cadence after success')
      return
    }
    // Registry is still empty (or unchanged after a transient error while
    // already warm). Retry every minute until we get a successful response.
    if (CLOUD_TOOL_REGISTRY.size === 0) {
      logger.warn(
        `${LOG_PREFIX} registry still empty after refresh — retrying in ${RETRY_INTERVAL_MS / 1000}s (AI cannot see cloud tools yet)`,
      )
      scheduleNext(RETRY_INTERVAL_MS, 'cold retry — registry empty')
    } else {
      // We still have a cached registry from an earlier successful load;
      // keep the steady cadence rather than hammering on transient 5xx.
      logger.warn(
        `${LOG_PREFIX} refresh failed but ${CLOUD_TOOL_REGISTRY.size} cached feature(s) remain — keeping steady cadence`,
      )
      scheduleNext(REFRESH_INTERVAL_MS, 'transient error — cache still warm')
    }
  }

  void tick()
}

// ---------------------------------------------------------------------------
// System prompt XML block — listing only, no params/inputs schema
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Build the <cloud_tools> system prompt block. Only emits tool id + credits
 * + mode + membership + a one-line description. Params/inputs schema is
 * intentionally omitted — the model loads it via ToolSearch on demand,
 * keeping the permanent prompt footprint tight.
 *
 * Returns an empty string when the registry is still cold (first fetch
 * pending or failed) so the block silently disappears rather than rendering
 * an empty shell.
 */
export function buildCloudToolsXmlBlock(): string {
  if (CLOUD_TOOL_REGISTRY.size === 0) return ''

  const lines: string[] = []
  lines.push('<cloud_tools>')
  lines.push(
    '  <usage>These tools are listed by name only — their parameter schemas are not loaded. Before calling any of them, run ToolSearch(names: "ToolA,ToolB") to fetch the schemas (batch multiple in one call), then invoke each tool normally with its own parameters. Calling one without loading its schema first will force a runtime rewrite that pollutes the message history.</usage>',
  )

  for (const [canonicalId, entry] of CLOUD_TOOL_REGISTRY.entries()) {
    const f = entry.feature
    lines.push(
      `  <tool id="${escapeXml(canonicalId)}" credits="${f.creditsPerCall}" mode="${f.executionMode}" membership="${escapeXml(f.minMembershipLevel)}">${escapeXml(
        f.description,
      )}</tool>`,
    )
  }
  lines.push('</cloud_tools>')
  return lines.join('\n')
}
