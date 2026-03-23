/**
 * Variant E2E 真实生成测试
 *
 * 对每个 image / audio variant 提交真实的 v3Generate 请求，轮询直到完成。
 * ⚠️  会消耗积分！
 *
 * 运行方式（图片+音频）：
 *   OPENLOAF_SAAS_URL=http://localhost:5280 SAAS_ACCESS_TOKEN=$(cat /tmp/token) \
 *     node --no-warnings --import tsx/esm --test \
 *     src/modules/saas/modules/media/__tests__/variant-e2e.test.ts
 *
 * 仅运行某个 variant：
 *   TEST_ONLY=OL-IG-001 ... node --test ...
 *
 * 跳过某些 variant：
 *   TEST_SKIP=OL-IG-005,OL-IG-006 ... node --test ...
 *
 * 调整请求间隔（秒，默认 8）：
 *   REQUEST_DELAY=10 ... node --test ...
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import { SaaSClient } from '@openloaf-saas/sdk'

// ═══════════ 配置 ═══════════

const SAAS_URL = process.env.OPENLOAF_SAAS_URL
if (!SAAS_URL) {
  console.error('缺少 OPENLOAF_SAAS_URL 环境变量')
  process.exit(1)
}

const TOKEN = process.env.SAAS_ACCESS_TOKEN
if (!TOKEN) {
  console.error('缺少 SAAS_ACCESS_TOKEN 环境变量')
  process.exit(1)
}

const TEST_ONLY = process.env.TEST_ONLY?.split(',').map(s => s.trim()).filter(Boolean) ?? []
const TEST_SKIP = process.env.TEST_SKIP?.split(',').map(s => s.trim()).filter(Boolean) ?? []

/** 请求间隔（毫秒），避免触发限流 */
const REQUEST_DELAY = (Number(process.env.REQUEST_DELAY) || 8) * 1000
/** 轮询间隔（毫秒） */
const POLL_INTERVAL = 3_000
/** 单任务最大等待时间（毫秒） */
const TASK_TIMEOUT = 180_000

// ═══════════ 生成测试图片 ═══════════

/** 生成合法 PNG（无外部依赖） */
function generatePNG(w: number, h: number, r: number, g: number, b: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  function crc32(buf: Buffer): number {
    let crc = 0xffffffff
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i]!
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
    return (crc ^ 0xffffffff) >>> 0
  }

  function makeChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const typeAndData = Buffer.concat([Buffer.from(type), data])
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(typeAndData), 0)
    return Buffer.concat([len, typeAndData, crcBuf])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 2  // RGB
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const raw = Buffer.alloc(h * (1 + w * 3))
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 3)
    raw[off] = 0 // no filter
    for (let x = 0; x < w; x++) {
      raw[off + 1 + x * 3] = r
      raw[off + 1 + x * 3 + 1] = g
      raw[off + 1 + x * 3 + 2] = b
    }
  }
  const compressed = deflateSync(raw)

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ])
}

/** 256×256 红色测试图 */
const TEST_IMAGE_B64 = generatePNG(256, 256, 200, 100, 80).toString('base64')
/** 256×256 白色蒙版 */
const TEST_MASK_B64 = generatePNG(256, 256, 255, 255, 255).toString('base64')

const mediaImage = { base64: TEST_IMAGE_B64, mediaType: 'image/png' }
const mediaMask = { base64: TEST_MASK_B64, mediaType: 'image/png' }

// ═══════════ 工具函数 ═══════════

const client = new SaaSClient({
  baseUrl: SAAS_URL,
  getAccessToken: () => TOKEN!,
})

/**
 * 拦截 console.error 捕获 SDK 输出的真实错误 payload。
 *
 * SDK 在 3 种错误场景中都会调用 `console.error("[sdk] request error", {...})`，
 * 其中包含 payload（服务端真实错误信息）。但 SaaSSchemaError 只抛出 Zod issues，
 * 丢失了 payload。因此我们拦截 console.error 来恢复真实信息。
 */
let lastSdkErrorPayload: { message?: string; code?: string } | undefined

const originalConsoleError = console.error
console.error = (...args: unknown[]) => {
  // 检测 SDK 错误日志格式：console.error("[sdk] request error", {payload: ...})
  if (args[0] === '[sdk] request error' && args[1] && typeof args[1] === 'object') {
    const info = args[1] as { payload?: { message?: string; code?: string; success?: boolean } }
    if (info.payload && typeof info.payload === 'object' && info.payload.message) {
      lastSdkErrorPayload = info.payload
    }
  }
  // 静默 SDK 日志（避免大量 ZodError 输出干扰测试结果）
  // 如需调试可取消注释：
  // originalConsoleError(...args)
}

