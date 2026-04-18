#!/usr/bin/env node
/**
 * 把 reviewer agent 写的极简评审 JSON 转成 EVALUATION.json 并落盘。
 *
 * agent 只写 4 个顶层字段（无嵌套 aggregate / evaluators，极简）:
 * {
 *   "verdict": "PASS" | "PARTIAL" | "FAIL",
 *   "score": 0-100,
 *   "summary": "一句话综合结论（必须含 purpose#<段名>）",
 *   "issues": [
 *     {
 *       "severity": "error" | "warning",
 *       "dimension": "answer-quality" | "tool-selection" | "efficiency" | "visual",
 *       "detail": "一句话事实陈述",
 *       "evidence": ["purpose#期望行为", "screenshots/x.png"]
 *     }
 *   ]
 * }
 *
 * 本工具做的事:
 *   1. JSON.parse，校验字段
 *   2. 校验 summary 含 purpose# 引用
 *   3. 从 runs.jsonl 补 sessionId / model / elapsedMs / toolCalls / rounds
 *   4. 按 dimension 展开 evaluators[]（没 issue 的维度默认 PASS）
 *   5. 写两处:
 *      <historyPath>/EVALUATION.json           ← OpenLoaf AI Debug Viewer
 *      <runDir>/evaluations/<testCase>/review.json  ← HTML 报告
 *
 * 用法:
 *   node write-review.mjs --testCase <name> --stdin            (推荐)
 *   node write-review.mjs --testCase <name> --input <json-path>
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(root, '../../..')
const monoRoot = resolve(webRoot, '../..')
const runsJsonl = join(monoRoot, '.agents/skills/ai-browser-test/runs.jsonl')

const CHAT_DIMS = ['answer-quality', 'tool-selection', 'efficiency', 'visual']
const PAGE_DIMS = ['visual']
const VALID_DIMS = new Set([...CHAT_DIMS, ...PAGE_DIMS])
const VALID_VERDICT = new Set(['PASS', 'PARTIAL', 'FAIL'])
const VALID_SEVERITY = new Set(['error', 'warning'])

let parsed
try {
  parsed = parseArgs({
    options: {
      testCase: { type: 'string' },
      input: { type: 'string' },
      stdin: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })
} catch (err) {
  fail(`参数解析失败: ${err.message}`)
}

const { values } = parsed

if (values.help) { printHelp(); process.exit(0) }
if (!values.testCase || (!values.input && !values.stdin)) { printHelp(); process.exit(2) }

// 1. 读 JSON
let raw
if (values.stdin) {
  try { raw = readFileSync(0, 'utf-8') } catch (err) { fail(`stdin 读取失败: ${err.message}`) }
  if (!raw.trim()) fail('stdin 是空的')
} else {
  const p = resolve(values.input)
  if (!existsSync(p)) fail(`--input 文件不存在: ${p}`)
  raw = readFileSync(p, 'utf-8')
}

let review
try {
  review = JSON.parse(raw)
} catch (err) {
  console.error('[write-review] JSON 解析失败:')
  console.error(`  ${err.message}`)
  console.error('\n--- 你写的内容 ---')
  console.error(raw)
  process.exit(1)
}

// 2. 校验
const errors = validateReview(review)
if (errors.length > 0) {
  console.error('[write-review] 校验失败:')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

// 3. 从 runs.jsonl 取 runner 事实
if (!existsSync(runsJsonl)) fail(`runs.jsonl 不存在: ${runsJsonl}`)
const rows = readFileSync(runsJsonl, 'utf-8')
  .split('\n').filter(Boolean)
  .map(l => { try { return JSON.parse(l) } catch { return null } })
  .filter(r => r && r.testCase === values.testCase)
if (rows.length === 0) fail(`runs.jsonl 没找到 testCase=${values.testCase}`)

const latest = rows[rows.length - 1]
if (!latest.historyPath || !existsSync(latest.historyPath)) fail(`historyPath 无效: ${latest.historyPath}`)
if (!latest.screenshotsDir) fail('runs.jsonl 缺 screenshotsDir')
const runDir = dirname(latest.screenshotsDir)
if (!existsSync(runDir)) fail(`runDir 无效: ${runDir}`)

// 4. 构造 EVALUATION.json schema
const isPage = (latest.suite ?? 'chat') !== 'chat'
const evaluation = buildEvaluation(review, latest, isPage)

// 5. 写两处
const evalPath = join(latest.historyPath, 'EVALUATION.json')
writeFileSync(evalPath, JSON.stringify(evaluation, null, 2), 'utf-8')

const reviewDir = join(runDir, 'evaluations', values.testCase)
mkdirSync(reviewDir, { recursive: true })
const reviewPath = join(reviewDir, 'review.json')
writeFileSync(reviewPath, JSON.stringify(evaluation, null, 2), 'utf-8')

console.log(`[write-review] ${review.verdict} (${review.score}) — ${review.issues.length} issue(s)`)
console.log(`  session: ${evalPath}`)
console.log(`  run:     ${reviewPath}`)

// ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.error(`write-review — 评审 JSON 校验 + 展开 + 双写

Usage:
  node write-review.mjs --testCase <name> --stdin
  node write-review.mjs --testCase <name> --input <json-path>

agent 写的极简 JSON (只 4 顶层字段，无嵌套):

  {
    "verdict": "PASS",
    "score": 88,
    "summary": "对照 purpose#期望行为，工具正确调用且回答完整...",
    "issues": [
      {
        "severity": "warning",
        "dimension": "visual",
        "detail": "截图 turn2 有残留红卡片",
        "evidence": ["purpose#反模式", "screenshots/x-turn2.png"]
      }
    ]
  }

规则:
  verdict     PASS | PARTIAL | FAIL
  score       0-100 整数
  summary     必须含至少一条 "purpose#<段名>" 引用
  issues      可空数组；每条:
    severity  error | warning
    dimension answer-quality | tool-selection | efficiency | visual
    detail    一句话陈述事实
    evidence  数组（可空），可用:
              purpose#<段名> / messages.jsonl / debug/<a>/step<N>_response.json
              / screenshots/<name>.png / runnerJson / toolCallDetails[<N>]

工具自动做:
  - 从 runs.jsonl 补 sessionId / model / elapsedMs / toolCalls / 轮次
  - 按 dimension 展开 evaluators[]（没 issue 的维度默认 PASS）
  - 写 <historyPath>/EVALUATION.json + <runDir>/evaluations/<testCase>/review.json
`)
}

function fail(msg) {
  console.error(`[write-review] ${msg}`)
  process.exit(1)
}

function validateReview(r) {
  const errs = []
  if (!r || typeof r !== 'object' || Array.isArray(r)) {
    errs.push('顶层必须是 object')
    return errs
  }

  if (!VALID_VERDICT.has(r.verdict)) errs.push(`verdict 必须是 PASS | PARTIAL | FAIL（当前: ${JSON.stringify(r.verdict)}）`)
  if (typeof r.score !== 'number' || r.score < 0 || r.score > 100 || !Number.isInteger(r.score)) errs.push(`score 必须是 0-100 整数（当前: ${JSON.stringify(r.score)}）`)
  if (typeof r.summary !== 'string' || !r.summary.trim()) errs.push('summary 必须是非空字符串')
  if (typeof r.summary === 'string' && !/purpose#\S+/.test(r.summary)) errs.push('summary 必须含至少一条 `purpose#<段名>` 引用（证明 reviewer 看过 purpose）')

  if (!Array.isArray(r.issues)) {
    errs.push('issues 必须是数组（可空）')
  } else {
    for (const [i, it] of r.issues.entries()) {
      const p = `issues[${i}]`
      if (!it || typeof it !== 'object' || Array.isArray(it)) { errs.push(`${p} 必须是 object`); continue }
      if (!VALID_SEVERITY.has(it.severity)) errs.push(`${p}.severity 必须是 error | warning（当前: ${JSON.stringify(it.severity)}）`)
      if (!VALID_DIMS.has(it.dimension)) errs.push(`${p}.dimension 必须是 answer-quality | tool-selection | efficiency | visual（当前: ${JSON.stringify(it.dimension)}）`)
      if (typeof it.detail !== 'string' || !it.detail.trim()) errs.push(`${p}.detail 必须是非空字符串`)
      if (it.evidence !== undefined) {
        if (!Array.isArray(it.evidence)) errs.push(`${p}.evidence 必须是数组（可空或省略）`)
        else for (const [j, ev] of it.evidence.entries()) {
          if (typeof ev !== 'string') errs.push(`${p}.evidence[${j}] 必须是字符串`)
        }
      }
    }
  }

  // verdict / issues 一致性
  if (Array.isArray(r.issues)) {
    const hasError = r.issues.some(it => it.severity === 'error')
    const hasWarn = r.issues.some(it => it.severity === 'warning')
    if (hasError && r.verdict !== 'FAIL') errs.push(`verdict 和 issues 不一致：有 error issue 但 verdict=${r.verdict}（应该 FAIL）`)
    else if (!hasError && hasWarn && r.verdict === 'PASS') errs.push(`verdict 和 issues 不一致：有 warning issue 但 verdict=PASS（应该 PARTIAL 或 FAIL）`)
    else if (!hasError && !hasWarn && r.verdict === 'FAIL') errs.push(`verdict 和 issues 不一致：无 issue 但 verdict=FAIL（应该 PASS）`)
  }

  return errs
}

function buildEvaluation(review, runnerRow, isPage) {
  const dims = isPage ? PAGE_DIMS : CHAT_DIMS
  const issuesByDim = new Map()
  for (const it of review.issues) {
    if (!dims.includes(it.dimension)) continue  // 忽略不属于本类型的 dim（如 page 用例误报 efficiency）
    if (!issuesByDim.has(it.dimension)) issuesByDim.set(it.dimension, [])
    issuesByDim.get(it.dimension).push(it)
  }

  const evaluators = dims.map(name => {
    const relIssues = issuesByDim.get(name) ?? []
    const hasError = relIssues.some(i => i.severity === 'error')
    const hasWarn = relIssues.some(i => i.severity === 'warning')
    const verdict = hasError ? 'FAIL' : hasWarn ? 'PARTIAL' : 'PASS'
    const score = verdict === 'FAIL' ? 40 : verdict === 'PARTIAL' ? 70 : 90

    return {
      name,
      verdict,
      score,
      pros: verdict === 'PASS' ? ['对照 purpose 未见异常'] : [],
      cons: relIssues.map(i => i.detail),
      evidence: relIssues.flatMap(i => (i.evidence ?? []).map(f => ({
        file: f,
        note: i.detail.length > 80 ? `${i.detail.slice(0, 77)}...` : i.detail,
      }))),
    }
  })

  return {
    version: 1,
    sessionId: runnerRow.sessionId ?? '',
    assistantMessageId: runnerRow.assistantMessageId ?? '',
    runner: 'ai-browser-test',
    createdAt: new Date().toISOString(),
    aggregate: {
      verdict: review.verdict,
      score: review.score,
      tokensTotal: null,
      tokensInput: null,
      tokensOutput: null,
      rounds: runnerRow.totalTurns ?? 0,
      toolCalls: Array.isArray(runnerRow.toolCalls) ? runnerRow.toolCalls : [],
      elapsedMs: runnerRow.elapsedMs ?? 0,
      model: runnerRow.model ?? null,
      summary: review.summary,
    },
    evaluators,
  }
}
