/**
 * Vitest Browser Mode config for chat probe testing.
 */
/// <reference types="@vitest/browser/providers/playwright" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import {
  readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync,
  copyFileSync, statSync, unlinkSync,
} from 'node:fs'
import { join, basename, isAbsolute } from 'node:path'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import type { BrowserCommand } from 'vitest/node'

const root = dirname(fileURLToPath(import.meta.url))

function detectServerUrl(): string {
  if (process.env.PROBE_SERVER_URL) return process.env.PROBE_SERVER_URL
  for (const port of [23333, 23334]) {
    try {
      execSync(`curl -sS --max-time 1 http://127.0.0.1:${port}/health`, { stdio: 'pipe' })
      return `http://127.0.0.1:${port}`
    } catch {}
  }
  return 'http://127.0.0.1:23333'
}

const serverUrl = detectServerUrl()

const require = createRequire(import.meta.url)
const reactDir = dirname(require.resolve('react/package.json'))
const reactDomDir = dirname(require.resolve('react-dom/package.json'))
const tslibDir = dirname(require.resolve('tslib/package.json'))

// ── recordProbeRun command (Node.js side) ──

const SKILL_ROOT = resolve(root, '../../.agents/skills/ai-browser-test')
const RUNS_JSONL = join(SKILL_ROOT, 'runs.jsonl')
const TEST_CASES_DIR = join(SKILL_ROOT, 'test-cases')
const CLOUD_MOCK_FIXTURES_DIR = join(SKILL_ROOT, 'fixtures', 'cloud-mocks')
const MONO_ROOT = resolve(root, '../..')

// ── Cloud fingerprint ──
// 关键文件变动 → 指纹变动 → 后续决策器必须走真实调用，不可 mock。
const CLOUD_FINGERPRINT_FILES = [
  'apps/server/src/ai/tools/cloud/cloudNamedTools.ts',
  'apps/server/src/ai/tools/cloud/cloudTools.ts',
  'apps/server/src/ai/tools/cloud/cloudToolsDynamic.ts',
  'apps/server/src/ai/builtin-skills/cloud-skills.ts',
  'apps/server/src/ai/tools/toolRegistry.ts',
  'apps/server/src/ai/tools/toolSearchTool.ts',
  'packages/api/src/types/tools/cloud.ts',
  'apps/web/src/components/ai/message/tools/CloudModelGenerateTool.tsx',
]

let cachedCloudFingerprint: string | null = null
function computeCloudFingerprint(): string {
  if (cachedCloudFingerprint) return cachedCloudFingerprint
  const h = createHash('sha256')
  for (const rel of CLOUD_FINGERPRINT_FILES) {
    const abs = join(MONO_ROOT, rel)
    h.update(rel)
    h.update('\0')
    if (existsSync(abs)) h.update(readFileSync(abs))
    else h.update('MISSING')
    h.update('\n')
  }
  cachedCloudFingerprint = h.digest('hex').slice(0, 12)
  return cachedCloudFingerprint
}

