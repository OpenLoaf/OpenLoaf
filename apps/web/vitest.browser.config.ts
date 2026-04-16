/**
 * Vitest Browser Mode config for chat probe testing.
 */
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

const recordProbeRun: BrowserCommand<[any]> = async (_ctx, input) => {
  const { testCase, prompt, model, description, tags, result } = input
  const historyPath = findHistory(result.sessionId)
  let runRecorded = false

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
    const git = gitInfo()
    appendFileSync(RUNS_JSONL, JSON.stringify({
      testCase, runAt: result.startedAt, sessionId: result.sessionId, historyPath,
      status: result.status, elapsedMs: result.elapsedMs, toolCalls: result.toolCalls,
      finishReason: result.finishReason, errorText: result.error ?? null,
      model: model ?? null, platform: 'web', prompt, trigger: 'vitest-browser',
      gitCommit: git.commit, gitBranch: git.branch,
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

  return { historyPath, sessionMarked, runRecorded }
}

// ── stageAttachments command ──
// 复制附件到 chat-history/<sessionId>/asset/，返回注入 prompt 的 <system-tag> 标签
const CHAT_HISTORY_ROOT = process.env.OPENLOAF_CHAT_HISTORY_ROOT
  ?? join(homedir(), 'OpenLoafData', 'chat-history')
const FIXTURES_DIR = join(SKILL_ROOT, 'fixtures')

const stageAttachments: BrowserCommand<[{ sessionId: string; files: string[] }]> = async (
  _ctx, { sessionId, files },
) => {
  if (!files.length) return { tags: [], copied: [] }
  const assetDir = join(CHAT_HISTORY_ROOT, sessionId, 'asset')
  mkdirSync(assetDir, { recursive: true })

  const usedNames = new Set<string>()
  const tags: string[] = []
  const copied: Array<{ source: string; dest: string; basename: string }> = []

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
    copied.push({ source: abs, dest, basename: name })
    tags.push(`<system-tag type="attachment" path="\${CURRENT_CHAT_DIR}/${name}" />`)
  }
  return { tags, copied }
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
const saveTestData: BrowserCommand<[{
  testCase: string
  prompt: string
  result: Record<string, unknown>
  model?: string
  description?: string
  tags?: string[]
}]> = async (_ctx, input) => {
  const targetDir = resolve(root, `browser-test-runs/${runTimestamp}`)
  const dataDir = join(targetDir, 'data')
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  const fileName = (input.testCase || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')
  const filePath = join(dataDir, `${fileName}.json`)
  writeFileSync(filePath, JSON.stringify({
    testCase: input.testCase,
    prompt: input.prompt,
    model: input.model ?? null,
    description: input.description ?? null,
    tags: input.tags ?? [],
    result: input.result,
    savedAt: new Date().toISOString(),
  }, null, 2), 'utf-8')
  return { filePath }
}

// ── 带时间戳的运行目录（JSON 报告 + 截图 + 自包含 HTML） ──
const runTimestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)
const runDir = `./browser-test-runs/${runTimestamp}`
const runDirAbs = resolve(root, runDir)
process.env.BROWSER_TEST_RUN_DIR = runDirAbs

// ── Config ──

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NEXT_PUBLIC_SERVER_URL': JSON.stringify(serverUrl),
    'process.env.NODE_ENV': JSON.stringify('test'),
    'process.env.PROBE_SERVER_URL': JSON.stringify(serverUrl),
    '__BROWSER_TEST_RUN_DIR__': JSON.stringify(runDir),
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
      instances: [{ browser: 'chromium' }],
      headless: process.env.CI === 'true',
      screenshotDirectory: `${runDir}/screenshots`,
      commands: { recordProbeRun, stageAttachments, requestAiDecision, saveTestData },
    },
  },
})
