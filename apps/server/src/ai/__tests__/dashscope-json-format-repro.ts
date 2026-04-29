/**
 * 复现 + 影响面验证：response_format 在不同 provider 下的兼容性矩阵。
 *
 * 背景：
 *   生产 ai_request_log 中 qwen3.6-flash 出现 400：
 *     "'messages' must contain the word 'json' in some form,
 *      to use 'response_format' of type 'json_object'."
 *   触发路径：WebFetch 工具 → auxiliaryInfer('webfetch.extract')
 *           → generateText({ output: Output.object(schema) })
 *           → AI SDK 编码为 response_format=json_schema → dashscope 拒绝。
 *   主对话不会触发，所以普通用户复现不到。
 *
 * 本脚本目的：
 *   1) 在 SaaS 转发链路上真正 reproduce 这条 400（case C）
 *   2) 同时对其他 provider 的代表模型跑同样请求，证明只有 dashscope 系会挂
 *      —— 这是判断「修复是否安全只动 dashscope」的事实依据。
 *
 * Token 解析顺序：
 *   1. OPENLOAF_TEST_SAAS_TOKEN env var
 *   2. ensureServerAccessToken()（用 desktop / server 已登录态的 refresh token 自动换）
 *
 * 用法：
 *   pnpm --filter server test:ai:dashscope-json
 *   # 或带 env：
 *   OPENLOAF_TEST_SAAS_TOKEN=xxx pnpm --filter server test:ai:dashscope-json
 */
import { ensureServerAccessToken } from '@/modules/auth/tokenStore'
import { getSaasBaseUrl } from '@/modules/saas'

type CaseId = 'A' | 'B' | 'C' | 'D'

type Case = {
  id: CaseId
  desc: string
  buildBody: (modelId: string) => Record<string, unknown>
  /** 期望：ok = HTTP 2xx；badRequest = HTTP 4xx（典型 400） */
  expectStatus: 'ok' | 'badRequest'
}

const NO_JSON_USER = '请用一句话总结今天的天气情况。'
const WITH_JSON_USER = '请用 JSON 格式总结今天的天气情况。'
const SCHEMA = {
  name: 'response',
  schema: {
    type: 'object',
    required: ['summary'],
    properties: { summary: { type: 'string' } },
    additionalProperties: false,
  },
}

const SYSTEM_MSG = { role: 'system', content: 'You are a content summary assistant.' }

const CASES: Case[] = [
  {
    id: 'A',
    desc: '无 response_format（控制组）',
    expectStatus: 'ok',
    buildBody: (modelId) => ({
      model: modelId,
      messages: [SYSTEM_MSG, { role: 'user', content: NO_JSON_USER }],
      max_tokens: 64,
    }),
  },
  {
    id: 'B',
    desc: 'json_object + messages 不含 "json"',
    expectStatus: 'badRequest',
    buildBody: (modelId) => ({
      model: modelId,
      messages: [SYSTEM_MSG, { role: 'user', content: NO_JSON_USER }],
      response_format: { type: 'json_object' },
      max_tokens: 64,
    }),
  },
  {
    id: 'C',
    desc: 'json_schema + messages 不含 "json"（生产 400 同款）',
    expectStatus: 'badRequest',
    buildBody: (modelId) => ({
      model: modelId,
      messages: [SYSTEM_MSG, { role: 'user', content: NO_JSON_USER }],
      response_format: { type: 'json_schema', json_schema: SCHEMA },
      max_tokens: 64,
    }),
  },
  {
    id: 'D',
    desc: 'json_schema + messages 含 "json"（修复对照）',
    expectStatus: 'ok',
    buildBody: (modelId) => ({
      model: modelId,
      messages: [SYSTEM_MSG, { role: 'user', content: WITH_JSON_USER }],
      response_format: { type: 'json_schema', json_schema: SCHEMA },
      max_tokens: 64,
    }),
  },
]

type ProbeModel = {
  /** 显示名 */
  label: string
  /** SaaS 模型 id（如 qwen3.6-flash / gpt-5.4 / claude-sonnet-4.5） */
  modelId: string
  /** 期望的 provider 类别（仅用于报告分组） */
  category: 'dashscope' | 'openai' | 'anthropic' | 'moonshot' | 'deepseek' | 'google' | 'other'
}