function normalizePromptForHash(prompt: string): string {
  return (prompt || '')
    .replace(/<system-tag[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
function hashPrompt(prompt: string): string {
  return createHash('sha256').update(normalizePromptForHash(prompt)).digest('hex').slice(0, 10)
}

const CLOUD_GEN_TOOL_NAMES = new Set([
  'CloudImageGenerate', 'CloudImageEdit', 'CloudVideoGenerate',
  'CloudTTS', 'CloudSpeechRecognize', 'CloudImageUnderstand',
])
function detectCloudGenTools(toolCalls: string[] | undefined): string[] {
  if (!Array.isArray(toolCalls)) return []
  const seen = new Set<string>()
  for (const name of toolCalls) if (CLOUD_GEN_TOOL_NAMES.has(name)) seen.add(name)
  return [...seen]
}

/**
 * 测试结束后扫 fixtures/cloud-mocks/<testCase>/，识别本次 run 新生成的 fixture。
 * Server 侧在 cloud 工具 execute 成功时已就地写好 toolResult.json / meta.json / asset，
 * 这里只是读目录认领。
 */
function computeCaptureTargetDir(testCase: string, prompt: string, fingerprint: string): string {
  const fixtureId = `${fingerprint}_${hashPrompt(prompt)}`
  return join(CLOUD_MOCK_FIXTURES_DIR, testCase, fixtureId)
}
function readCapturedFixture(captureDir: string): null | {
  fixtureId: string
  path: string
  toolName: string
} {
  const metaPath = join(captureDir, 'meta.json')
  const resultPath = join(captureDir, 'toolResult.json')
  if (!existsSync(metaPath) || !existsSync(resultPath)) return null
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    const result = JSON.parse(readFileSync(resultPath, 'utf-8'))
    return {
      fixtureId: basename(captureDir),
      path: captureDir,
      toolName: String(result.toolName ?? meta.mockTool ?? ''),
    }
  } catch {
    return null
  }
}
const HISTORY_ROOTS = [
  join(homedir(), 'OpenLoafData', 'chat-history'),
  join(homedir(), '.openloaf', 'chat-history'),
]

function findHistory(sessionId: string): string | null {
  for (const root of HISTORY_ROOTS) {
    const c = join(root, sessionId)
    if (existsSync(join(c, 'messages.jsonl'))) return c
  }
  const dataRoot = join(homedir(), 'OpenLoafData')
  if (existsSync(dataRoot)) {
    try {
      for (const e of readdirSync(dataRoot, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name === 'chat-history') continue
        const c = join(dataRoot, e.name, '.openloaf', 'chat-history', sessionId)
        if (existsSync(join(c, 'messages.jsonl'))) return c
      }
    } catch {}
  }
  return null
}

function gitInfo() {
  try {
    return {
      commit: execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim() || null,
      branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim() || null,
    }
  } catch { return { commit: null, branch: null } }
}

/** 从 tags 或 testCase 名字推断 suite。 */
function inferSuite(input: { tags?: string[]; testCase?: string }): string {
  const tags = input.tags ?? []
  // 已知 suite tag 优先
  for (const t of tags) {
    if (t === 'skill-market' || t === 'chat') return t
  }
  const tc = input.testCase ?? ''
  if (tc.startsWith('skill-market-')) return 'skill-market'
  return 'chat'
}

/**
 * 把 fixture 元数据追加到 test-cases/<name>.yaml 的 fixtures 列表里（幂等）。
 * yaml 存的是 `#` 分隔的单行条目，避免引入 yaml 解析依赖。
 */
function upsertFixtureInYaml(
  yamlPath: string,
  fixture: { fixtureId: string; toolName: string; path: string; fingerprint: string; createdAt: string },
) {
  let content = existsSync(yamlPath) ? readFileSync(yamlPath, 'utf-8') : ''
  if (!content.includes('\nfixtures:')) {
    if (content.length > 0 && !content.endsWith('\n')) content += '\n'
    content += '\nfixtures:\n'
  }
  // 简化判定：已存在 fixtureId 直接跳过
  if (content.includes(`  - fixtureId: ${fixture.fixtureId}`)) {
    return
  }
  const relPath = `${fixture.path.split('/fixtures/').pop() ?? fixture.path}`
  const entry = [
    `  - fixtureId: ${fixture.fixtureId}`,
    `    toolName: ${fixture.toolName}`,
    `    fingerprint: ${fixture.fingerprint}`,
    `    createdAt: ${fixture.createdAt}`,
    `    path: fixtures/${relPath}`,
    '',
  ].join('\n')
  if (!content.endsWith('\n')) content += '\n'
  writeFileSync(yamlPath, content + entry, 'utf-8')
}

const recordProbeRun: BrowserCommand<[any]> = async (_ctx, input) => {
  ensureRunMeta()
  const { testCase, prompt, model: modelFromInput, description, tags, result } = input
  // 测试没显式传 `model` 时，fallback 到 ProbeResult.chatModelId（harness 实际用的模型）
  const resultModel = typeof result?.chatModelId === 'string' ? result.chatModelId : null
  const model = modelFromInput ?? resultModel ?? null
  const historyPath = findHistory(result.sessionId)
  let runRecorded = false
  const suite = inferSuite(input)
  const cloudFingerprint = computeCloudFingerprint()
  const genTools = detectCloudGenTools(result.toolCalls)

  // Fixture 不再在这里生成 —— server 侧 cloud 工具 execute 成功时已就地写好。
  // 这里只负责认领：计算目标目录路径，看 server 有没有写进去，写了就记录。
  let fixtureCaptured: { fixtureId: string; path: string; toolName: string } | null = null
  if (testCase && result.status === 'ok' && genTools.length > 0) {
    const captureDir = computeCaptureTargetDir(testCase, prompt, cloudFingerprint)
    const loaded = readCapturedFixture(captureDir)
    if (loaded) fixtureCaptured = loaded
  }

  if (testCase) {
    if (!existsSync(TEST_CASES_DIR)) mkdirSync(TEST_CASES_DIR, { recursive: true })
    const yamlPath = join(TEST_CASES_DIR, `${testCase}.yaml`)
    if (!existsSync(yamlPath)) {
      writeFileSync(yamlPath, [
        `name: ${testCase}`,
        `description: "${description ?? ''}"`,
        `prompt: ${JSON.stringify(prompt)}`,
        `model: ${model ?? 'null'}`,
        `platform: web`,
        `tags: [${(tags ?? []).join(', ')}]`,
        `createdAt: ${new Date().toISOString()}`,
      ].join('\n') + '\n', 'utf-8')
    }
    // 成功采集到 fixture → 回填 yaml 里的 fixtures 列表（给 Phase 2 决策器读）
    if (fixtureCaptured) {
      try {
        upsertFixtureInYaml(yamlPath, {
          fixtureId: fixtureCaptured.fixtureId,
          toolName: fixtureCaptured.toolName,
          path: fixtureCaptured.path,
          fingerprint: cloudFingerprint,
          createdAt: new Date().toISOString(),
        })
      } catch (err) {
        console.warn('[yaml-upsert] failed:', err instanceof Error ? err.message : err)
      }
    }
    const git = gitInfo()
    const runDir = process.env.BROWSER_TEST_RUN_DIR || null
    const screenshotsDir = runDir ? join(runDir, 'screenshots') : null
    // 从 messages.jsonl 读取服务端持久化的 metadata，汇总 creditsConsumed 写入 runs.jsonl
    // 生成报告时 run?.creditsConsumed 即可直接取到
    const enriched = enrichMessagesWithHistoryMetadata(result)
    const creditsConsumed = typeof enriched?.creditsConsumed === 'number' ? enriched.creditsConsumed : null
    appendFileSync(RUNS_JSONL, JSON.stringify({
      testCase, suite, runAt: result.startedAt, sessionId: result.sessionId, historyPath,
      screenshotsDir,
      status: result.status, elapsedMs: result.elapsedMs, toolCalls: result.toolCalls,
      toolCallDetails: result.toolCallDetails ?? [],
      finishReason: result.finishReason, errorText: result.error ?? null,
      model: model ?? null, platform: 'web', prompt,
      textPreview: result.textPreview,
      trigger: 'vitest-browser',
      gitCommit: git.commit, gitBranch: git.branch,
      cloudFingerprint,
      cloudGenTools: genTools,
      cloudFixture: fixtureCaptured
        ? { fixtureId: fixtureCaptured.fixtureId, path: fixtureCaptured.path, toolName: fixtureCaptured.toolName }
        : null,
      ...(creditsConsumed != null && creditsConsumed > 0 ? { creditsConsumed } : {}),
    }) + '\n', 'utf-8')
    runRecorded = true
  }

  let sessionMarked = false
  if (historyPath) {
    try {
      const existing = JSON.parse(readFileSync(join(historyPath, 'session.json'), 'utf-8'))
      writeFileSync(join(historyPath, 'session.json'), JSON.stringify({
        ...existing, autoTest: true,
        probeMeta: { runner: 'ai-browser-test', prompt, model: model ?? null, platform: 'web', startedAt: result.startedAt, testCase },
      }, null, 2), 'utf-8')
      sessionMarked = true
    } catch {}
  }

  return {
    historyPath, sessionMarked, runRecorded,
    cloudFingerprint,
    cloudGenTools: genTools,
    cloudFixture: fixtureCaptured,
  }
}

// ── getCloudFingerprint / listCloudFixtures / resolveCloudMockDirs ──
// 给测试文件和后续决策器查询代码指纹与现有 fixture 候选。

const getCloudFingerprint: BrowserCommand<[]> = async () => {
  return { fingerprint: computeCloudFingerprint(), files: CLOUD_FINGERPRINT_FILES }
}

/**
 * Harness 调用该 command 拿到 capture 目标 + 现有可用 fixture。浏览器端
 * 不能自己算文件路径，所以走 command 统一在 Node 端计算，再回 POST 到
 * /debug/cloud-mock。
 */
const resolveCloudMockDirs: BrowserCommand<[{
  testCase: string
  prompt: string
}]> = async (_ctx, { testCase, prompt }) => {
  const fingerprint = computeCloudFingerprint()
  const promptHash = hashPrompt(prompt)
  const fixtureId = `${fingerprint}_${promptHash}`
  const captureDir = join(CLOUD_MOCK_FIXTURES_DIR, testCase, fixtureId)
  // 同 testCase 下所有已有 fixture（含不同 promptHash / fingerprint）
  const dir = join(CLOUD_MOCK_FIXTURES_DIR, testCase)
  const candidates: Array<{
    fixtureId: string
    path: string
    fingerprint: string
    promptHash: string
    fingerprintMatches: boolean
    hasToolResult: boolean
  }> = []
  if (existsSync(dir)) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const p = join(dir, e.name)
      const meta = join(p, 'meta.json')
      if (!existsSync(meta)) continue
      try {
        const m = JSON.parse(readFileSync(meta, 'utf-8'))
        candidates.push({
          fixtureId: e.name,
          path: p,
          fingerprint: String(m.fingerprint ?? ''),
          promptHash: String(m.promptHash ?? ''),
          fingerprintMatches: m.fingerprint === fingerprint,
          hasToolResult: existsSync(join(p, 'toolResult.json')),
        })
      } catch {}
    }
  }
  return {
    fingerprint,
    promptHash,
    fixtureId,
    captureDir,
    candidates,
  }
}

