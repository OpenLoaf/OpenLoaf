/**
 * Vitest Browser Mode server commands.
 *
 * 这些函数在 Node.js 端运行，可从浏览器测试通过
 * `commands.recordProbeRun(...)` 调用。
 *
 * BrowserCommand 签名：第一个参数是 context（Vitest 注入），后续参数是用户传入的。
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { BrowserCommand } from 'vitest/node'
import { readTestCaseSpec } from './test-case-spec.mjs'
import { getYamlPath, resolveSuite } from './test-case-paths.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILL_ROOT = resolve(__dirname, '../../../../.agents/skills/ai-browser-test')
const RUNS_JSONL = join(SKILL_ROOT, 'runs.jsonl')
const TEST_CASES_DIR = join(SKILL_ROOT, 'test-cases')

// ── Git info ──

function getGitInfo(): { commit: string | null; branch: string | null } {
  try {
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim() || null
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim() || null
    return { commit, branch }
  } catch {
    return { commit: null, branch: null }
  }
}

// ── Chat history discovery ──

const HISTORY_ROOTS = [
  join(homedir(), 'OpenLoafData', 'chat-history'),
  join(homedir(), '.openloaf', 'chat-history'),
]

function findChatHistoryPath(sessionId: string): string | null {
  for (const root of HISTORY_ROOTS) {
    const candidate = join(root, sessionId)
    if (existsSync(join(candidate, 'messages.jsonl'))) return candidate
  }
  const dataRoot = join(homedir(), 'OpenLoafData')
  if (existsSync(dataRoot)) {
    try {
      const entries = readdirSync(dataRoot, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'chat-history') continue
        const candidate = join(dataRoot, entry.name, '.openloaf', 'chat-history', sessionId)
        if (existsSync(join(candidate, 'messages.jsonl'))) return candidate
      }
    } catch { /* ignore */ }
  }
  return null
}

// ── Types ──

export type ToolCallDetailRecord = {
  name: string
  turnIndex: number
  hasError: boolean
  errorSummary?: string
}

export type RecordProbeRunInput = {
  testCase?: string
  prompt: string
  model?: string | null
  description?: string
  tags?: string[]
  result: {
    sessionId: string
    status: string
    toolCalls: string[]
    toolCallDetails?: ToolCallDetailRecord[]
    toolErrorCount?: number
    elapsedMs: number
    finishReason: string | null
    error?: string
    textPreview: string
    startedAt: string
    /** 本次 probe 消耗的 SaaS 积分（ChatProbeHarness 从 message.metadata.openloaf 累加） */
    creditsConsumed?: number
  }
}

export type RecordProbeRunOutput = {
  historyPath: string | null
  sessionMarked: boolean
  runRecorded: boolean
}

// ── BrowserCommand ──

export const recordProbeRun: BrowserCommand<[RecordProbeRunInput]> = async (
  _context,
  input,
): Promise<RecordProbeRunOutput> => {
  const { testCase, prompt, model, description, tags, result } = input
  const historyPath = findChatHistoryPath(result.sessionId)

  let runRecorded = false
  if (testCase) {
    // 确保 test-case YAML 存在（按 suite 子目录落盘；suite 无法解析时兜底到根目录）
    const yamlPath = getYamlPath(TEST_CASES_DIR, testCase)
    const yamlDir = dirname(yamlPath)
    if (!existsSync(yamlDir)) mkdirSync(yamlDir, { recursive: true })
    if (!existsSync(yamlPath)) {
      const yaml = [
        `name: ${testCase}`,
        `description: "${description ?? ''}"`,
        `prompt: ${JSON.stringify(prompt)}`,
        `model: ${model ?? 'null'}`,
        `platform: web`,
        `tags: [${(tags ?? []).join(', ')}]`,
        `createdAt: ${new Date().toISOString()}`,
        '',
      ].join('\n')
      writeFileSync(yamlPath, yaml, 'utf-8')
    }

    // 追加 runs.jsonl
    const git = getGitInfo()
    const runDir = process.env.BROWSER_TEST_RUN_DIR || null
    const screenshotsDir = runDir ? join(runDir, 'screenshots') : null
    const spec = readTestCaseSpec(yamlPath) as { description: string | null; purpose: string | null }
    const record = {
      testCase,
      suite: resolveSuite(testCase),
      runAt: result.startedAt,
      sessionId: result.sessionId,
      historyPath,
      screenshotsDir,
      status: result.status,
      elapsedMs: result.elapsedMs,
      toolCalls: result.toolCalls,
      toolCallDetails: result.toolCallDetails ?? [],
      finishReason: result.finishReason,
      errorText: result.error ?? null,
      model: model ?? null,
      platform: 'web',
      prompt,
      textPreview: result.textPreview,
      // 从 ProbeResult 透传积分消耗，generate-report.mjs 读 run.creditsConsumed
      // 展示到用例卡片和主页总计。未采集到时留空（不写 0 避免污染总计）。
      ...(typeof result.creditsConsumed === 'number' && result.creditsConsumed > 0
        ? { creditsConsumed: result.creditsConsumed }
        : {}),
      trigger: 'vitest-browser',
      gitCommit: git.commit,
      gitBranch: git.branch,
      // Human/AI-readable spec read from the test-case yaml — lets evaluator subagents
      // and the HTML report see what each test is supposed to verify.
      purpose: spec.purpose,
      specDescription: spec.description,
    }
    appendFileSync(RUNS_JSONL, JSON.stringify(record) + '\n', 'utf-8')
    runRecorded = true
  }

  // 标记 session.json
  let sessionMarked = false
  if (historyPath) {
    const sessionJsonPath = join(historyPath, 'session.json')
    try {
      const raw = readFileSync(sessionJsonPath, 'utf-8')
      const existing = JSON.parse(raw)
      const merged = {
        ...existing,
        autoTest: true,
        probeMeta: {
          runner: 'ai-browser-test',
          prompt,
          model: model ?? null,
          platform: 'web',
          startedAt: result.startedAt,
          testCase,
        },
      }
      writeFileSync(sessionJsonPath, JSON.stringify(merged, null, 2), 'utf-8')
      sessionMarked = true
    } catch { /* session.json not found or invalid */ }
  }

  return { historyPath, sessionMarked, runRecorded }
}