/** 默认探测清单 — 用 SaaS v3 capabilities 暴露的真实 alias；如设了 --auto 会从 /api/ai/v3/capabilities/chat 自动拉。 */
const DEFAULT_PROBE_MODELS: ProbeModel[] = [
  { label: 'Qwen Flash (复现目标，OL-TX-008)',  modelId: 'OL-TX-008', category: 'dashscope' },
  { label: 'Qwen Plus (OL-TX-009)',             modelId: 'OL-TX-009', category: 'dashscope' },
  { label: 'Kimi (OL-TX-005)',                  modelId: 'OL-TX-005', category: 'moonshot' },
  { label: 'DeepSeek Flash (OL-TX-012)',        modelId: 'OL-TX-012', category: 'deepseek' },
  { label: 'DeepSeek Pro (OL-TX-013)',          modelId: 'OL-TX-013', category: 'deepseek' },
  { label: 'qwen3.6-flash (legacy alias)',      modelId: 'qwen3.6-flash', category: 'dashscope' },
]

/** 自动从 SaaS v3 capabilities 拉 model 清单（无需 token）。 */
async function fetchV3ChatCapabilities(baseUrl: string): Promise<ProbeModel[]> {
  try {
    const res = await fetch(`${baseUrl}/api/ai/v3/capabilities/chat`)
    if (!res.ok) return []
    const j = (await res.json()) as {
      data?: { features?: Array<{ variants?: Array<{ id: string; familyId: string; featureTabName: string }> }> }
    }
    const variants = j.data?.features?.[0]?.variants ?? []
    return variants.map((v) => ({
      label: `${v.featureTabName} (${v.id}, ${v.familyId})`,
      modelId: v.id,
      category: mapFamily(v.familyId),
    }))
  } catch {
    return []
  }
}

function mapFamily(familyId: string): ProbeModel['category'] {
  const f = familyId.toLowerCase()
  if (f.includes('qwen')) return 'dashscope'
  if (f.includes('kimi') || f.includes('moonshot')) return 'moonshot'
  if (f.includes('deepseek')) return 'deepseek'
  if (f.includes('gpt') || f.includes('openai')) return 'openai'
  if (f.includes('claude') || f.includes('anthropic')) return 'anthropic'
  if (f.includes('gemini') || f.includes('google')) return 'google'
  return 'other'
}

type RunResult = {
  caseId: CaseId
  status: number
  errorSnippet?: string
}

