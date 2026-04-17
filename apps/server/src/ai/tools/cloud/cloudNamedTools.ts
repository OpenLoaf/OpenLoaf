/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Named cloud tools — flat semantic entry points. Each tool resolves to a
 * single SaaS feature (imageGenerate / imageEdit / videoGenerate / tts /
 * speechToText / imageCaption), auto-picks the cheapest accessible variant
 * from the cached capability snapshot, and delegates to the shared pipeline
 * in `cloudTools.ts` (`runV3GenerateAndSave` for media, `runV3TextGenerate`
 * for text-returning tools).
 *
 * Design rules:
 *   - A named tool is registered unconditionally. If the cloud backend
 *     doesn't expose any matching variant it returns a friendly error.
 *   - Parameter names follow human semantics (prompt / startImage / voice /
 *     modelHint). They map to the SaaS v3 payload's `inputs` / `params`
 *     using reasonable defaults — mismatches are silently ignored by the
 *     backend rather than breaking the call.
 */
import { tool, zodSchema } from 'ai'
import {
  cloudImageEditToolDef,
  cloudImageGenerateToolDef,
  cloudImageUnderstandToolDef,
  cloudSpeechRecognizeToolDef,
  cloudTTSToolDef,
  cloudVideoGenerateToolDef,
} from '@openloaf/api/types/tools/cloud'
import { createToolProgress } from '@/ai/tools/toolProgress'
import {
  getAllCachedVariantDetails,
  cloudSkillsInitialized,
  refreshCloudSkills,
  type CachedVariantDetail,
} from '@/ai/builtin-skills/cloud-skills'
import { runV3GenerateAndSave, runV3TextGenerate } from '@/ai/tools/cloud/cloudTools'
import type { ToolProgressEmitter } from '@/ai/tools/toolProgress'
import { getSessionId } from '@/ai/shared/context/requestContext'
import {
  maybeServeCloudMock,
  maybeCaptureCloudFixture,
} from '@/ai/tools/cloud/cloudMockStore'

/** 若本 session 处于 mock 模式，返回 fixture 输出；否则 undefined。 */
async function tryServeMock(toolName: string, progress: ToolProgressEmitter): Promise<string | undefined> {
  const mocked = await maybeServeCloudMock({ toolName, sessionId: getSessionId() })
  if (mocked !== undefined) {
    progress.delta(`[cloudMock] served from fixture (no SaaS call)\n`)
  }
  return mocked
}

/** 真实调用成功后，若处于 capture 模式，把结果写盘供后续 mock 使用。 */
async function captureAfterRun(toolName: string, toolInput: unknown, toolOutput: string): Promise<void> {
  await maybeCaptureCloudFixture({
    toolName,
    toolInput,
    toolOutput,
    sessionId: getSessionId(),
  })
}

// ---------------------------------------------------------------------------
// Feature mapping per named cloud tool
// ---------------------------------------------------------------------------
//
// Which SaaS feature id(s) each named tool resolves against. Keep these in
// one place so `pickVariant`, `enhanceCloudNamedToolDescription`, and
// per-tool `execute` functions share the same source of truth.

const IMAGE_GENERATE_FEATURES = ['imageGenerate'] as const
const IMAGE_EDIT_FEATURES = ['imageEdit'] as const
const VIDEO_GENERATE_FEATURES = ['videoGenerate'] as const
const TTS_FEATURES = ['tts'] as const
const SPEECH_TO_TEXT_FEATURES = ['speechToText'] as const
const IMAGE_CAPTION_FEATURES = ['imageCaption'] as const

const CLOUD_NAMED_TOOL_FEATURES: Record<string, readonly string[]> = {
  CloudImageGenerate: IMAGE_GENERATE_FEATURES,
  CloudImageEdit: IMAGE_EDIT_FEATURES,
  CloudVideoGenerate: VIDEO_GENERATE_FEATURES,
  CloudTTS: TTS_FEATURES,
  CloudSpeechRecognize: SPEECH_TO_TEXT_FEATURES,
  CloudImageUnderstand: IMAGE_CAPTION_FEATURES,
}

