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

export type CloudMembershipTier = 'free' | 'lite' | 'pro' | 'premium'

/** Ordered membership tiers — index = privilege rank (0 = lowest). */
const TIER_ORDER: readonly CloudMembershipTier[] = ['free', 'lite', 'pro', 'premium'] as const

/** Normalize an unknown tier string into a known tier (unknown → 'free'). */
function normalizeTier(raw: string | undefined | null): CloudMembershipTier {
  const lowered = (raw ?? '').toLowerCase()
  if (lowered === 'premium') return 'premium'
  if (lowered === 'pro') return 'pro'
  if (lowered === 'lite') return 'lite'
  return 'free'
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
  name: 'cloud-media',
  description:
    '云端多媒体生成 — 通过云端 AI 平台调用图片/视频/音频生成能力。当用户要求"生成/创作图片、视频、音频"、"AI 作图"、"生成配音/音乐"时激活。**不用于**：已有文件处理（→media-ops）、文本任务（→cloud-text）。',
  icon: '☁️',
  colorIndex: 2,
  content: renderMediaContent(), // initial placeholder content (before first refresh)
}

export const cloudTextSkill: BuiltinSkill = {
  name: 'cloud-text',
  description:
    '云端文本能力 — 通过云端模型调用 OCR 文字识别、摘要、结构化抽取等文本能力。当用户要求"识别图片文字/总结长文本/结构化抽取"且需要云端模型时激活。',
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

Generate images, videos, and audio via the cloud AI platform. Each call consumes credits from the user's cloud account.

## Available Capabilities

${tierTableLines.join('\n')}

## Membership Tiers

Cloud capabilities are gated by the user's membership level:

| Tier | Description |
|------|-------------|
| \`free\` | Default for new users. Basic image/text features. |
| \`lite\` | Small monthly plan. Adds faster models and more credits. |
| \`pro\` | Professional plan. Unlocks advanced image generation, basic video, high-quality audio. |
| \`premium\` | Top tier. Unlocks highest-quality video models, premium-only features. |

Tier order (low → high): \`free < lite < pro < premium\`. A variant tagged \`pro\` is accessible to pro AND premium users.

**Always check the user's current tier before invoking expensive variants.** \`CloudCapBrowse\` returns \`userTier\` and \`userCredits\` in every response — read these fields first.

**If the user's tier is insufficient** for the variant they want, do NOT call \`CloudModelGenerate\` — it will fail at the cloud backend and still burn user trust. Instead:
1. Politely explain the variant requires a higher tier (name the tier explicitly).
2. Suggest a free/lower-tier alternative variant from the same feature if \`CloudCapBrowse\` returned one.
3. If no alternative, ask whether they want to upgrade (do NOT recommend specific pricing — let them find it in settings).

## Tool Activation (REQUIRED first step)

These tools are NOT in the default toolset. **Before calling any of them**, activate the full set via ToolSearch:

\`\`\`
ToolSearch(names: "CloudCapBrowse,CloudCapDetail,CloudModelGenerate,CloudTask,CloudTaskCancel")
\`\`\`

You only need to do this once per conversation.

## Workflow

### Step 1 — Discover (CloudCapBrowse)

\`\`\`
CloudCapBrowse({ category: ${categoryArg} })
\`\`\`

Returns a list of features in that category, each with its top 3 variants (id, name, tag). Skim the tags to pick a variant that matches the user's intent.

Omit \`category\` to see everything at once.

### Step 2 — (Optional) Detail (CloudCapDetail)

If the top-3 summary from Browse isn't enough — user wants an unusual variant, or you need exact parameter names — fetch the full schema:

\`\`\`
CloudCapDetail({ variantId: "OL-IG-003" })
\`\`\`

**Skip this step when the Browse summary is sufficient.** Most common requests don't need Detail.

### Step 3 — Generate (CloudModelGenerate)

\`\`\`
CloudModelGenerate({
  feature: "text-to-image",
  variant: "OL-IG-003",
  inputs: { prompt: "..." },
  params: { aspectRatio: "16:9" }
})
\`\`\`

- Default mode **blocks until the task completes** (up to 10 min) and returns \`{ resultUrls, creditsConsumed }\`.
- For long-running video jobs, set \`waitForCompletion: false\` to return immediately with a \`taskId\`, then poll with \`CloudTask({ taskId })\`.

### Step 4 — (Async mode only) Poll or Cancel

\`\`\`
CloudTask({ taskId })    // check status / retrieve resultUrls
CloudTaskCancel({ taskId })  // abort a running task
\`\`\`

## Parameter Semantics

- **\`inputs\`** — content payloads. Keys come from the variant's input schema.
  Common fields: \`prompt\` (text), \`image\` (URL), \`referenceImage\` (URL), \`audio\` (URL).
- **\`params\`** — option controls. Keys come from the variant's param schema.
  Common fields: \`aspectRatio\`, \`steps\`, \`style\`, \`quality\`, \`duration\`.

When unsure about exact field names, call \`CloudCapDetail\` to see the schema.

## Guidance

- **Check credits before expensive operations.** Video generation can cost 50-500+ credits. Top variants from Browse include \`creditsPerCall\`; warn the user before kicking off heavy jobs.
- **Match user style keywords to variant tags.** "宫崎骏"/"anime"/"动漫" → anime/stylized variants. "写实"/"realistic" → photorealistic variants.
- **Prefer cheap variants for drafts.** When the user is still iterating on ideas, use low-credit variants for previews. Upgrade only after user confirms the direction.
- **Present resultUrls directly.** The returned URLs are already public-accessible; don't try to download or re-fetch them.
- **Handle errors gracefully.** The tool returns \`Error: ...\` on failure. Retry once if the error looks transient (network/rate-limit); report to user otherwise.
- **Don't guess variant IDs.** If you don't see a variant matching the user's request in Browse, tell the user rather than inventing an ID.

## Example

User: "帮我生成一张宫崎骏风格的森林图"

\`\`\`
1. ToolSearch(names: "CloudCapBrowse,CloudCapDetail,CloudModelGenerate,CloudTask,CloudTaskCancel")

2. CloudCapBrowse({ category: "image" })
   → finds feature "text-to-image" with variant tagged "anime / 动漫"
   → reads userTier/userCredits and picks a variant where accessible === true

3. CloudModelGenerate({
     feature: "text-to-image",
     variant: "<the-anime-variant-id>",
     inputs: { prompt: "宫崎骏风格的森林，柔和光线，细致纹理" },
     params: { aspectRatio: "16:9" }
   })
   → returns { files: [...], creditsConsumed: N }

4. Present the saved file path or URL to the user.
\`\`\`
`
}