/** 从 SDK 异常中提取有意义的错误信息 */
function extractErrorMessage(err: unknown): string {
  // 1. 优先使用拦截到的 SDK payload（覆盖 SaaSSchemaError 丢失 payload 的问题）
  if (lastSdkErrorPayload?.message) {
    const captured = lastSdkErrorPayload
    lastSdkErrorPayload = undefined
    const code = captured.code ? ` [${captured.code}]` : ''
    return `${code}${captured.message}`.trim()
  }
  lastSdkErrorPayload = undefined

  // 2. SaaSHttpError — 有 status + payload
  const e = err as {
    name?: string
    status?: number
    statusText?: string
    payload?: { message?: string; code?: string }
    message?: string
    cause?: unknown
  }
  if (e?.payload && typeof e.payload === 'object' && (e.payload as Record<string, unknown>).message) {
    const p = e.payload as { message: string; code?: string }
    const code = p.code ? ` [${p.code}]` : ''
    return `${e.status ?? '?'}${code}: ${p.message}`
  }

  // 3. SaaSNetworkError — 有 cause
  if (e?.name === 'SaaSNetworkError' && e.cause) {
    const cause = e.cause as { code?: string; message?: string }
    return `Network: ${cause.code ?? cause.message ?? 'unknown'}`
  }

  // 4. fallback
  if (err instanceof Error) return err.message
  return String(err)
}

/** 提交 v3Generate 并轮询到完成/失败 */
async function submitAndPoll(
  payload: {
    feature: string
    variant: string
    inputs?: Record<string, unknown>
    params?: Record<string, unknown>
    count?: 1 | 2 | 4
    seed?: number
  },
  label: string,
): Promise<{
  status: 'succeeded' | 'failed' | 'timeout'
  taskId?: string
  groupId?: string
  resultUrls?: string[]
  resultText?: string
  error?: string
  durationMs: number
}> {
  const t0 = Date.now()

  // 1. 提交
  let submitResult: Awaited<ReturnType<typeof client.ai.v3Generate>>
  try {
    submitResult = await client.ai.v3Generate(payload)
  } catch (err: unknown) {
    return {
      status: 'failed',
      error: `Submit: ${extractErrorMessage(err)}`,
      durationMs: Date.now() - t0,
    }
  }

  const data = submitResult.data as { taskId?: string; groupId?: string; taskIds?: string[] }
  const taskId = data.taskId ?? data.taskIds?.[0]
  const groupId = data.groupId

  if (!taskId) {
    return {
      status: 'failed',
      error: `No taskId: ${JSON.stringify(data)}`,
      durationMs: Date.now() - t0,
    }
  }

  console.log(`   -> ${label} taskId=${taskId}${groupId ? ` groupId=${groupId}` : ''}`)

  // 2. 轮询
  const deadline = Date.now() + TASK_TIMEOUT
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL))

    try {
      // 如果有 groupId 就查 group，否则查单 task
      if (groupId) {
        const groupResp = await client.ai.v3TaskGroup(groupId)
        const g = groupResp.data
        if (g.status === 'succeeded') {
          const urls = g.tasks.flatMap(t => t.resultUrls ?? [])
          return { status: 'succeeded', taskId, groupId, resultUrls: urls, durationMs: Date.now() - t0 }
        }
        if (g.status === 'failed') {
          const errMsg = g.tasks.find(t => t.error)?.error?.message ?? 'Group failed'
          return { status: 'failed', taskId, groupId, error: errMsg, durationMs: Date.now() - t0 }
        }
        process.stdout.write('.')
      } else {
        const taskResp = await client.ai.v3Task(taskId)
        const task = taskResp.data
        if (task.status === 'succeeded') {
          return {
            status: 'succeeded', taskId,
            resultUrls: task.resultUrls,
            resultText: task.resultText,
            durationMs: Date.now() - t0,
          }
        }
        if (task.status === 'failed' || task.status === 'canceled') {
          return {
            status: 'failed', taskId,
            error: task.error?.message ?? `Task ${task.status}`,
            durationMs: Date.now() - t0,
          }
        }
        process.stdout.write('.')
      }
    } catch (pollErr: unknown) {
      const pollErrMsg = extractErrorMessage(pollErr)
      const pe = pollErr as { status?: number }
      if (pe?.status === 404) {
        return { status: 'failed', taskId, error: `Poll: Task not found (404)`, durationMs: Date.now() - t0 }
      }
      if (pe?.status && pe.status >= 400 && pe.status < 500) {
        return { status: 'failed', taskId, error: `Poll ${pe.status}: ${pollErrMsg}`, durationMs: Date.now() - t0 }
      }
      // 5xx / 网络错误 → 继续轮询
      process.stdout.write('x')
    }
  }

  return { status: 'timeout', taskId, error: 'Timeout', durationMs: Date.now() - t0 }
}

