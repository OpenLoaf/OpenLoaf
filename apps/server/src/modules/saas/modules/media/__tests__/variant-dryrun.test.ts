/**
 * Variant Dry-Run 验证测试
 *
 * 通过真实 SDK 调用验证所有 variant 的有效性（不提交生成任务）：
 * 1. Capabilities — 检查 feature+variant 组合是否存在于服务端
 * 2. EstimatePrice — 对每个 variant 估价，验证服务端能识别
 *
 * 运行方式：
 *   pnpm --filter server exec tsx --import tsx/esm src/modules/saas/modules/media/__tests__/variant-dryrun.test.ts
 *
 * 环境变量：
 *   OPENLOAF_SAAS_URL — SaaS 服务地址（必须）
 *   SAAS_ACCESS_TOKEN — 访问令牌（可选，缺省时从 tokenStore 读取）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { SaaSClient, type SaaSHttpError } from '@openloaf-saas/sdk'

// ═══════════ 配置 ═══════════

const SAAS_URL = process.env.OPENLOAF_SAAS_URL
if (!SAAS_URL) {
  console.error('❌ 缺少 OPENLOAF_SAAS_URL 环境变量')
  process.exit(1)
}

/** 尝试获取 access token */
async function resolveAccessToken(): Promise<string> {
  // 1. 优先使用环境变量
  if (process.env.SAAS_ACCESS_TOKEN) {
    return process.env.SAAS_ACCESS_TOKEN
  }

  // 2. 尝试从 auth.json 读取 refreshToken 并刷新
  const fs = await import('node:fs')
  const path = await import('node:path')
  const os = await import('node:os')

  // 搜索路径：OPENLOAF_CONF_PATH 目录 > ~/.openloaf/
  const confPath = process.env.OPENLOAF_CONF_PATH
  const searchDirs = [
    confPath ? path.dirname(confPath) : null,
    path.join(os.homedir(), '.openloaf'),
  ].filter(Boolean) as string[]

  for (const dir of searchDirs) {
    const authPath = path.join(dir, 'auth.json')
    try {
      const raw = fs.readFileSync(authPath, 'utf-8')
      const conf = JSON.parse(raw) as { auth?: { refreshToken?: string } }
      const refreshToken = conf?.auth?.refreshToken
      if (refreshToken) {
        console.log(`🔄 从 ${authPath} 读取 refreshToken，正在刷新...`)
        const tempClient = new SaaSClient({ baseUrl: SAAS_URL! })
        const result = await tempClient.auth.refresh(refreshToken) as { accessToken: string }
        return result.accessToken
      }
    } catch {
      // 跳过不可读的文件
    }
  }

  // 3. 尝试从 tokenStore 内存读取（仅当作为 server 模块运行时）
  try {
    const { getAccessToken, getRefreshToken } = await import(
      '../../../../auth/tokenStore'
    )
    const token = getAccessToken()
    if (token) return token
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      const tempClient = new SaaSClient({ baseUrl: SAAS_URL! })
      const result = await tempClient.auth.refresh(refreshToken) as { accessToken: string }
      return result.accessToken
    }
  } catch {
    // tokenStore 不可用（独立运行时正常）
  }

  console.error(
    '❌ 无法获取 access token。请：\n' +
    '   1. 设置 SAAS_ACCESS_TOKEN 环境变量，或\n' +
    '   2. 先登录桌面应用（会生成 ~/.openloaf/auth.json）\n' +
    `   搜索过的路径: ${searchDirs.map(d => d + '/auth.json').join(', ')}`,
  )
  process.exit(1)
}

// ═══════════ 期望的 variant 矩阵 ═══════════

type ExpectedVariant = {
  feature: string
  variant: string
  category: 'image' | 'video' | 'audio'
  label: string
}

const EXPECTED_VARIANTS: ExpectedVariant[] = [
  // 图片
  { category: 'image', feature: 'imageGenerate', variant: 'OL-IG-001', label: '万相文生图 wan2.6' },
  { category: 'image', feature: 'imageGenerate', variant: 'OL-IG-002', label: 'Z-Image-Turbo' },
  { category: 'image', feature: 'imageGenerate', variant: 'OL-IG-003', label: '通义文生图 Plus' },
  { category: 'image', feature: 'imageGenerate', variant: 'OL-IG-004', label: '通义文生图' },
  { category: 'image', feature: 'imageGenerate', variant: 'OL-IG-005', label: '即梦文生图 v4.0' },
  { category: 'image', feature: 'imageGenerate', variant: 'OL-IG-006', label: '即梦文生图 v3.1' },
  { category: 'image', feature: 'imageEdit', variant: 'OL-IE-001', label: '图编 wan2.6' },
  { category: 'image', feature: 'imageEdit', variant: 'OL-IE-002', label: '图编 plus' },
  { category: 'image', feature: 'imageInpaint', variant: 'OL-IP-001', label: '即梦修复' },
  { category: 'image', feature: 'imageStyleTransfer', variant: 'OL-ST-001', label: '风格迁移' },
  { category: 'image', feature: 'upscale', variant: 'OL-UP-001', label: '超清' },
  { category: 'image', feature: 'outpaint', variant: 'OL-OP-001', label: '扩图' },
  { category: 'image', feature: 'materialExtract', variant: 'OL-ME-001', label: '素材提取' },
  // 视频
  { category: 'video', feature: 'videoGenerate', variant: 'OL-VG-001', label: '百炼视频 Flash' },
  { category: 'video', feature: 'videoGenerate', variant: 'OL-VG-002', label: '百炼视频 标准' },
  { category: 'video', feature: 'videoGenerate', variant: 'OL-VG-003', label: '即梦视频' },
  { category: 'video', feature: 'lipSync', variant: 'OL-LS-001', label: '口型同步' },
  { category: 'video', feature: 'digitalHuman', variant: 'OL-DH-001', label: '数字人' },
  { category: 'video', feature: 'videoFaceSwap', variant: 'OL-FS-001', label: '换脸 标准' },
  { category: 'video', feature: 'videoTranslate', variant: 'OL-VT-001', label: '视频翻译' },
  // 音频
  { category: 'audio', feature: 'tts', variant: 'OL-TT-001', label: 'TTS CosyVoice' },
  { category: 'audio', feature: 'speechToText', variant: 'OL-SR-001', label: '语音识别' },
]