const listCloudFixtures: BrowserCommand<[{ testCase: string }]> = async (_ctx, { testCase }) => {
  const dir = join(CLOUD_MOCK_FIXTURES_DIR, testCase)
  const current = computeCloudFingerprint()
  if (!existsSync(dir)) return { testCase, currentFingerprint: current, fixtures: [] }
  const out: Array<{
    fixtureId: string
    path: string
    fingerprint: string
    promptHash: string
    promptPreview: string
    genTools: string[]
    createdAt: string
    fingerprintMatches: boolean
  }> = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const metaPath = join(dir, e.name, 'meta.json')
    if (!existsSync(metaPath)) continue
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      out.push({
        fixtureId: e.name,
        path: join(dir, e.name),
        fingerprint: meta.fingerprint,
        promptHash: meta.promptHash,
        promptPreview: String(meta.prompt ?? '').slice(0, 160),
        genTools: meta.genTools ?? [],
        createdAt: meta.createdAt,
        fingerprintMatches: meta.fingerprint === current,
      })
    } catch {}
  }
  return { testCase, currentFingerprint: current, fixtures: out }
}

// ── stageAttachments command ──
// 复制附件到 chat-history/<sessionId>/asset/，返回注入 prompt 的 <system-tag> 标签
const CHAT_HISTORY_ROOT = process.env.OPENLOAF_CHAT_HISTORY_ROOT
  ?? join(homedir(), 'OpenLoafData', 'chat-history')
