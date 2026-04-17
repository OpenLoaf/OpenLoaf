/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Dynamic builtin skill for cloud capabilities.
 *
 * A single `cloud-media-skill` entry covers every paid cloud tool — generation
 * (image / video / tts) plus understanding (image caption / speech recognize).
 * The skill's *name* and *description* are static (so the system-prompt skill
 * catalog is stable), but its *content* is re-rendered whenever the cloud
 * capability surface changes. Content reflects currently available categories
 * and per-tier variant counts without enumerating individual variants —
 * variants are injected into each named tool's description at activation time
 * via the `<system-tag type="cloud-variants">` block.
 */
import type { BuiltinSkill } from './types'
import { getSaasClient } from '@/modules/saas/client'
import { logger } from '@/common/logger'

/**
 * Features hidden from skill listings and capability counts.
 * Must stay in sync with HIDDEN_FEATURE_PATTERNS in cloudTools.ts — both
 * filters together ensure the LLM never sees these features via
 * Browse/Detail or skill content. See cloudTools.ts for the rationale
 * (translate is covered by the chat model for free).
 */
const HIDDEN_FEATURE_PATTERNS = ['translate'] as const

function isHiddenFeature(featureId: string): boolean {
  const lowered = featureId.toLowerCase()
  return HIDDEN_FEATURE_PATTERNS.some((pattern) => lowered.includes(pattern))
}

// ---------------------------------------------------------------------------
// Dynamic state populated from ai.capabilitiesOverview + capabilitiesDetail
// ---------------------------------------------------------------------------

export type CloudMembershipTier = 'free' | 'lite' | 'pro' | 'premium' | 'infinity'

/** Ordered membership tiers — index = privilege rank (0 = lowest, infinity = internal/staff). */
const TIER_ORDER: readonly CloudMembershipTier[] = ['free', 'lite', 'pro', 'premium', 'infinity'] as const

/** Normalize an unknown tier string into a known tier (unknown → 'free'). */
export function normalizeTier(raw: string | undefined | null): CloudMembershipTier {
  const lowered = (raw ?? '').toLowerCase()
  if (lowered === 'infinity') return 'infinity'
  if (lowered === 'premium') return 'premium'
  if (lowered === 'pro') return 'pro'
  if (lowered === 'lite') return 'lite'
  return 'free'
}

/** Internal/staff users get unrestricted access regardless of billing tier. */
export function isInternalTier(tier: CloudMembershipTier): boolean {
  return tier === 'infinity'
}

/**
 * Resolve a user's effective tier for access gating.
 *
 * Internal/staff users (isInternal=true from SaaS) are promoted to `infinity`
 * regardless of their billing membershipLevel — they bypass all tier checks.
 */
export function resolveEffectiveTier(user: {
  membershipLevel?: string | null
  isInternal?: boolean | null
}): CloudMembershipTier {
  if (user.isInternal) return 'infinity'
  return normalizeTier(user.membershipLevel)
}

/** Returns true when `userTier` is equal to or higher than `requiredTier`. */
export function hasTierAccess(userTier: CloudMembershipTier, requiredTier: CloudMembershipTier): boolean {
  return TIER_ORDER.indexOf(userTier) >= TIER_ORDER.indexOf(requiredTier)
}

/** Single input slot declaration from SaaS capabilitiesDetail. */
export type CachedInputSlot = {
  /** 同 role，SaaS 侧 slot key。客户端必须用这个名字放进 inputs[role]。 */
  role: string
  /** Input 类型：text 以扁平字符串发送；image/audio/video/file 必须包 {url:string}。 */
  accept: 'text' | 'image' | 'audio' | 'video' | 'file'
  required?: boolean
}