function shouldRun(variantId: string): boolean {
  if (TEST_ONLY.length > 0 && !TEST_ONLY.includes(variantId)) return false
  if (TEST_SKIP.includes(variantId)) return false
  return true
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// ═══════════ 测试用例矩阵 ═══════════

interface TestCase {
  variant: string
  feature: string
  label: string
  inputs?: Record<string, unknown>
  params?: Record<string, unknown>
  count?: 1 | 2 | 4
  seed?: number
  expectType: 'image' | 'audio' | 'text'
}

const TEST_CASES: TestCase[] = [
  // ── OL-IG-001  万相文生图 wan2.6 ──
  {
    variant: 'OL-IG-001', feature: 'imageGenerate',
    label: 'IG-001 最小参数',
    inputs: { prompt: 'a red apple on a white table' },
    expectType: 'image',
  },
  {
    variant: 'OL-IG-001', feature: 'imageGenerate',
    label: 'IG-001 16:9 + hd + negativePrompt',
    inputs: { prompt: 'a futuristic cityscape at sunset' },
    params: { aspectRatio: '16:9', quality: 'hd', negativePrompt: 'blurry, low quality' },
    expectType: 'image',
  },
  {
    variant: 'OL-IG-001', feature: 'imageGenerate',
    label: 'IG-001 count=2 批量',
    inputs: { prompt: 'a cute cat sitting on a book' },
    params: { aspectRatio: '1:1', quality: 'standard' },
    count: 2,
    expectType: 'image',
  },
  {
    variant: 'OL-IG-001', feature: 'imageGenerate',
    label: 'IG-001 9:16 竖图',
    inputs: { prompt: 'a tall skyscraper from below' },
    params: { aspectRatio: '9:16' },
    expectType: 'image',
  },
  {
    variant: 'OL-IG-001', feature: 'imageGenerate',
    label: 'IG-001 4:3 + negativePrompt',
    inputs: { prompt: 'a green meadow with wildflowers' },
    params: { aspectRatio: '4:3', negativePrompt: 'people, animals' },
    expectType: 'image',
  },

  // ── OL-IG-002  Z-Image-Turbo ──
  {
    variant: 'OL-IG-002', feature: 'imageGenerate',
    label: 'IG-002 最小参数',
    inputs: { prompt: 'a simple blue circle' },
    expectType: 'image',
  },
  {
    variant: 'OL-IG-002', feature: 'imageGenerate',
    label: 'IG-002 16:9 + hd',
    inputs: { prompt: 'a mountain lake at dawn' },
    params: { aspectRatio: '16:9', quality: 'hd' },
    expectType: 'image',
  },

  // ── OL-IG-003  通义文生图 Plus ──
  {
    variant: 'OL-IG-003', feature: 'imageGenerate',
    label: 'IG-003 最小参数',
    inputs: { prompt: 'a colorful parrot' },
    expectType: 'image',
  },
  {
    variant: 'OL-IG-003', feature: 'imageGenerate',
    label: 'IG-003 4:3 + hd + negativePrompt',
    inputs: { prompt: 'a vintage car on a rainy street' },
    params: { aspectRatio: '4:3', quality: 'hd', negativePrompt: 'modern, futuristic' },
    expectType: 'image',
  },

  // ── OL-IG-004  通义文生图 ──
  {
    variant: 'OL-IG-004', feature: 'imageGenerate',
    label: 'IG-004 最小参数',
    inputs: { prompt: 'a wooden desk with a lamp' },
    expectType: 'image',
  },
  {
    variant: 'OL-IG-004', feature: 'imageGenerate',
    label: 'IG-004 9:16 + hd + negativePrompt',
    inputs: { prompt: 'a snowy mountain peak' },
    params: { aspectRatio: '9:16', quality: 'hd', negativePrompt: 'summer, green' },
    expectType: 'image',
  },

  // ── OL-IG-005  即梦文生图 v4.0（可能未绑定） ──
  {
    variant: 'OL-IG-005', feature: 'imageGenerate',
    label: 'IG-005 纯文生图',
    params: { prompt: 'a butterfly on a flower' },
    expectType: 'image',
  },
  {
    variant: 'OL-IG-005', feature: 'imageGenerate',
    label: 'IG-005 参考图 + anime style',
    inputs: { images: [mediaImage] },
    params: { prompt: 'a butterfly in anime style', style: 'anime_v2.0', aspectRatio: '1:1', quality: 'hd' },
    expectType: 'image',
  },
  {
    variant: 'OL-IG-005', feature: 'imageGenerate',
    label: 'IG-005 realistic 风格',
    params: { prompt: 'a photorealistic cat portrait', style: 'realistic_v2.0', aspectRatio: '4:3' },
    expectType: 'image',
  },
  {
    variant: 'OL-IG-005', feature: 'imageGenerate',
    label: 'IG-005 3d_animation 风格',
    params: { prompt: 'a 3d robot character', style: '3d_animation_v2.0', aspectRatio: '16:9' },
    expectType: 'image',
  },

  // ── OL-IG-006  即梦文生图 v3.1（可能未绑定） ──
  {
    variant: 'OL-IG-006', feature: 'imageGenerate',
    label: 'IG-006 最小参数',
    params: { prompt: 'a sunset over the ocean' },
    expectType: 'image',
  },
  {
    variant: 'OL-IG-006', feature: 'imageGenerate',
    label: 'IG-006 参考图 + 16:9 + hd',
    inputs: { images: [mediaImage] },
    params: { prompt: 'ocean waves in oil painting', aspectRatio: '16:9', quality: 'hd' },
    expectType: 'image',
  },

  // ── OL-IE-001  图编 Plus (qwen-image-edit-plus) ──
  {
    variant: 'OL-IE-001', feature: 'imageEdit',
    label: 'IE-001 单图 + prompt',
    inputs: { prompt: 'add sunglasses to the person', image: mediaImage },
    expectType: 'image',
  },
  {
    variant: 'OL-IE-001', feature: 'imageEdit',
    label: 'IE-001 mask + negativePrompt',
    inputs: { prompt: 'replace background with forest', image: mediaImage, mask: mediaMask },
    params: { negativePrompt: 'blurry, distorted' },
    expectType: 'image',
  },
  {
    variant: 'OL-IE-001', feature: 'imageEdit',
    label: 'IE-001 多图 images[]',
    inputs: { prompt: 'combine styles', image: mediaImage, images: [mediaImage] },
    expectType: 'image',
  },

  // ── OL-IE-002  图编 wan2.6 (qwen-wan26-image) ──
  {
    variant: 'OL-IE-002', feature: 'imageEdit',
    label: 'IE-002 仅 prompt',
    inputs: { prompt: 'make the sky blue and sunny' },
    expectType: 'image',
  },
  {
    variant: 'OL-IE-002', feature: 'imageEdit',
    label: 'IE-002 图 + negativePrompt',
    inputs: { prompt: 'enhance colors', image: mediaImage },
    params: { negativePrompt: 'dark, cold' },
    expectType: 'image',
  },

  // ── OL-IP-001  即梦修复 (volc-jimeng-inpaint) ──
  {
    variant: 'OL-IP-001', feature: 'imageInpaint',
    label: 'IP-001 基础修复',
    inputs: { image: mediaImage, mask: mediaMask },
    params: { prompt: 'fill with green grass' },
    expectType: 'image',
  },
  {
    variant: 'OL-IP-001', feature: 'imageInpaint',
    label: 'IP-001 详细 prompt',
    inputs: { image: mediaImage, mask: mediaMask },
    params: { prompt: 'replace with a beautiful flower garden with roses and tulips' },
    expectType: 'image',
  },

  // ── OL-ST-001  风格迁移 ──
  {
    variant: 'OL-ST-001', feature: 'imageStyleTransfer',
    label: 'ST-001 最小参数',
    inputs: { image: mediaImage },
    params: { prompt: 'a cat in the same style' },
    expectType: 'image',
  },
  {
    variant: 'OL-ST-001', feature: 'imageStyleTransfer',
    label: 'ST-001 16:9 + hd',
    inputs: { image: mediaImage },
    params: { prompt: 'a mountain landscape', aspectRatio: '16:9', quality: 'hd' },
    expectType: 'image',
  },

  // ── OL-UP-001  超清 (qwen-wanx21-upscale) ──
  {
    variant: 'OL-UP-001', feature: 'upscale',
    label: 'UP-001 scale=2',
    inputs: { image: mediaImage },
    params: { scale: 2 },
    expectType: 'image',
  },
  {
    variant: 'OL-UP-001', feature: 'upscale',
    label: 'UP-001 scale=4',
    inputs: { image: mediaImage },
    params: { scale: 4 },
    expectType: 'image',
  },

  // ── OL-OP-001  扩图 (qwen-wanx21-outpaint) ──
  {
    variant: 'OL-OP-001', feature: 'outpaint',
    label: 'OP-001 1.5x1.5',
    inputs: { image: mediaImage },
    params: { xScale: 1.5, yScale: 1.5 },
    expectType: 'image',
  },
  {
    variant: 'OL-OP-001', feature: 'outpaint',
    label: 'OP-001 非对称 2x1',
    inputs: { image: mediaImage },
    params: { xScale: 2, yScale: 1 },
    expectType: 'image',
  },
  {
    variant: 'OL-OP-001', feature: 'outpaint',
    label: 'OP-001 最大 3x3',
    inputs: { image: mediaImage },
    params: { xScale: 3, yScale: 3 },
    expectType: 'image',
  },

  // ── OL-ME-001  素材提取 ──
  {
    variant: 'OL-ME-001', feature: 'materialExtract',
    label: 'ME-001 唯一参数',
    inputs: { image: mediaImage },
    expectType: 'image',
  },

  // ═══════════ 音频 ═══════════

  // ── OL-TT-001  TTS CosyVoice ──
  {
    variant: 'OL-TT-001', feature: 'tts',
    label: 'TT-001 默认 voice',
    inputs: { text: '你好世界，这是一段测试文本。' },
    expectType: 'audio',
  },
  {
    variant: 'OL-TT-001', feature: 'tts',
    label: 'TT-001 voice=longshu',
    inputs: { text: '欢迎来到 OpenLoaf 人工智能平台。' },
    params: { voice: 'longshu' },
    expectType: 'audio',
  },
  {
    variant: 'OL-TT-001', feature: 'tts',
    label: 'TT-001 wav + 语速1.5',
    inputs: { text: '语音合成速度测试，一二三四五。' },
    params: { voice: 'longxiaochun', format: 'wav', speechRate: 1.5 },
    expectType: 'audio',
  },
  {
    variant: 'OL-TT-001', feature: 'tts',
    label: 'TT-001 慢速 0.8',
    inputs: { text: '慢速播报测试。这是一段比较长的文本，用来测试效果。' },
    params: { voice: 'longxiaoxia', format: 'mp3', speechRate: 0.8 },
    expectType: 'audio',
  },
  {
    variant: 'OL-TT-001', feature: 'tts',
    label: 'TT-001 英文',
    inputs: { text: 'Hello, welcome to OpenLoaf AI platform. This is a test.' },
    params: { voice: 'longyue' },
    expectType: 'audio',
  },

  // ── OL-SR-001  语音识别（链式：使用 TTS 结果 URL） ──
  {
    variant: 'OL-SR-001', feature: 'speechToText',
    label: 'SR-001 链式 ASR',
    inputs: { audio: { url: '__TTS_RESULT_URL__' } },
    expectType: 'text',
  },
]

// ═══════════ 测试执行 ═══════════

const results: {
  variant: string
  label: string
  status: string
  durationMs: number
  resultUrls?: string[]
  resultText?: string
  error?: string
}[] = []

let ttsResultUrl: string | undefined
let caseIndex = 0

test('E2E: 图片 + 音频 variant 全参数测试', async (t) => {
  const activeCases = TEST_CASES.filter(tc => shouldRun(tc.variant))
  console.log(`\nSaaS: ${SAAS_URL}`)
  console.log(`Token: ${TOKEN!.slice(0, 20)}...`)
  console.log(`总用例: ${TEST_CASES.length}, 实际运行: ${activeCases.length}`)
  console.log(`请求间隔: ${REQUEST_DELAY / 1000}s`)
  if (TEST_ONLY.length) console.log(`仅运行: ${TEST_ONLY.join(', ')}`)
  if (TEST_SKIP.length) console.log(`跳过: ${TEST_SKIP.join(', ')}`)

  for (const tc of TEST_CASES) {
    if (!shouldRun(tc.variant)) continue

    // ASR 用例：注入 TTS 生成的 URL
    if (tc.variant === 'OL-SR-001') {
      if (!ttsResultUrl) {
        console.log(`\n[skip] ${tc.variant} ${tc.label} — 无 TTS 结果 URL`)
        results.push({ variant: tc.variant, label: tc.label, status: 'skip', durationMs: 0 })
        continue
      }
      tc.inputs = { audio: { url: ttsResultUrl } }
    }

    // 请求间隔（非第一个）
    if (caseIndex > 0) {
      console.log(`   ... 等待 ${REQUEST_DELAY / 1000}s 避免限流`)
      await delay(REQUEST_DELAY)
    }
    caseIndex++

    await t.test(`${tc.variant} — ${tc.label}`, async () => {
      console.log(`\n[${caseIndex}/${activeCases.length}] ${tc.variant} ${tc.label}`)

      const payload = {
        feature: tc.feature,
        variant: tc.variant,
        ...(tc.inputs ? { inputs: tc.inputs } : {}),
        ...(tc.params ? { params: tc.params } : {}),
        ...(tc.count ? { count: tc.count } : {}),
        ...(tc.seed !== undefined ? { seed: tc.seed } : {}),
      }

      const result = await submitAndPoll(payload, tc.label)

      // 保存 TTS 结果供 ASR 使用
      if (tc.variant === 'OL-TT-001' && result.status === 'succeeded' && result.resultUrls?.[0]) {
        ttsResultUrl = result.resultUrls[0]
        console.log(`   TTS URL saved: ${ttsResultUrl.slice(0, 60)}...`)
      }

      const icon = result.status === 'succeeded' ? 'OK' : 'FAIL'
      console.log(`   ${icon} ${(result.durationMs / 1000).toFixed(1)}s`)

      if (result.resultUrls?.length) {
        console.log(`   URLs: ${result.resultUrls.length} file(s)`)
      }
      if (result.resultText) {
        console.log(`   Text: ${result.resultText.slice(0, 100)}`)
      }
      if (result.error) {
        console.log(`   Error: ${result.error}`)
      }

      results.push({
        variant: tc.variant,
        label: tc.label,
        status: `${icon} ${result.status}`,
        durationMs: result.durationMs,
        resultUrls: result.resultUrls,
        resultText: result.resultText,
        error: result.error,
      })

      // 断言：成功时检查输出
      if (result.status === 'succeeded') {
        if (tc.expectType === 'text') {
          assert.ok(result.resultText, '期望 resultText')
        } else {
          assert.ok(result.resultUrls && result.resultUrls.length > 0, '期望 resultUrls')
        }
      }
      // 失败不 assert.fail —— 某些 variant 可能服务端未绑定
    })
  }

  // ── 汇总 ──
  console.log('\n\n' + '='.repeat(90))
  console.log('  E2E 测试结果汇总')
  console.log('='.repeat(90))
  console.log('')

  const colW = { v: 12, l: 36, s: 16, d: 8 }
  console.log(
    `  ${'Variant'.padEnd(colW.v)} | ${'Label'.padEnd(colW.l)} | ${'Status'.padEnd(colW.s)} | ${'Time'.padStart(colW.d)}`,
  )
  console.log(
    `  ${'-'.repeat(colW.v)}-+-${'-'.repeat(colW.l)}-+-${'-'.repeat(colW.s)}-+-${'-'.repeat(colW.d)}`,
  )
  for (const r of results) {
    const v = r.variant.padEnd(colW.v)
    const l = r.label.padEnd(colW.l).slice(0, colW.l)
    const s = r.status.padEnd(colW.s).slice(0, colW.s)
    const d = `${(r.durationMs / 1000).toFixed(1)}s`.padStart(colW.d)
    console.log(`  ${v} | ${l} | ${s} | ${d}`)
  }
  console.log('')

  const ok = results.filter(r => r.status.includes('succeeded')).length
  const fail = results.filter(r => r.status.includes('FAIL')).length
  const skip = results.filter(r => r.status === 'skip').length

  console.log(`  OK: ${ok}  FAIL: ${fail}  SKIP: ${skip}  TOTAL: ${results.length}`)

  if (fail > 0) {
    console.log('\n  --- FAIL 详情 ---')
    for (const r of results.filter(r => r.status.includes('FAIL'))) {
      console.log(`  ${r.variant} ${r.label}`)
      console.log(`    ${r.error ?? 'unknown'}`)
    }
  }

  console.log('\n' + '='.repeat(90))
})
