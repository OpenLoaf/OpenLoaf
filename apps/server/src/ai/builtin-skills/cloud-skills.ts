/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Dynamic builtin skills for cloud capabilities.
 *
 * Two skills are exposed:
 *   cloud-media — image/video/audio generation via CloudCapBrowse/Detail/ModelGenerate
 *   cloud-text  — text capabilities (OCR/summarize/extract) via CloudTextGenerate
 *
 * Their *names* and *descriptions* are static (so the system-prompt skill catalog
 * is stable), but their *content* is re-rendered whenever the cloud capability
 * surface changes. Content reflects currently available categories and feature
 * counts without enumerating individual variants — variants stay a runtime
 * discovery step via CloudCapBrowse.
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

/** Per-variant cached metadata (populated from capabilitiesDetail). */
export type CachedVariantDetail = {
  variantId: string
  variantName: string
  featureId: string
  category: string
  minMembershipLevel: CloudMembershipTier
  creditsPerCall: number
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

/** Retrieve cached variant metadata by id (may be undefined before first refresh). */
export function getCachedVariantDetail(variantId: string): CachedVariantDetail | undefined {
  return state.variantDetails.get(variantId)
}

/**
 * All cached variant details. Used by named cloud tools (cloudImageGenerate,
 * cloudVideoGenerate, …) to pick an accessible variant for a requested
 * capability without the AI having to call Browse+Detail first.
 */
export function getAllCachedVariantDetails(): readonly CachedVariantDetail[] {
  return [...state.variantDetails.values()]
}

/** True once the first refresh has populated variant cache. */
export function cloudSkillsInitialized(): boolean {
  return state.initialized
}

/** Get a snapshot of category summaries including tier breakdown. */
export function getCachedCategorySummaries(): readonly CategorySummary[] {
  return state.mediaCategories
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
    '当用户要求从零生成全新的图片、插画、海报、视频片段、配音、音乐、音效时触发。典型说法"AI 画一张"、"生成一张宫崎骏风格森林图"、"text to image"。**不用于**：已有媒体文件的处理（→media-ops-skill）、在画布里创建白板（→canvas-ops-skill）、OCR 或文字任务（→cloud-text-skill）。',
  icon: '☁️',
  colorIndex: 2,
  content: renderMediaContent(), // initial placeholder content (before first refresh)
}

export const cloudTextSkill: BuiltinSkill = {
  name: 'cloud-text-skill',
  description:
    '当用户要对图片 / 扫描件做 OCR 文字识别，或从大段文本批量 / 高精度抽取结构化字段，或对超长文本走一次专用摘要时触发。典型说法"识别这张图上的文字"、"OCR"、"extract fields from this"。**不用于**：翻译（主对话模型直接处理）、对话里已粘贴的短文本总结（→直接回答）、PDF 里可直接提取的电子文本（→pdf-word-excel-pptx-skill）。',
  icon: '📝',
  colorIndex: 3,
  content: renderTextContent(),
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

  const categoryArg = mediaCats.length
    ? mediaCats.map((c) => `"${c.category}"`).join(' | ')
    : '"image" | "video" | "audio"'

  return `# Cloud Media Generation

Generate images, videos, and audio via the cloud AI platform. Each call consumes credits.

## Available Capabilities

${tierTableLines.join('\n')}

## 首选路径 — 命名工具（单轮完成）

日常生图/改图直接调命名工具，**不需要** Browse / Detail。工具内部会自动挑选一个可用的 variant 并按正确格式组装 inputs。

\`\`\`
CloudImageGenerate({ prompt: "森林场景", aspectRatio?: "16:9", style?: "watercolor", referenceImage?: { url: "..." } | "https://..." | { path: "\${CURRENT_CHAT_DIR}/img.png" } })

CloudImageEdit({ image: { path: "\${CURRENT_CHAT_DIR}/cat.png" } | { url: "..." } | "https://...", instruction: "在猫咪旁边加一只老鼠", mask?: "<可选掩码>" })
\`\`\`

- **生图**（"画一张" / "生成图片" / "text to image"）→ \`CloudImageGenerate\`
- **改图**（"在 X 旁边加 Y" / "把背景换成..." / "去掉水印" / "image edit"）→ \`CloudImageEdit\`
- 若命名工具返回 \`code: "no_variant_available"\` 或用户明确要求特定模型 → 回退到下方进阶路径。

> **按需加载**：\`CloudImageGenerate\` / \`CloudImageEdit\` 调用前须先 \`ToolSearch(names: "工具名")\` 加载 schema。

## 进阶路径 — Browse → Detail → Generate

用户点名某个 variant、或要视频 / TTS / 图片编辑 / OCR 等尚未命名工具化的能力时使用：

### Step 1 — Browse

\`\`\`
CloudCapBrowse({ category: ${categoryArg} })
\`\`\`

返回 feature 列表。**只选 \`accessible === true\` 的 variant。**

### Step 2 — Detail（必须）

\`\`\`
CloudCapDetail({ variantId: "<id>", featureId: "<feature>" })
\`\`\`

返回 \`inputSlots[]\` 和 \`paramsSchema[]\`。**不可跳过** — 不同 variant 的字段名差异很大（如视频需 \`startImage\`、TTS 需 \`text\`），跳过几乎必定失败。

### Step 3 — Generate

\`\`\`
CloudModelGenerate({
  feature: "<featureId>",
  variant: "<variantId>",
  inputs: { ... },   // 按 inputSlots 填写
  params: { ... }    // 按 paramsSchema 填写
})
\`\`\`

**输入格式规则**（与画布一致）：
- **文本 slot**（如 prompt）→ 纯字符串
- **媒体 slot**（如 image / startImage / audio）→ \`{ url: "https://..." }\` 或 \`{ path: "\${CURRENT_CHAT_DIR}/img.png" }\`。本地路径会自动上传到 CDN。
- **不要猜字段名** — 严格使用 Detail 返回的 slot key。

默认同步等待完成（最长 10 分钟）。长任务可设 \`waitForCompletion: false\`，之后用 \`CloudTask({ taskId })\` 轮询。

### Step 4 — （异步模式）Poll / Cancel

\`\`\`
CloudTask({ taskId })         // 查询状态 / 获取结果
CloudTaskCancel({ taskId })   // 取消任务
\`\`\`

## 关键约束

- **accessible 为 false 的 variant 不要调** — 会被后端拒绝。提示用户所需会员等级。
- **视频类 variant 通常需要首帧图片**（\`startImage\` slot），不传会 502。如果用户没有图片，先用 \`CloudImageGenerate\` 生成一张，再传给视频 variant。
- **限制并发** — 同一 variant 不超过 2 个并行 CloudModelGenerate，超过可能 503。
- **昂贵操作先确认** — 视频可消耗 50-500+ credits，先告知用户。
`
}

function renderTextContent(): string {
  const textCat = state.mediaCategories.find((c) => c.category === 'text')
  const status = textCat
    ? `available — ${textCat.featureCount} features, ${textCat.variantCount} variants`
    : '(probing on first use…)'

  return `# Cloud Text Capabilities

Text-in / text-out operations via the cloud AI platform (OCR, summarization, structured extraction).

**Current status**: ${status}

> **翻译不在此技能范围。** 主对话模型直接翻译，零 credit 消耗。Browse 已过滤 translate 类 feature。

> **工具按需加载**：\`CloudCapBrowse\`、\`CloudCapDetail\`、\`CloudTextGenerate\` 调用前须先 \`ToolSearch(names: "工具名")\` 加载 schema。

## Workflow

1. \`CloudCapBrowse({ category: "text" })\` — 发现可用 feature 和 variant
2. \`CloudCapDetail({ variantId, featureId })\` — 获取输入 schema（必须）
3. \`CloudTextGenerate({ feature, variant, inputs, params })\` — 同步调用，直接返回 \`{ text, creditsConsumed }\`

## 使用场景

- **OCR** — 图片中的文字提取（\`inputs: { image: { url: "..." } }\`）
- **长文摘要** — 超长文本走云端摘要比对话模型便宜
- **结构化抽取** — 有专用 variant 时使用

**不使用**：翻译（对话模型免费）、短文本摘要（对话模型直接处理）。
`
}

// ---------------------------------------------------------------------------
// Refresh API
// ---------------------------------------------------------------------------

/** Mark both skills dirty and re-render from current state. */
function rerenderSkillContent(): void {
  cloudMediaSkill.content = renderMediaContent()
  cloudTextSkill.content = renderTextContent()
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
        nextVariantDetails.set(d.variantId, {
          variantId: d.variantId,
          variantName: d.variantName,
          featureId: d.feature,
          category: d.category,
          minMembershipLevel: normalizeTier(d.minMembershipLevel),
          creditsPerCall: d.creditsPerCall,
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