// ---------------------------------------------------------------------------
// Logical → SaaS slot mapping
// ---------------------------------------------------------------------------
//
// SaaS handler 看的是每个 variant 的 `inputSlots[].role` 作为请求体 `inputs` 的键，
// 而且媒体类 slot（image/audio/video/file）期望 `{url:string}` 形态的值，不是扁平字符串
// （参考 SaaS 面板 feature-test-dialog.tsx 的 payload 构造）。
//
// 我们 6 个 named tool 的 execute 用 hardcode 语义 key（image/audio/prompt/referenceImage …），
// 这份表列出每个 logical key 可以落到的候选 role 名（按优先级）。runtime 取 picked variant 的
// inputSlots，按 accept 类型 + 候选 role 名二次过滤，找到的第一个匹配就是真实发送的 key。
//
// 未命中任何候选时 fallback 到 logical key 本身（等同老行为，至少不比 legacy 差）。
const CLOUD_SLOT_MAPS: Record<string, Record<string, readonly string[]>> = {
  CloudImageGenerate: {
    prompt: ['prompt', 'text', 'content'],
    referenceImage: ['reference', 'referenceImage', 'source', 'image'],
  },
  CloudImageEdit: {
    image: ['source', 'image', 'input'],
    prompt: ['instruction', 'prompt', 'text'],
    instruction: ['instruction', 'prompt', 'text'],
    mask: ['mask'],
  },
  CloudVideoGenerate: {
    prompt: ['prompt', 'text'],
    startImage: ['firstFrame', 'start', 'startImage', 'source', 'image'],
    endImage: ['lastFrame', 'end', 'endImage'],
  },
  CloudTTS: {
    text: ['speech', 'text', 'content', 'prompt', 'input'],
  },
  CloudSpeechRecognize: {
    audio: ['source', 'audio', 'input'],
  },
  CloudImageUnderstand: {
    image: ['source', 'image', 'input'],
    question: ['question', 'prompt', 'text'],
  },
}

/**
 * 根据 picked variant 的 inputSlots 把 logical inputs 转成 SaaS 期望的 physical inputs：
 *  1. 每个 logical key 按 CLOUD_SLOT_MAPS 的候选列表在 inputSlots 里找匹配 role
 *  2. 找到后写入目标 role；媒体类 slot (accept !== 'text') 把裸 string 包成 { url }
 *  3. inputSlots 缺失（老服务端）或找不到匹配时，把 logical key 原样透传（兼容 legacy）
 */