/** Per-variant cached metadata (populated from capabilitiesDetail). */
export type CachedVariantDetail = {
  variantId: string
  variantName: string
  featureId: string
  category: string
  minMembershipLevel: CloudMembershipTier
  creditsPerCall: number
  /**
   * Input slot declarations — used to map client-side logical keys
   * (image/audio/prompt/…) to the actual SaaS field names (source/reference/…)
   * and to coerce value shapes (media slots wrap strings as {url}).
   * 老服务端不返回 slots 时为 undefined，调用方应按 legacy 行为 passthrough。
   */
  inputSlots?: readonly CachedInputSlot[]
  /**
   * 执行模式（来自 invocation.executionMode）：
   *   - 'streaming' → SaaS 只返 SSE，必须用 v3TextGenerateStream + 流式消费
   *   - 'sync'      → SaaS 返 JSON，用 v3TextGenerate
   *   - 'task'      → 异步长任务，走 v3Generate + 轮询
   * 未知/缺失时默认按 sync 处理。
   */
  executionMode?: 'streaming' | 'sync' | 'task'
}

type CategorySummary = {
  category: string
  featureCount: number
  variantCount: number
  /** Per-tier variant counts (free/lite/pro/premium). */
  tierBreakdown: Record<CloudMembershipTier, number>
  /** Example feature names that require pro or above (up to 3). */
  proFeatureExamples: string[]
}

const state = {
  /** Categories currently available on the cloud backend. Empty until first refresh. */
  mediaCategories: [] as CategorySummary[],
  /** Cached variant metadata (from capabilitiesDetail). Keyed by variantId. */
  variantDetails: new Map<string, CachedVariantDetail>(),
  /** Whether a refresh has completed at least once. */
  initialized: false,
  /** Last refresh timestamp (ms). */
  refreshedAt: 0,
}

/**
 * All cached variant details. Used by named cloud tools (cloudImageGenerate,
 * cloudVideoGenerate, …) to pick an accessible variant for a requested
 * capability.
 */
export function getAllCachedVariantDetails(): readonly CachedVariantDetail[] {
  return [...state.variantDetails.values()]
}

/** True once the first refresh has populated variant cache. */
export function cloudSkillsInitialized(): boolean {
  return state.initialized
}

// ---------------------------------------------------------------------------
// Skill entries (mutable `content`, re-rendered by refreshCloudSkills)
// ---------------------------------------------------------------------------

/**
 * Both entries are exported as mutable objects. `content` is rewritten in place
 * by `refreshCloudSkills()`, and all BUILTIN_SKILLS consumers iterate the array
 * per-request so they pick up the latest content automatically.
 */