function renderTextContent(): string {
  const textCat = state.mediaCategories.find((c) => c.category === 'text')
  const status = textCat
    ? `available — ${textCat.featureCount} features, ${textCat.variantCount} variants`
    : '(probing on first use…)'

  return `# Cloud Text Capabilities

Text-in / text-out operations via the cloud AI platform (OCR text extraction, summarization, structured extraction, etc.).

**Current status**: ${status}

> **Translation is NOT in this skill.** The main chat model handles translation directly at zero credit cost. Do not look for a translate variant via Browse — it is deliberately filtered out. If the user asks for translation, translate inline in your reply.

## Tool Activation (REQUIRED first step)

\`\`\`
ToolSearch(names: "CloudCapBrowse,CloudCapDetail,CloudTextGenerate")
\`\`\`

## Workflow

### Step 1 — Discover

\`\`\`
CloudCapBrowse({ category: "text" })
\`\`\`

Returns available text features (e.g., ocr-text, summarize) with top variants. Translate features are not returned.

### Step 2 — (Optional) Detail

\`\`\`
CloudCapDetail({ variantId: "<id>" })
\`\`\`

Only if the Browse summary is insufficient.

### Step 3 — Invoke

\`\`\`
CloudTextGenerate({
  feature: "<feature-id>",
  variant: "<variantId>",
  inputs: { text: "..." },
  params: { ... }
})
\`\`\`

**Synchronous** — returns \`{ text, creditsConsumed }\` directly. No task polling.

## When to Use

- **OCR text** — when you have an image URL with text the user wants extracted (\`inputs: { image: "<url>" }\`). The chat model can read small inline images; use this only for batch extraction or high-accuracy needs.
- **Summarization** — when the user wants a cloud summarizer for very long text that would be expensive to send through the main chat model.
- **Structured extraction** — when a dedicated cloud extraction variant exists for the user's domain.

**Don't use** for:
- **Translation** — handled by the chat model, translate inline.
- **Casual summary of short content** — chat model handles it for free.

## Guidance

- **Small text blocks**: prefer the chat model directly (zero credit cost).
- **Large / structured text**: CloudTextGenerate is cheaper per token than heavy chat models.
- **Pass exact text in \`inputs.text\`** — don't paraphrase or truncate before passing.
- **Credits are consumed per call**, not per token — batch where possible.
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
    type FeatureInfo = { feature: string; category: string; variantIds: string[] }
    const featureInfos: FeatureInfo[] = []
    for (const feature of overview.data) {
      // 逻辑：与 cloudTools.ts 的 Browse 过滤保持一致，跳过隐藏 feature，
      // 避免 skill 里宣称的数量和 AI 实际通过 Browse 看到的不一致。
      if (isHiddenFeature(feature.feature)) continue
      featureInfos.push({
        feature: feature.feature,
        category: feature.category,
        variantIds: feature.variants.map((v) => v.id),
      })
    }

    // 2) Fan out capabilitiesDetail for each variant, batched by concurrency.
    const allVariantIds = featureInfos.flatMap((f) => f.variantIds)
    const nextVariantDetails = new Map<string, CachedVariantDetail>()
    for (let i = 0; i < allVariantIds.length; i += DETAIL_CONCURRENCY) {
      const batch = allVariantIds.slice(i, i + DETAIL_CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map((id) => client.ai.capabilitiesDetail(id)),
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
          tierBreakdown: { free: 0, lite: 0, pro: 0, premium: 0 },
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