async function fetchAvailableModelIds(baseUrl: string, token: string): Promise<Set<string>> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/models`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return new Set()
    const j = (await res.json()) as { data?: Array<{ id?: string }> }
    return new Set((j.data ?? []).map((m) => m.id).filter((x): x is string => Boolean(x)))
  } catch {
    return new Set()
  }
}

async function runCase(endpoint: string, token: string, body: unknown): Promise<RunResult & { caseId: CaseId }> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let snippet: string | undefined
  try {
    const j = JSON.parse(text)
    snippet = j?.error?.message ?? j?.message
  } catch { /* not json */ }
  return {
    caseId: 'A',
    status: res.status,
    errorSnippet: snippet?.slice(0, 200) ?? text.slice(0, 200),
  }
}

function verdictMark(c: Case, r: RunResult): string {
  const want = c.expectStatus === 'ok' ? 'ok' : 'badRequest'
  const got = r.status >= 200 && r.status < 300 ? 'ok' : (r.status >= 400 && r.status < 500) ? 'badRequest' : 'other'
  if (want === got) return '✅'
  return '❌'
}

function statusFlag(r: RunResult): string {
  if (r.status >= 200 && r.status < 300) return `${r.status} OK`
  if (r.status >= 400 && r.status < 500) return `${r.status} 4xx`
  return `${r.status}`
}

async function probeOneModel(endpoint: string, token: string, m: ProbeModel) {
  console.log(`\n──── ${m.label}  [${m.modelId}, ${m.category}] ────`)
  const row: Record<CaseId, RunResult> = {} as any
  for (const c of CASES) {
    process.stdout.write(`  [${c.id}] ${c.desc} ... `)
    try {
      const body = c.buildBody(m.modelId)
      const r = await runCase(endpoint, token, body)
      row[c.id] = r
      const mark = verdictMark(c, r)
      console.log(`${mark} ${statusFlag(r)}${r.errorSnippet ? ` | ${r.errorSnippet}` : ''}`)
    } catch (e) {
      row[c.id] = { caseId: c.id, status: -1, errorSnippet: (e as Error).message }
      console.log(`❌ throw: ${(e as Error).message}`)
    }
  }
  return { model: m, row }
}

async function resolveToken(): Promise<string> {
  const env = process.env.OPENLOAF_TEST_SAAS_TOKEN?.trim()
  if (env) {
    console.log('  token: from OPENLOAF_TEST_SAAS_TOKEN')
    return env
  }
  console.log('  token: ensureServerAccessToken() (refresh from disk)')
  const t = await ensureServerAccessToken()
  if (!t) {
    throw new Error(
      'No SaaS token available. Set OPENLOAF_TEST_SAAS_TOKEN or login OpenLoaf desktop first.',
    )
  }
  return t
}

async function main() {
  console.log('=== response_format compatibility matrix ===')
  const baseUrl = (process.env.SAAS_OVERRIDE_URL || getSaasBaseUrl()).replace(/\/+$/, '')
  console.log(`  saasBaseUrl: ${baseUrl}${process.env.SAAS_OVERRIDE_URL ? ' (override)' : ''}`)
  const token = await resolveToken()

  // 优先从 v3 capabilities 自动拉清单（最新最全）；回退到 /v1/models；都不行用默认
  let probes: ProbeModel[] = []
  const v3 = await fetchV3ChatCapabilities(baseUrl)
  if (v3.length > 0) {
    probes = v3
    console.log(`  models from v3 capabilities: ${probes.map((p) => p.modelId).join(', ')}`)
  } else {
    const available = await fetchAvailableModelIds(baseUrl, token)
    if (available.size > 0) {
      probes = DEFAULT_PROBE_MODELS.filter((p) => available.has(p.modelId))
      console.log(`  models from /v1/models: ${probes.map((p) => p.modelId).join(', ')}`)
    } else {
      probes = DEFAULT_PROBE_MODELS
      console.log('  ⚠️ no model list endpoint reachable, using default probe list')
    }
  }

  const endpoint = `${baseUrl}/api/v1/chat/completions`
  console.log(`  endpoint: ${endpoint}\n`)

  const rows: Array<Awaited<ReturnType<typeof probeOneModel>>> = []
  for (const m of probes) {
    rows.push(await probeOneModel(endpoint, token, m))
  }

  // 汇总表
  console.log('\n========= 汇总 =========\n')
  const header = `${'model'.padEnd(40)} | ${'cat'.padEnd(10)} |  A  |  B  |  C  |  D `
  console.log(header)
  console.log('-'.repeat(header.length))
  for (const r of rows) {
    const mark = (id: CaseId) => verdictMark(CASES.find((c) => c.id === id)!, r.row[id])
    const status = (id: CaseId) => `${mark(id)}${r.row[id].status}`
    console.log(
      `${r.model.label.padEnd(40)} | ${r.model.category.padEnd(10)} | ${status('A').padEnd(4)}| ${status('B').padEnd(4)}| ${status('C').padEnd(4)}| ${status('D').padEnd(4)}`,
    )
  }

  // 关键判定
  const dashscope = rows.filter((r) => r.model.category === 'dashscope')
  const others = rows.filter((r) => r.model.category !== 'dashscope')
  const dashscopeReproduced = dashscope.some((r) => r.row.C.status === 400)
  const othersAllOk = others.every((r) => {
    if (r.row.C.status === 0 || r.row.C.status === -1) return true // 跳过不可达
    return r.row.C.status >= 200 && r.row.C.status < 300
  })

  console.log('\n========= 结论 =========')
  console.log(`  ① dashscope 系 case C 触发 400：${dashscopeReproduced ? '✅ 已复现' : '❌ 未观察到'}`)
  console.log(`  ② 其他 provider case C 全部通过：${othersAllOk ? '✅ 是（修复仅动 dashscope 不影响他们）' : '❌ 否（需要重新评估修复方案）'}`)
  if (dashscopeReproduced && othersAllOk) {
    console.log('\n🎯 影响面评估：可以放心做 provider-conditional 修复（仅对 dashscope 注入 "json" 提示）')
  }

  process.exit(dashscopeReproduced && othersAllOk ? 0 : 1)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