const FIXTURES_DIR = join(SKILL_ROOT, 'fixtures')

const stageAttachments: BrowserCommand<[{
  sessionId: string
  files: string[]
  /** 对首个文件（或所有文件）append 零字节 pad 到指定大小（测超限 fallback 路径用） */
  padToBytes?: number
}]> = async (
  _ctx, { sessionId, files, padToBytes },
) => {
  if (!files.length) return { tags: [], copied: [] }
  const assetDir = join(CHAT_HISTORY_ROOT, sessionId, 'asset')
  mkdirSync(assetDir, { recursive: true })

  const usedNames = new Set<string>()
  const tags: string[] = []
  const copied: Array<{ source: string; dest: string; basename: string; bytes: number }> = []

  for (const raw of files) {
    // 相对路径基于 fixtures/ 目录解析
    const abs = isAbsolute(raw) ? raw : join(FIXTURES_DIR, raw.replace(/^fixtures\//, ''))
    if (!existsSync(abs)) throw new Error(`stageAttachments: file not found: ${abs}`)
    if (!statSync(abs).isFile()) throw new Error(`stageAttachments: not a file: ${abs}`)

    let name = basename(abs)
    if (usedNames.has(name)) {
      const dot = name.lastIndexOf('.')
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      let n = 2
      while (usedNames.has(`${stem} (${n})${ext}`)) n++
      name = `${stem} (${n})${ext}`
    }
    usedNames.add(name)
    const dest = join(assetDir, name)
    copyFileSync(abs, dest)
    // 若要 pad 首文件到超限大小，在 copy 后 append 零字节
    if (padToBytes && copied.length === 0) {
      const current = statSync(dest).size
      if (padToBytes > current) {
        appendFileSync(dest, Buffer.alloc(padToBytes - current))
      }
    }
    copied.push({ source: abs, dest, basename: name, bytes: statSync(dest).size })
    tags.push(`<system-tag type="attachment" path="\${CURRENT_CHAT_DIR}/${name}" />`)
  }
  return { tags, copied }
}

// ── readSessionUserTags command ──
// 读 session messages.jsonl 首条 user message 的 raw text，供 033 验证
// attachment tag 是否在 CDN 上传成功后被回写为带 url="https://..." 的 V2 格式。
const readSessionUserTags: BrowserCommand<[{ sessionId: string }]> = async (
  _ctx, { sessionId },
) => {
  const historyPath = findHistory(sessionId)
  if (!historyPath) return { found: false, firstUserText: '', hasUrlAttr: false }
  try {
    const lines = readFileSync(join(historyPath, 'messages.jsonl'), 'utf-8')
      .split('\n').filter(l => l.trim())
    for (const line of lines) {
      const row = JSON.parse(line)
      if (row?.role !== 'user') continue
      const parts = Array.isArray(row?.parts) ? row.parts : []
      const text = parts
        .filter((p: any) => p?.type === 'text')
        .map((p: any) => p?.text ?? '').join('')
      return {
        found: true,
        firstUserText: text,
        hasUrlAttr: /<system-tag[^>]+\burl=/i.test(text),
      }
    }
  } catch {}
  return { found: false, firstUserText: '', hasUrlAttr: false }
}

// ── fetchAutoTitle command ──
// 直接调 tRPC chat.autoTitle 触发辅助模型生成标题，供 036 验证辅助模型
// 能看到多模态输入并产出贴合图片内容的标题。
const fetchAutoTitle: BrowserCommand<[{ serverUrl: string; sessionId: string }]> = async (
  _ctx, { serverUrl, sessionId },
) => {
  // ?batch=1 与 body 里的 `{"0":{json:...}}` 必须配套使用——否则 tRPC 会把整个
  // body 当单 call 输入、SuperJSON 解析失败返回 400。
  const res = await fetch(`${serverUrl}/trpc/chat.autoTitle?batch=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-OpenLoaf-Client': '1' },
    body: JSON.stringify({ '0': { json: { sessionId } } }),
  })
  const text = await res.text()
  try {
    const json = JSON.parse(text)
    const title = json?.[0]?.result?.data?.json?.title
      ?? json?.result?.data?.json?.title
      ?? ''
    return { ok: !!title, title: typeof title === 'string' ? title : '', raw: text.slice(0, 400) }
  } catch {
    return { ok: false, title: '', raw: text.slice(0, 400) }
  }
}

// ── snapshotMemory / restoreMemory commands ──
// 真实后端的 MemorySave (scope=user) 会写到 ~/OpenLoafData/memory/，跨测试持久化。
// 测试前快照整个目录，测试后恢复 → 既能验证工具被触发，又不污染用户真实记忆。
// 只处理 user-scope（项目 scope 记忆本来就隔在具体项目目录下，测试不会碰）。

type MemorySnapshot = {
  dir: string
  indexContent: string | null
  files: Record<string, string>
}

const USER_MEMORY_DIR = join(homedir(), 'OpenLoafData', 'memory')

const snapshotMemory: BrowserCommand<[]> = async (): Promise<MemorySnapshot> => {
  const snap: MemorySnapshot = { dir: USER_MEMORY_DIR, indexContent: null, files: {} }
  if (!existsSync(USER_MEMORY_DIR)) return snap
  try {
    const indexPath = join(USER_MEMORY_DIR, 'MEMORY.md')
    if (existsSync(indexPath)) snap.indexContent = readFileSync(indexPath, 'utf-8')
    for (const e of readdirSync(USER_MEMORY_DIR, { withFileTypes: true })) {
      if (!e.isFile()) continue
      if (e.name === 'MEMORY.md') continue
      snap.files[e.name] = readFileSync(join(USER_MEMORY_DIR, e.name), 'utf-8')
    }
  } catch (err) {
    console.warn('[snapshotMemory] failed:', err instanceof Error ? err.message : err)
  }
  return snap
}

const restoreMemory: BrowserCommand<[MemorySnapshot]> = async (_ctx, snap) => {
  if (!snap || typeof snap !== 'object') return { ok: false, reason: 'invalid snapshot' }
  const removed: string[] = []
  const restoredIndex = snap.indexContent !== null
  try {
    if (!existsSync(USER_MEMORY_DIR)) mkdirSync(USER_MEMORY_DIR, { recursive: true })
    // 删除 snapshot 之后新增的 md 文件（不动 agents 子目录之类的非文件）
    for (const e of readdirSync(USER_MEMORY_DIR, { withFileTypes: true })) {
      if (!e.isFile()) continue
      if (e.name === 'MEMORY.md') continue
      if (!(e.name in snap.files)) {
        unlinkSync(join(USER_MEMORY_DIR, e.name))
        removed.push(e.name)
      }
    }
    // 还原 MEMORY.md（原来就有则写回，原来没有则删除）
    const indexPath = join(USER_MEMORY_DIR, 'MEMORY.md')
    if (snap.indexContent !== null) {
      writeFileSync(indexPath, snap.indexContent, 'utf-8')
    } else if (existsSync(indexPath)) {
      unlinkSync(indexPath)
    }
    return { ok: true, removed, restoredIndex }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

// ── requestAiDecision command ──
// 文件握手协议：浏览器测试写 pending-decision.json，轮询 decision-response.json。
// AI agent（Claude Code）在后台读取 pending，思考后写 response，测试继续。

const PENDING_PATH = join(SKILL_ROOT, 'pending-decision.json')
const RESPONSE_PATH = join(SKILL_ROOT, 'decision-response.json')

const requestAiDecision: BrowserCommand<[{
  type: string
  context: Record<string, unknown>
  screenshotPath?: string
}]> = async (_ctx, input) => {
  // 清理旧响应
  try { if (existsSync(RESPONSE_PATH)) unlinkSync(RESPONSE_PATH) } catch {}

  // 写入待决策文件
  writeFileSync(PENDING_PATH, JSON.stringify({
    ...input,
    requestedAt: new Date().toISOString(),
  }, null, 2), 'utf-8')

  // 轮询响应（最长 5 分钟）
  const deadline = Date.now() + 300_000
  while (Date.now() < deadline) {
    if (existsSync(RESPONSE_PATH)) {
      const raw = readFileSync(RESPONSE_PATH, 'utf-8')
      const response = JSON.parse(raw)
      try { unlinkSync(PENDING_PATH) } catch {}
      try { unlinkSync(RESPONSE_PATH) } catch {}
      return response
    }
    await new Promise(r => setTimeout(r, 500))
  }

  // 超时清理
  try { unlinkSync(PENDING_PATH) } catch {}
  throw new Error('Timeout: AI decision not received within 5 minutes')
}

// ── saveTestData command ──
// 将每个测试的 ProbeResult 保存到运行目录，供报告生成器使用
import { readTestCaseSpec } from './src/test/browser/test-case-spec.mjs'
const TEST_CASES_DIR_ABS = resolve(root, '../../.agents/skills/ai-browser-test/test-cases')

/**
 * 把 server 端持久化到 messages.jsonl 的 metadata 合并回 probe result 的 messages。
 *
 * Why：useChat 在浏览器端的 messages 对象不带 message.metadata（SSE 流的
 * messageMetadata part 被 SDK 吞进内部状态，没暴露到 getSnapshot）。而 server
 * 已经把 metadata（含 openloaf.creditsConsumed / totalUsage.inputTokens 等）写
 * 到了 messages.jsonl。两件事一次做：
 *   1) 按 id 把 metadata 贴回 probe messages，报告时间线能渲染徽章
 *   2) 从 jsonl 聚合 creditsConsumed 写进 result（权威来源）
 *
 * 失败路径特别重要：ChatProbeHarness 在 error 分支写 ProbeResult 时，
 * `chat.messages` 可能已被清空（msg count = 0）。这种场景 id-merge 拿不到任何
 * credits，但 jsonl 里却是完整的 —— 所以总 credits 必须直接从 jsonl 全量聚合，
 * 并在 probe messages 为空时用 jsonl messages 兜底填充，保证报告能看到对话与成本。
 *
 * 容错：history 不存在 / jsonl 损坏 / 单行 parse 失败都不抛，返回原 result。
 */
function enrichMessagesWithHistoryMetadata(
  result: Record<string, unknown>,
): Record<string, unknown> {
  const sessionId = typeof result?.sessionId === 'string' ? result.sessionId : null
  if (!sessionId) return result
  const historyPath = findHistory(sessionId)
  if (!historyPath) return result
  const jsonlPath = join(historyPath, 'messages.jsonl')
  if (!existsSync(jsonlPath)) return result

  // 扫一遍 jsonl：既建 id→metadata 索引，也全量聚合 credits + 收集消息兜底
  const metaById = new Map<string, Record<string, unknown>>()
  const jsonlMessages: Record<string, unknown>[] = []
  let creditsFromJsonl = 0
  try {
    for (const line of readFileSync(jsonlPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue
      try {
        const row = JSON.parse(line) as Record<string, unknown>
        jsonlMessages.push(row)
        const id = typeof row?.id === 'string' ? row.id : null
        const meta = row?.metadata
        if (id && meta && typeof meta === 'object') {
          metaById.set(id, meta as Record<string, unknown>)
          if (row.role === 'assistant') {
            const ol = (meta as Record<string, unknown>).openloaf as Record<string, unknown> | undefined
            const c = ol && typeof ol.creditsConsumed === 'number' ? ol.creditsConsumed : 0
            if (c > 0) creditsFromJsonl += c
          }
        }
      } catch { /* skip malformed line */ }
    }
  } catch { return result }

  // 合并 probe messages 上的 metadata（按 id），失败路径 messages 为空也不影响
  const rawMessages = Array.isArray(result?.messages) ? result.messages : []
  let creditsFromProbe = 0
  const mergedProbe = rawMessages.map((m: unknown) => {
    if (!m || typeof m !== 'object') return m
    const msg = m as Record<string, unknown>
    if (msg.role !== 'assistant') return msg
    const id = typeof msg.id === 'string' ? msg.id : null
    if (!id) return msg
    const meta = metaById.get(id)
    if (!meta) return msg
    const openloaf = meta.openloaf as Record<string, unknown> | undefined
    const credits = openloaf && typeof openloaf.creditsConsumed === 'number' ? openloaf.creditsConsumed : 0
    if (credits > 0) creditsFromProbe += credits
    return { ...msg, metadata: meta }
  })

  // Probe messages 空（失败路径）→ 用 jsonl messages 兜底，让时间线仍可观察对话
  const finalMessages = mergedProbe.length > 0 ? mergedProbe : jsonlMessages
  // credits 以 jsonl 全量聚合为权威，probe 合并值只作二次校验
  const creditsSum = creditsFromJsonl > 0 ? creditsFromJsonl : creditsFromProbe

  const enriched: Record<string, unknown> = { ...result, messages: finalMessages }
  if (creditsSum > 0) enriched.creditsConsumed = creditsSum
  return enriched
}
const saveTestData: BrowserCommand<[{
  testCase: string
  prompt: string
  result: Record<string, unknown>
  model?: string
  description?: string
  tags?: string[]
}]> = async (_ctx, input) => {
  ensureRunMeta()
  const targetDir = resolve(root, `browser-test-runs/${runLabel}`)
  const dataDir = join(targetDir, 'data')
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  const fileName = (input.testCase || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')
  const filePath = join(dataDir, `${fileName}.json`)
  const yamlPath = join(TEST_CASES_DIR_ABS, `${input.testCase}.yaml`)
  const spec = readTestCaseSpec(yamlPath) as { description: string | null; purpose: string | null }
  // 从 messages.jsonl 补回 metadata（useChat 不向前端暴露 message.metadata）
  const enrichedResult = enrichMessagesWithHistoryMetadata(input.result)
  // 模型 fallback：优先用测试显式传的 `input.model`，否则从 ProbeResult.chatModelId 取 harness 实际使用值。
  // 这样不用改所有测试代码，主页索引就能显示模型徽章。
  const resultModel = typeof (input.result as any)?.chatModelId === 'string'
    ? (input.result as any).chatModelId as string
    : null
  const effectiveModel = input.model ?? resultModel ?? null
  writeFileSync(filePath, JSON.stringify({
    testCase: input.testCase,
    prompt: input.prompt,
    model: effectiveModel,
    description: input.description ?? null,
    tags: input.tags ?? [],
    // Pull human/AI-readable spec from the test-case yaml (persists across runs).
    // `description` above is the one-liner passed from the test file; `purpose`
    // is the long-form markdown block humans maintain in the yaml.
    purpose: spec.purpose,
    specDescription: spec.description,
    result: enrichedResult,
    savedAt: new Date().toISOString(),
  }, null, 2), 'utf-8')
  return { filePath }
}

// ── appendAiJudge command ──
// 把 aiJudge() 的判决结果合并到已写入的 data/<testCase>.json。
// Why：saveTestData 在测试开头落盘，aiJudge 在断言前才调用，单靠 saveTestData
// 拿不到 judge 结果。这里以 testCase 为键，追加到 `aiJudges` 数组——单次测试
// 可能跑多次 aiJudge（例如同时校验回复内容和工具选择），全部保留。
const appendAiJudge: BrowserCommand<[{
  testCase: string
  criteria: string
  aiResponse: string
  userPrompt?: string
  toolCalls?: string[]
  judgment: { pass: boolean; score: number; reason: string; raw?: string }
}]> = async (_ctx, input) => {
  const targetDir = resolve(root, `browser-test-runs/${runLabel}`)
  const dataDir = join(targetDir, 'data')
  const fileName = (input.testCase || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')
  const filePath = join(dataDir, `${fileName}.json`)
  if (!existsSync(filePath)) return { filePath, appended: false }
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const existing = Array.isArray(parsed.aiJudges) ? parsed.aiJudges : []
    parsed.aiJudges = [
      ...existing,
      {
        ts: new Date().toISOString(),
        criteria: input.criteria,
        aiResponse: input.aiResponse,
        userPrompt: input.userPrompt ?? null,
        toolCalls: input.toolCalls ?? [],
        pass: input.judgment.pass,
        score: input.judgment.score,
        reason: input.judgment.reason,
        raw: input.judgment.raw ?? null,
      },
    ]
    writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8')
    return { filePath, appended: true }
  } catch (err) {
    return { filePath, appended: false, error: String(err) }
  }
}

// ── 运行目录命名：纯 seq（如 0042/），时间戳写在内部 run-meta.json ──
// seq 单调递增，遍历 browser-test-runs 里已有目录取 max(seq)+1；若全是老的纯 timestamp
// 目录（没 seq 前缀），按目录数 +1 做起点，保证累计编号不回退。
const runTimestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)
function computeNextRunSeq(runsRoot: string): number {
  if (!existsSync(runsRoot)) return 1
  let maxSeq = 0
  let legacyCount = 0
  try {
    for (const d of readdirSync(runsRoot)) {
      // 支持三种历史格式：纯 seq（新）、seq_ts（中间态）、纯 ts（老）
      const seqMatch = d.match(/^(\d+)(?:_\d{8}_\d{6})?$/)
      const isPureSeq = seqMatch && !d.includes('_')
      const isSeqWithTs = seqMatch && !isPureSeq
      if (isPureSeq || isSeqWithTs) {
        maxSeq = Math.max(maxSeq, Number.parseInt(seqMatch![1], 10))
      } else if (/^\d{8}_\d{6}/.test(d)) {
        legacyCount++
      }
    }
  } catch { /* ignore */ }
  return (maxSeq > 0 ? maxSeq : legacyCount) + 1
}
const runSeq = computeNextRunSeq(resolve(root, 'browser-test-runs'))
const runLabel = String(runSeq).padStart(4, '0')
const runDir = `./browser-test-runs/${runLabel}`
const runDirAbs = resolve(root, runDir)
process.env.BROWSER_TEST_RUN_DIR = runDirAbs
process.env.BROWSER_TEST_RUN_SEQ = String(runSeq)

// run-meta.json 懒写：配置被 import 但未跑测试时（tsc/IDE/tooling），eager 创建会留下空 dir。
// 第一个真实的 browser command（saveTestData / recordProbeRun）触发时再写。
let metaWritten = false
function ensureRunMeta() {
  if (metaWritten) return
  metaWritten = true
  try {
    mkdirSync(runDirAbs, { recursive: true })
    writeFileSync(
      join(runDirAbs, 'run-meta.json'),
      JSON.stringify({
        seq: runSeq,
        startedAt: new Date().toISOString(),
        startedAtLocal: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        legacyTimestamp: runTimestamp,
        // batch: 可选的批次标签，用于主页索引按批次分组展示
        // 由 run-browser-tests.mjs 的 --batch 参数或 BROWSER_TEST_BATCH 环境变量传入
        batch: (process.env.BROWSER_TEST_BATCH || '').trim() || null,
        // modelOverride: 可选的 runner --model 覆盖。生效时主页会在该 run 行打出 [override] 标记。
        // 注意 data/*.json / runs.jsonl 里的 `model` 字段依然是测试声明的"设计意图"，不会被这里改写。
        modelOverride: (process.env.BROWSER_TEST_MODEL_OVERRIDE || '').trim() || null,
        modelSourceOverride: (process.env.BROWSER_TEST_MODEL_SOURCE_OVERRIDE || '').trim() || null,
      }, null, 2),
      'utf-8',
    )
  } catch { /* ignore */ }
}

// ── 浏览器窗口尺寸（可通过环境变量覆盖） ──
// viewport 决定 <html> 大小，window-size 决定 Chromium 窗口外壳大小。
// 注意：Vitest UI 的 Browser UI 面板宽度 < viewport 时会把 iframe 按比例缩放
// 导致内容模糊。窗口宽度需要让中间面板可用宽度 ≥ viewport width。
// 当前分栏 mainSizes=[15,85] + detailSizes=[100,0]：
//   右侧 Dashboard 完全折叠（复刻 "Hide Right Panel" 按钮效果），
//   中间 Browser UI 可用宽 ≈ winW × 0.85。要容下 viewport 1280 → winW ≥ 1506，取 1600 留裕度。
const VIEWPORT_W = Number(process.env.BROWSER_TEST_VIEWPORT_WIDTH) || 1280
const VIEWPORT_H = Number(process.env.BROWSER_TEST_VIEWPORT_HEIGHT) || 900
const WINDOW_W = Number(process.env.BROWSER_TEST_WINDOW_WIDTH) || 1600
const WINDOW_H = Number(process.env.BROWSER_TEST_WINDOW_HEIGHT) || VIEWPORT_H + 90
// Vitest Browser API port（默认 63315），storageState origin 需要用到
const VITEST_BROWSER_API_PORT = Number(process.env.VITEST_BROWSER_API_PORT) || 63315

// ── Config ──

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NEXT_PUBLIC_SERVER_URL': JSON.stringify(serverUrl),
    'process.env.NODE_ENV': JSON.stringify('test'),
    'process.env.PROBE_SERVER_URL': JSON.stringify(serverUrl),
    '__BROWSER_TEST_RUN_DIR__': JSON.stringify(runDirAbs),
    // `pnpm test:browser:run --model <id>` 在 runner 里把 model 写到这两个 env var，
    // 这里通过 vite define 作为常量内联到浏览器端 bundle，让 ChatProbeHarness
    // 在 prop 外有一个"全局强制"入口。空字符串 = 未覆盖。
    '__BROWSER_TEST_MODEL_OVERRIDE__': JSON.stringify(process.env.BROWSER_TEST_MODEL_OVERRIDE || ''),
    '__BROWSER_TEST_MODEL_SOURCE_OVERRIDE__': JSON.stringify(process.env.BROWSER_TEST_MODEL_SOURCE_OVERRIDE || ''),
    // 系统提示词语言：默认 'en'（测试稳定性更高）；可通过 runner `--prompt-lang zh`
    // 或 env `BROWSER_TEST_PROMPT_LANG_OVERRIDE=zh` 切回中文。显式传 "" 视为未设置。
    '__BROWSER_TEST_PROMPT_LANG_OVERRIDE__': JSON.stringify(
      process.env.BROWSER_TEST_PROMPT_LANG_OVERRIDE ?? 'en'
    ),
  },
  resolve: {
    alias: {
      '@': resolve(root, 'src'),
      '@openloaf/ui': resolve(root, '../../packages/ui/src'),
      'react': reactDir,
      'react-dom': reactDomDir,
      'tslib': tslibDir,
    },
    conditions: ['development', 'browser'],
  },
  test: {
    include: ['src/**/*.browser.tsx'],
    setupFiles: ['src/test/browser/probe-setup.ts'],
    testTimeout: 300_000,
    fileParallelism: true,
    maxConcurrency: 3,
    reporters: ['default', 'json'],
    outputFile: {
      json: `${runDir}/results.json`,
    },
    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [{
        browser: 'chromium',
        // 窗口尺寸 = viewport + Chromium toolbar（约 90px 高），让窗口贴合 viewport
        // 不留空白。--ash-host-window-bounds 强制 ash 窗口尺寸（macOS Chromium）。
        viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
        launch: {
          args: [
            `--window-size=${WINDOW_W},${WINDOW_H}`,
            `--window-position=20,20`,
          ],
        },
        // Playwright context.storageState 预置 localStorage：在浏览器启动前写入
        // Vitest UI 的分栏偏好，让其 mount 时直接读到我们的值（跳过默认 [33,67]）。
        // 目标布局：左侧测试列表折叠到 15%（够点选测试名）/ 中间 Browser UI 占满 /
        // 右侧 Dashboard 完全隐藏（复刻 "Hide Right Panel" 按钮点击后的状态）。
        // 避免 Vitest UI 把 iframe 按比例缩放导致内容模糊。
        // mainSizes   = [15, 85]   ← 左测试列表 vs 右内容区
        // detailSizes = [100, 0]   ← 中 Browser UI 独占，右 Dashboard 折叠为 0%
        context: {
          storageState: {
            cookies: [],
            origins: [{
              origin: `http://localhost:${VITEST_BROWSER_API_PORT}`,
              localStorage: [
                { name: 'vitest-ui_splitpanes-mainSizes', value: '[15,85]' },
                { name: 'vitest-ui_splitpanes-detailSizes', value: '[100,0]' },
              ],
            }],
          },
        },
      }],
      viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
      headless: process.env.CI === 'true',
      // 保留 Vitest runner UI（左侧测试列表），方便交互选测试
      screenshotDirectory: `${runDirAbs}/screenshots`,
      commands: {
        recordProbeRun, stageAttachments, requestAiDecision, saveTestData, appendAiJudge,
        readSessionUserTags, fetchAutoTitle,
        getCloudFingerprint, listCloudFixtures, resolveCloudMockDirs,
        snapshotMemory, restoreMemory,
      },
    },
  },
})