// ═══════════ 测试 ═══════════

let client: SaaSClient
let capabilitiesMap: Map<string, { feature: string; variant: string; creditsPerCall: number; billingType: string }>

test.before(async () => {
  const token = await resolveAccessToken()
  client = new SaaSClient({
    baseUrl: SAAS_URL,
    getAccessToken: () => token,
  })
  console.log(`\n🔗 SaaS: ${SAAS_URL}`)
  console.log(`🔑 Token: ${token.slice(0, 20)}...`)
})

// ── Part 1: Capabilities 拉取 ──

test('拉取 image/video/audio capabilities', async () => {
  capabilitiesMap = new Map()

  const categories = ['image', 'video', 'audio'] as const
  const fetchers = [
    client.ai.imageCapabilities(),
    client.ai.videoCapabilities(),
    client.ai.audioCapabilities(),
  ]
  const results = await Promise.allSettled(fetchers)

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!
    const cat = categories[i]
    if (r.status === 'rejected') {
      console.log(`⚠️  ${cat} capabilities 失败: ${(r.reason as Error).message}`)
      continue
    }
    const caps = r.value
    for (const feature of caps.data.features) {
      for (const variant of feature.variants) {
        capabilitiesMap.set(`${feature.id}:${variant.id}`, {
          feature: feature.id,
          variant: variant.id,
          creditsPerCall: variant.creditsPerCall,
          billingType: variant.billingType,
        })
      }
    }
    console.log(`✅ ${cat}: ${caps.data.features.length} features`)
  }

  console.log(`\n📋 服务端共返回 ${capabilitiesMap.size} 个 feature:variant 组合`)
  assert.ok(capabilitiesMap.size > 0, '服务端返回的 variant 列表为空')
})

// ── Part 2: 检查每个期望的 variant 是否存在于 capabilities ──

test('所有期望的 variant 在 capabilities 中存在', async () => {
  const missing: string[] = []
  const found: string[] = []

  for (const ev of EXPECTED_VARIANTS) {
    const key = `${ev.feature}:${ev.variant}`
    if (capabilitiesMap.has(key)) {
      found.push(key)
    } else {
      missing.push(`${key} (${ev.label})`)
    }
  }

  console.log(`\n✅ 匹配: ${found.length}/${EXPECTED_VARIANTS.length}`)
  if (missing.length > 0) {
    console.log(`❌ 缺失:`)
    for (const m of missing) console.log(`   - ${m}`)
  }

  assert.equal(missing.length, 0, `以下 variant 在 capabilities 中不存在:\n${missing.join('\n')}`)
})

// ── Part 3: 对每个 variant 调用 v3EstimatePrice ──

test('v3EstimatePrice 对所有 variant 返回有效估价', async () => {
  const results: { variant: string; label: string; credits: number | string; status: string }[] = []

  for (const ev of EXPECTED_VARIANTS) {
    try {
      const resp = await client.ai.v3EstimatePrice({ variant: ev.variant })
      results.push({
        variant: ev.variant,
        label: ev.label,
        credits: resp.data.totalCredits,
        status: '✅',
      })
    } catch (err: unknown) {
      const httpErr = err as { status?: number; payload?: { message?: string } }
      const msg = httpErr?.payload?.message ?? (err instanceof Error ? err.message : String(err))
      results.push({
        variant: ev.variant,
        label: ev.label,
        credits: '-',
        status: `❌ ${httpErr?.status ?? '?'}: ${msg}`,
      })
    }
  }

  // 打印结果表
  console.log('\n┌─────────────┬──────────────────────┬──────────┬────────┐')
  console.log('│ Variant     │ Label                │ Credits  │ Status │')
  console.log('├─────────────┼──────────────────────┼──────────┼────────┤')
  for (const r of results) {
    const v = r.variant.padEnd(11)
    const l = r.label.padEnd(20).slice(0, 20)
    const c = String(r.credits).padStart(8)
    const s = r.status.slice(0, 6)
    console.log(`│ ${v} │ ${l} │ ${c} │ ${s} │`)
  }
  console.log('└─────────────┴──────────────────────┴──────────┴────────┘')

  const failed = results.filter(r => !r.status.startsWith('✅'))
  assert.equal(
    failed.length,
    0,
    `以下 variant 估价失败:\n${failed.map(r => `${r.variant}: ${r.status}`).join('\n')}`,
  )
})

// ── Part 4: 检查服务端有但项目未使用的 variant（信息性，不失败） ──

test('报告服务端存在但项目未覆盖的 variant（仅信息）', async () => {
  const knownKeys = new Set(EXPECTED_VARIANTS.map(v => `${v.feature}:${v.variant}`))
  const unknown: string[] = []

  for (const [key] of capabilitiesMap) {
    if (!knownKeys.has(key)) {
      unknown.push(key)
    }
  }

  if (unknown.length > 0) {
    console.log(`\n⚠️  服务端有 ${unknown.length} 个 variant 项目尚未使用:`)
    for (const u of unknown) console.log(`   - ${u}`)
  } else {
    console.log('\n📦 项目已覆盖服务端所有 variant')
  }
})