export const cloudMediaSkill: BuiltinSkill = {
  name: 'cloud-media-skill',
  description:
    '当用户要求生成或处理云端 AI 媒体（图片/视频/语音），或理解媒体内容（OCR/图片理解/语音转写）时触发。典型："画一张"、"生成视频"、"合成语音"、"识别文字"、"语音转文字"、"看看这张图"。不用于：翻译（对话模型免费）、已粘贴的短文本处理（对话模型直接处理）。',
  icon: '☁️',
  colorIndex: 2,
  content: renderMediaContent(), // initial placeholder content (before first refresh)
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function formatTierBreakdown(cat: CategorySummary): string {
  // 逻辑：只列出有 >0 个 variant 的 tier，让表达简洁。
  const parts: string[] = []
  const { free, lite, pro, premium } = cat.tierBreakdown
  if (free > 0) parts.push(`${free} free`)
  if (lite > 0) parts.push(`${lite} lite`)
  if (pro > 0) parts.push(`${pro} pro`)
  if (premium > 0) parts.push(`${premium} premium`)
  return parts.length > 0 ? parts.join(' / ') : '—'
}

function renderMediaContent(): string {
  const mediaCats = state.mediaCategories.filter((c) =>
    ['image', 'video', 'audio'].includes(c.category),
  )

  // Per-category tier table (bullet list, keeps markdown width sane).
  const tierTableLines = mediaCats.length
    ? mediaCats.map((c) => {
        const exampleHint =
          c.proFeatureExamples.length > 0
            ? ` · pro+ examples: ${c.proFeatureExamples.join(', ')}`
            : ''
        return `- **${c.category}** — ${c.featureCount} features, ${c.variantCount} variants (${formatTierBreakdown(c)})${exampleHint}`
      })
    : ['- (probing on first use…)']

  return `# Cloud Media Generation

通过云端 AI 平台生图、改图、生视频、合成语音等。每次调用消耗用户 credits。

## Available Capabilities

${tierTableLines.join('\n')}

## 用哪个工具

| 场景 | 工具 |
|------|------|
| 生图 / "画一张" / text-to-image | \`CloudImageGenerate\` |
| 改图 / "加只老鼠" / "换背景" / inpaint / outpaint | \`CloudImageEdit\` |
| 生视频 / image-to-video（需要首帧图） | \`CloudVideoGenerate\` |
| 文生语音 / TTS / 配音 | \`CloudTTS\` |
| 语音转文字 / ASR / 转写 | \`CloudSpeechRecognize\` |
| 图片理解 / OCR / VQA / 看图 | \`CloudImageUnderstand\` |

每个工具内部自动挑选当前 tier 可用、credits 最低的 variant。用户明确要求某个模型时，传 \`modelHint\`（variant id 如 "OL-IG-003"，或 name 片段如 "Qwen"）。工具 description 里的 \`<system-tag type="cloud-variants">\` 会列出当前目录。

- 媒体输入接受 URL 字符串、\`{ url: "..." }\` 或 \`{ path: "\${CURRENT_CHAT_DIR}/img.png" }\`（本地路径自动上传 CDN）。
- 生成类工具（Image/Video/TTS）成功后**前端 UI 自动展示媒体**，一句确认文字即可，不要 Read 文件。
- 理解类工具（ImageUnderstand/SpeechRecognize）返回文本结果，直接转述给用户。

> 调用前须先 \`ToolSearch(names: "CloudXxx")\` 加载 schema。

## 异步任务（视频）

视频任务可能超过 10 分钟同步等待上限。同步超时会返回 \`{ mode: 'timeout', taskId }\`，后续用 \`CloudTask({ taskId })\` 轮询、\`CloudTaskCancel({ taskId })\` 取消。credits 在任务完成时才扣。

## 关键约束

- **CloudVideoGenerate 需首帧图**（\`startImage\`）：用户没图时，先用 \`CloudImageGenerate\` 生成一张再传入。
- **限制并发** — 同一 variant 不要同时发起 >2 个生成任务。
- **昂贵操作先确认** — 视频可消耗 50-500+ credits，调用前告知用户预估消耗。
`
}

// ---------------------------------------------------------------------------
// Refresh API
// ---------------------------------------------------------------------------

/** Re-render the cloud skill content after a capability refresh. */
function rerenderSkillContent(): void {
  cloudMediaSkill.content = renderMediaContent()
}

/** Concurrency limit for capabilitiesDetail fanout. */
const DETAIL_CONCURRENCY = 6

/**
 * Fetch variant detail via raw HTTP so we can pass `?feature=<id>` to
 * disambiguate shared variants (e.g. `OL-TX-006` is mounted on chat /
 * imageCaption / translate / videoCaption, each with different inputSlots).
 *
 * SDK v0.1.46 doesn't expose the featureId parameter yet; when this repo
 * upgrades to @openloaf-saas/sdk ^0.2.0 this helper can be replaced with
 * `client.ai.capabilitiesDetail(variantId, featureId)`.
 *
 * Returns `{ data }` on success, `null` on any failure — callers are expected
 * to tolerate missing detail (tier breakdown falls back to 'free').
 */
async function fetchCapabilityDetailWithFeature(
  variantId: string,
  featureId: string,
): Promise<{ data: CloudDetailPayload } | null> {
  try {
    const { getSaasBaseUrl } = await import('@/modules/saas/core/config')
    const url = `${getSaasBaseUrl()}/api/ai/v3/capabilities/detail/${encodeURIComponent(variantId)}?feature=${encodeURIComponent(featureId)}`
    const resp = await fetch(url)
    if (!resp.ok) return null
    const payload = (await resp.json().catch(() => null)) as
      | { success?: boolean; data?: CloudDetailPayload }
      | null
    if (!payload?.success || !payload.data) return null
    return { data: payload.data }
  } catch {
    return null
  }
}

/** Minimal shape of the `/capabilities/detail` response used by refreshCloudSkills. */
type CloudDetailPayload = {
  variantId: string
  variantName: string
  feature: string
  category: string
  minMembershipLevel: string
  creditsPerCall: number
  /**
   * Slot declarations — SaaS `/capabilities/detail` 字段名是 `inputs`（不是
   * `inputSlots`，那是 SDK 内部某个 schema 的别名）。部分老版本可能缺该字段。
   */
  inputs?: Array<{
    role: string
    accept: string
    required?: boolean
  }>
  /** Invocation info — 提供 executionMode 让客户端决定用 sync/stream/task API。 */
  invocation?: {
    executionMode?: string
    endpoint?: string
    method?: string
  }
}

/**
 * Refresh dynamic state from ai.capabilitiesOverview + per-variant
 * capabilitiesDetail (both public endpoints, no token).
 *
 * Also fans out capabilitiesDetail to capture per-variant tier/credits and
 * build the tier breakdown shown in the skill markdown. Typical cost is
 * 60-100 detail calls per refresh (once every 30 min), batched 6 at a time.
 *
 * Silently swallows errors — on failure, skills retain whatever content
 * they had before, and the next refresh cycle will try again.
 */
export async function refreshCloudSkills(): Promise<void> {
  try {
    const client = getSaasClient()
    const overview = await client.ai.capabilitiesOverview()

    // 1) Collect all visible (feature, variantId) pairs first.
    //
    // Important: tool-category features (webSearch, webSearchImage, …) don't
    // expose real variants — the overview returns self-referential entries
    // whose variant ids equal the feature id. Hitting
    // `/capabilities/detail/:id` for them returns 404 because no
    // AiMediaVariant row exists. Skip the whole category here to avoid log
    // noise and wasted round-trips.
    type FeatureInfo = { feature: string; category: string; variantIds: string[] }
    const featureInfos: FeatureInfo[] = []
    for (const feature of overview.data) {
      // 逻辑：与 cloudTools.ts 的 Browse 过滤保持一致，跳过隐藏 feature，
      // 避免 skill 里宣称的数量和 AI 实际通过 Browse 看到的不一致。
      if (isHiddenFeature(feature.feature)) continue
      if (feature.category === 'tools') continue
      featureInfos.push({
        feature: feature.feature,
        category: feature.category,
        variantIds: feature.variants.map((v) => v.id),
      })
    }

    // 2) Fan out capabilitiesDetail — dedup by variantId but pair each unique
    // variant with the first feature it was seen under. Same variantId mounted
    // on multiple features (e.g. OL-TX-006 on chat / imageCaption / translate
    // / videoCaption) returns identical tier/credits regardless of feature, so
    // one fetch per unique variant is enough; the featureId is only required
    // to make the server's ambiguity check pass.
    const uniqueVariantFeature = new Map<string /* variantId */, string /* featureId */>()
    for (const fi of featureInfos) {
      for (const vid of fi.variantIds) {
        if (!uniqueVariantFeature.has(vid)) {
          uniqueVariantFeature.set(vid, fi.feature)
        }
      }
    }

    const detailEntries = Array.from(uniqueVariantFeature.entries())
    const nextVariantDetails = new Map<string, CachedVariantDetail>()
    for (let i = 0; i < detailEntries.length; i += DETAIL_CONCURRENCY) {
      const batch = detailEntries.slice(i, i + DETAIL_CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map(([variantId, featureId]) =>
          fetchCapabilityDetailWithFeature(variantId, featureId),
        ),
      )
      for (const r of results) {
        if (r.status !== 'fulfilled' || !r.value?.data) continue
        const d = r.value.data
        const slots = Array.isArray(d.inputs)
          ? (d.inputs
              .filter((s) => s && typeof s.role === 'string' && typeof s.accept === 'string')
              .map((s) => ({
                role: s.role,
                accept: (['text', 'image', 'audio', 'video', 'file'] as const).includes(
                  s.accept as CachedInputSlot['accept'],
                )
                  ? (s.accept as CachedInputSlot['accept'])
                  : 'text',
                required: s.required,
              })) as CachedInputSlot[])
          : undefined
        const modeRaw = d.invocation?.executionMode
        const executionMode =
          modeRaw === 'streaming' || modeRaw === 'sync' || modeRaw === 'task'
            ? (modeRaw as CachedVariantDetail['executionMode'])
            : undefined
        nextVariantDetails.set(d.variantId, {
          variantId: d.variantId,
          variantName: d.variantName,
          featureId: d.feature,
          category: d.category,
          minMembershipLevel: normalizeTier(d.minMembershipLevel),
          creditsPerCall: d.creditsPerCall,
          inputSlots: slots,
          executionMode,
        })
      }
    }

    // 3) Build per-category summaries with tier breakdown.
    const summaryByCategory = new Map<string, CategorySummary>()
    for (const fi of featureInfos) {
      let summary = summaryByCategory.get(fi.category)
      if (!summary) {
        summary = {
          category: fi.category,
          featureCount: 0,
          variantCount: 0,
          tierBreakdown: { free: 0, lite: 0, pro: 0, premium: 0, infinity: 0 },
          proFeatureExamples: [],
        }
        summaryByCategory.set(fi.category, summary)
      }
      summary.featureCount += 1
      summary.variantCount += fi.variantIds.length
      // Tally tier distribution from detail cache; variants missing detail
      // (fetch failed) default to "free" so they don't vanish from the UI.
      let featureRequiresProOrAbove = false
      for (const vid of fi.variantIds) {
        const detail = nextVariantDetails.get(vid)
        const tier = detail?.minMembershipLevel ?? 'free'
        summary.tierBreakdown[tier] += 1
        if (tier === 'pro' || tier === 'premium') featureRequiresProOrAbove = true
      }
      if (featureRequiresProOrAbove && summary.proFeatureExamples.length < 3) {
        summary.proFeatureExamples.push(fi.feature)
      }
    }

    state.mediaCategories = [...summaryByCategory.values()]
    state.variantDetails = nextVariantDetails
    state.initialized = true
    state.refreshedAt = Date.now()
    rerenderSkillContent()

    logger.info(
      {
        categories: state.mediaCategories.map((c) => c.category),
        variants: state.variantDetails.size,
      },
      '[cloud-skills] refreshed capability snapshot',
    )
  } catch (err) {
    // If we've never initialized, leave content as "probing…" so LoadSkill still
    // returns something useful. If we had state already, keep the stale snapshot.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      '[cloud-skills] refresh failed; keeping previous snapshot',
    )
  }
}

/** Periodic refresh loop (30 min). */
const REFRESH_INTERVAL_MS = 30 * 60 * 1000
let refreshTimer: ReturnType<typeof setInterval> | null = null

export function startCloudSkillRefreshLoop(): void {
  if (refreshTimer) return
  queueMicrotask(() => {
    void refreshCloudSkills()
  })
  refreshTimer = setInterval(() => {
    void refreshCloudSkills()
  }, REFRESH_INTERVAL_MS)
  if (typeof refreshTimer.unref === 'function') {
    refreshTimer.unref()
  }
}

export function stopCloudSkillRefreshLoop(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}