function mapLogicalInputsToSlots(
  toolName: string,
  picked: CachedVariantDetail,
  logical: Record<string, unknown>,
): Record<string, unknown> {
  const slots = picked.inputSlots
  if (!slots || slots.length === 0) return logical

  const slotByRole = new Map(slots.map((s) => [s.role, s]))
  const used = new Set<string>()
  const slotMap = CLOUD_SLOT_MAPS[toolName] ?? {}
  const out: Record<string, unknown> = {}

  for (const [logicalKey, value] of Object.entries(logical)) {
    if (value === undefined || value === null) continue

    const candidates = slotMap[logicalKey] ?? [logicalKey]
    const targetRole = candidates.find((r) => slotByRole.has(r) && !used.has(r))
      ?? logicalKey
    used.add(targetRole)

    const slot = slotByRole.get(targetRole)
    if (slot && slot.accept !== 'text' && typeof value === 'string') {
      // 媒体 slot 必须 { url: string }；string 值被上游的 normalizeCloudInputs 透传，
      // 这里先包装好，后续如果是 local path，normalizeCloudInputs 会走 { url } 分支
      // 的 looksLikeLocalPath 上传路径。
      out[targetRole] = { url: value }
    } else {
      out[targetRole] = value
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Cold-start handling
// ---------------------------------------------------------------------------

/**
 * Ensure the capability snapshot is ready before picking a variant. On
 * server cold-start the periodic refresh may not have run yet — in that
 * case we trigger an on-demand refresh and wait up to ~10s for it to land.
 */
async function ensureCapabilitiesReady(
  progress: ToolProgressEmitter,
  maxWaitMs = 10_000,
): Promise<void> {
  if (cloudSkillsInitialized()) return
  progress.delta('warming up cloud capabilities catalog…\n')
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
 * Returns null if no variant matches.
 */
function pickVariant(
  featureIds: readonly string[],
  modelHint?: string,
): CachedVariantDetail | null {
  const all = getAllCachedVariantDetails()
  if (all.length === 0) return null

  // modelHint 必须在【本 tool 的合法 feature 列表】范围内匹配，
  // 否则会把 "Qwen" 匹配到 imageGenerate 的 Qwen variant，然后用 v3TextGenerate 发
  // imageCaption 的接口 → SaaS 返回 "Unknown text feature: imageGenerate" 400。
  const featureSet = new Set(featureIds)
  const candidates = all.filter((v) => featureSet.has(v.featureId))
  if (candidates.length === 0) return null

  if (modelHint) {
    const trimmed = modelHint.trim()
    if (trimmed) {
      const exact = candidates.find((v) => v.variantId === trimmed)
      if (exact) return exact
      const lower = trimmed.toLowerCase()
      const fuzzy = candidates.find(
        (v) =>
          v.variantId.toLowerCase().includes(lower) ||
          v.variantName.toLowerCase().includes(lower),
      )
      if (fuzzy) return fuzzy
    }
  }

  candidates.sort((a, b) => a.creditsPerCall - b.creditsPerCall)
  return candidates[0] ?? null
}

/**
 * Build a user-facing error message for the "no variant available" case.
 */
function noVariantError(toolName: string, featureIds: readonly string[]): string {
  return JSON.stringify({
    ok: false,
    code: 'no_variant_available',
    error: `No cloud variant found for feature(s): ${featureIds.join(', ')}. The cloud backend may not offer this capability, or no accessible variant matches your current account tier.`,
    hint: 'Do NOT retry this tool. Tell the user the capability is currently unavailable on their account tier.',
    featureIds,
    toolName,
  })
}

// ---------------------------------------------------------------------------
// Media input coercion
// ---------------------------------------------------------------------------

/**
 * Normalize a reference image / audio / video value into the shape
 * `normalizeCloudInputs` understands. Accepts:
 *   - URL string      → passed through
 *   - { url: "..." }  → passed through
 *   - { path: "..." } → passed through (local path upload handled downstream)
 *   - any other shape → dropped silently (better than failing the call)
 */
function coerceMediaInput(value: unknown): unknown | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length === 0) return undefined
    // LLM（尤其 Qwen/Moonshot）经常把对象参数 JSON 字符串化后塞进单字段，
    // 例如传 `'{"url":"https://…"}'` 或 `'{"path":"/User/…"}'`。直接透传会让 SaaS
    // 把整坨 JSON 字符串当图片 URL，必挂 400。尝试解析回对象后按 {url}/{path} 处理。
    if ((trimmed.startsWith('{') && trimmed.endsWith('}'))
      || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const obj = parsed as Record<string, unknown>
          if (typeof obj.url === 'string' || typeof obj.path === 'string') return obj
        }
      } catch { /* not JSON, fall through */ }
    }
    return value
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    if (typeof obj.url === 'string' || typeof obj.path === 'string') return obj
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Dynamic description enhancement — inject <system-tag> with live variants
// ---------------------------------------------------------------------------

/**
 * Build a <system-tag> block listing currently cached variants for the given
 * named cloud tool. Returns empty string if the tool isn't a named cloud tool
 * or the variant cache is empty.
 */
export function buildCloudNamedToolVariantTag(toolId: string): string {
  const features = CLOUD_NAMED_TOOL_FEATURES[toolId]
  if (!features) return ''
  const all = getAllCachedVariantDetails()
  const featureSet = new Set(features)
  const variants = all.filter((v) => featureSet.has(v.featureId))
  if (variants.length === 0) return ''
  const sorted = [...variants].sort((a, b) => a.creditsPerCall - b.creditsPerCall)
  const lines = sorted.map((v) => {
    const parts: string[] = [
      `id="${v.variantId}"`,
      `name="${v.variantName}"`,
      `tier="${v.minMembershipLevel}"`,
      `credits="${v.creditsPerCall}"`,
    ]
    return `- ${parts.join(' ')}`
  })
  return `\n\n<system-tag type="cloud-variants" feature="${features.join(',')}">
Currently available variants (live snapshot, cheapest first). The default picker auto-selects the lowest-credit variant your account tier can access. To force a specific one, pass \`modelHint\` with the variant id (e.g. "${sorted[0]!.variantId}") or a unique substring of its name.
${lines.join('\n')}
</system-tag>`
}

/**
 * Append the variant system-tag to a base description. Safe to call on any
 * tool id — if the id isn't a named cloud tool, returns the base unchanged.
 */
export function enhanceCloudNamedToolDescription(
  toolId: string,
  baseDescription: string,
): string {
  const tag = buildCloudNamedToolVariantTag(toolId)
  return tag ? `${baseDescription}${tag}` : baseDescription
}

// ---------------------------------------------------------------------------
// cloudImageGenerate
// ---------------------------------------------------------------------------

export const cloudImageGenerateTool = tool({
  description: cloudImageGenerateToolDef.description,
  inputSchema: zodSchema(cloudImageGenerateToolDef.parameters),
  // Consumes credits → requires approval.
  needsApproval: true,
  execute: async (input, { toolCallId }): Promise<string> => {
    const progress = createToolProgress(toolCallId, 'CloudImageGenerate')
    const mocked = await tryServeMock('CloudImageGenerate', progress)
    if (mocked !== undefined) return mocked

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

    const result = await runV3GenerateAndSave({
      feature: picked.featureId,
      variant: picked.variantId,
      inputs: mapLogicalInputsToSlots('CloudImageGenerate', picked, inputs),
      params,
      waitForCompletion: true,
      progress,
      toolName: 'CloudImageGenerate',
    })
    await captureAfterRun('CloudImageGenerate', input, result)
    return result
  },
})

// ---------------------------------------------------------------------------
// cloudImageEdit
// ---------------------------------------------------------------------------

export const cloudImageEditTool = tool({
  description: cloudImageEditToolDef.description,
  inputSchema: zodSchema(cloudImageEditToolDef.parameters),
  // Consumes credits → requires approval.
  needsApproval: true,
  execute: async (input, { toolCallId }): Promise<string> => {
    const progress = createToolProgress(toolCallId, 'CloudImageEdit')
    const mocked = await tryServeMock('CloudImageEdit', progress)
    if (mocked !== undefined) return mocked

    const { image, instruction, mask, modelHint } = input as {
      image: unknown
      instruction: string
      mask?: unknown
      modelHint?: string
    }

    await ensureCapabilitiesReady(progress)
    const picked = pickVariant(IMAGE_EDIT_FEATURES, modelHint)
    if (!picked) {
      progress.error('no matching variant')
      return noVariantError('CloudImageEdit', IMAGE_EDIT_FEATURES)
    }

    progress.delta(`picked ${picked.variantId} (${picked.variantName}) · ${picked.creditsPerCall} credits\n`)

    const coercedImage = coerceMediaInput(image)
    if (coercedImage === undefined) {
      progress.error('invalid image input')
      return JSON.stringify({
        ok: false,
        code: 'invalid_input',
        error: 'CloudImageEdit requires a source image (URL string, { url }, or { path }).',
        hint: 'Ask the user to provide an image, or re-invoke with a valid image field.',
      })
    }

    const inputs: Record<string, unknown> = {
      image: coercedImage,
      // Variants disagree on the instruction slot key — send both so the
      // backend picks whichever it expects; unknown keys are ignored.
      prompt: instruction,
      instruction,
    }
    const coercedMask = mask !== undefined ? coerceMediaInput(mask) : undefined
    if (coercedMask !== undefined) inputs.mask = coercedMask

    const result = await runV3GenerateAndSave({
      feature: picked.featureId,
      variant: picked.variantId,
      inputs: mapLogicalInputsToSlots('CloudImageEdit', picked, inputs),
      params: {},
      waitForCompletion: true,
      progress,
      toolName: 'CloudImageEdit',
    })
    await captureAfterRun('CloudImageEdit', input, result)
    return result
  },
})

// ---------------------------------------------------------------------------
// cloudVideoGenerate
// ---------------------------------------------------------------------------

export const cloudVideoGenerateTool = tool({
  description: cloudVideoGenerateToolDef.description,
  inputSchema: zodSchema(cloudVideoGenerateToolDef.parameters),
  // Video generation is the most expensive path (50-500+ credits) → always approve.
  needsApproval: true,
  execute: async (input, { toolCallId }): Promise<string> => {
    const progress = createToolProgress(toolCallId, 'CloudVideoGenerate')
    const mocked = await tryServeMock('CloudVideoGenerate', progress)
    if (mocked !== undefined) return mocked

    const { prompt, startImage, endImage, duration, modelHint } = input as {
      prompt: string
      startImage: unknown
      endImage?: unknown
      duration?: number
      modelHint?: string
    }

    await ensureCapabilitiesReady(progress)
    const picked = pickVariant(VIDEO_GENERATE_FEATURES, modelHint)
    if (!picked) {
      progress.error('no matching variant')
      return noVariantError('CloudVideoGenerate', VIDEO_GENERATE_FEATURES)
    }

    progress.delta(`picked ${picked.variantId} (${picked.variantName}) · ${picked.creditsPerCall} credits\n`)

    const coercedStart = coerceMediaInput(startImage)
    if (coercedStart === undefined) {
      progress.error('missing startImage')
      return JSON.stringify({
        ok: false,
        code: 'invalid_input',
        error: 'CloudVideoGenerate requires a first-frame image (`startImage`). Most image-to-video variants refuse to run without one.',
        hint: 'If the user has no image yet, call CloudImageGenerate first to create a suitable first frame, then pass its filePath back into CloudVideoGenerate as startImage.',
      })
    }

    const inputs: Record<string, unknown> = {
      prompt,
      startImage: coercedStart,
    }
    const coercedEnd = endImage !== undefined ? coerceMediaInput(endImage) : undefined
    if (coercedEnd !== undefined) inputs.endImage = coercedEnd

    const params: Record<string, unknown> = {}
    if (typeof duration === 'number' && Number.isFinite(duration)) {
      params.duration = duration
    }

    const result = await runV3GenerateAndSave({
      feature: picked.featureId,
      variant: picked.variantId,
      inputs: mapLogicalInputsToSlots('CloudVideoGenerate', picked, inputs),
      params,
      waitForCompletion: true,
      progress,
      toolName: 'CloudVideoGenerate',
    })
    await captureAfterRun('CloudVideoGenerate', input, result)
    return result
  },
})

// ---------------------------------------------------------------------------
// cloudTTS
// ---------------------------------------------------------------------------

export const cloudTTSTool = tool({
  description: cloudTTSToolDef.description,
  inputSchema: zodSchema(cloudTTSToolDef.parameters),
  // TTS consumes credits → requires approval.
  needsApproval: true,
  execute: async (input, { toolCallId }): Promise<string> => {
    const progress = createToolProgress(toolCallId, 'CloudTTS')
    const mocked = await tryServeMock('CloudTTS', progress)
    if (mocked !== undefined) return mocked

    const { text, voice, speed, modelHint } = input as {
      text: string
      voice?: string
      speed?: number
      modelHint?: string
    }

    await ensureCapabilitiesReady(progress)
    const picked = pickVariant(TTS_FEATURES, modelHint)
    if (!picked) {
      progress.error('no matching variant')
      return noVariantError('CloudTTS', TTS_FEATURES)
    }

    progress.delta(`picked ${picked.variantId} (${picked.variantName}) · ${picked.creditsPerCall} credits\n`)

    const inputs: Record<string, unknown> = { text }
    const params: Record<string, unknown> = {}
    if (voice) params.voice = voice
    if (typeof speed === 'number' && Number.isFinite(speed)) params.speed = speed

    const result = await runV3GenerateAndSave({
      feature: picked.featureId,
      variant: picked.variantId,
      inputs: mapLogicalInputsToSlots('CloudTTS', picked, inputs),
      params,
      waitForCompletion: true,
      progress,
      toolName: 'CloudTTS',
    })
    await captureAfterRun('CloudTTS', input, result)
    return result
  },
})

// ---------------------------------------------------------------------------
// cloudSpeechRecognize
// ---------------------------------------------------------------------------

export const cloudSpeechRecognizeTool = tool({
  description: cloudSpeechRecognizeToolDef.description,
  inputSchema: zodSchema(cloudSpeechRecognizeToolDef.parameters),
  // Still consumes credits → requires approval.
  needsApproval: true,
  execute: async (input, { toolCallId }): Promise<string> => {
    const progress = createToolProgress(toolCallId, 'CloudSpeechRecognize')
    const mocked = await tryServeMock('CloudSpeechRecognize', progress)
    if (mocked !== undefined) return mocked

    const { audio, language, modelHint } = input as {
      audio: unknown
      language?: string
      modelHint?: string
    }

    await ensureCapabilitiesReady(progress)
    const picked = pickVariant(SPEECH_TO_TEXT_FEATURES, modelHint)
    if (!picked) {
      progress.error('no matching variant')
      return noVariantError('CloudSpeechRecognize', SPEECH_TO_TEXT_FEATURES)
    }

    progress.delta(`picked ${picked.variantId} (${picked.variantName}) · ${picked.creditsPerCall} credits\n`)

    const coercedAudio = coerceMediaInput(audio)
    if (coercedAudio === undefined) {
      progress.error('missing audio')
      return JSON.stringify({
        ok: false,
        code: 'invalid_input',
        error: 'CloudSpeechRecognize requires an audio input (URL string, { url }, or { path }).',
        hint: 'Ask the user to provide an audio clip, or re-invoke with a valid audio field.',
      })
    }

    const inputs: Record<string, unknown> = { audio: coercedAudio }
    const params: Record<string, unknown> = {}
    if (language) params.language = language

    const result = await runV3TextGenerate({
      feature: picked.featureId,
      variant: picked.variantId,
      inputs: mapLogicalInputsToSlots('CloudSpeechRecognize', picked, inputs),
      params,
      progress,
      toolName: 'CloudSpeechRecognize',
      executionMode: picked.executionMode,
    })
    await captureAfterRun('CloudSpeechRecognize', input, result)
    return result
  },
})

// ---------------------------------------------------------------------------
// cloudImageUnderstand
// ---------------------------------------------------------------------------

export const cloudImageUnderstandTool = tool({
  description: cloudImageUnderstandToolDef.description,
  inputSchema: zodSchema(cloudImageUnderstandToolDef.parameters),
  // Consumes credits → requires approval.
  needsApproval: true,
  execute: async (input, { toolCallId }): Promise<string> => {
    const progress = createToolProgress(toolCallId, 'CloudImageUnderstand')
    const mocked = await tryServeMock('CloudImageUnderstand', progress)
    if (mocked !== undefined) return mocked

    const { image, question, modelHint } = input as {
      image: unknown
      question?: string
      modelHint?: string
    }

    await ensureCapabilitiesReady(progress)
    const picked = pickVariant(IMAGE_CAPTION_FEATURES, modelHint)
    if (!picked) {
      progress.error('no matching variant')
      return noVariantError('CloudImageUnderstand', IMAGE_CAPTION_FEATURES)
    }

    progress.delta(`picked ${picked.variantId} (${picked.variantName}) · ${picked.creditsPerCall} credits\n`)

    const coercedImage = coerceMediaInput(image)
    if (coercedImage === undefined) {
      progress.error('missing image')
      return JSON.stringify({
        ok: false,
        code: 'invalid_input',
        error: 'CloudImageUnderstand requires an image input (URL string, { url }, or { path }).',
        hint: 'Ask the user to provide an image, or re-invoke with a valid image field.',
      })
    }

    const inputs: Record<string, unknown> = { image: coercedImage }
    if (question) inputs.question = question

    const result = await runV3TextGenerate({
      feature: picked.featureId,
      variant: picked.variantId,
      inputs: mapLogicalInputsToSlots('CloudImageUnderstand', picked, inputs),
      params: {},
      progress,
      toolName: 'CloudImageUnderstand',
      executionMode: picked.executionMode,
    })
    await captureAfterRun('CloudImageUnderstand', input, result)
    return result
  },
})
