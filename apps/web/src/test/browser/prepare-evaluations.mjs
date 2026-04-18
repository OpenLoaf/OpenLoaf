#!/usr/bin/env node
/**
 * Prepare reviewer job manifest for the latest test run.
 *
 * 生成 <runDir>/evaluations/_manifest.json，描述哪些用例需要评审：
 *   - 只对 vitest pass 的用例生成 job（失败用例直接查 stack，不走 reviewer）
 *   - 每个用例一条 job，不再按 critic 拆分
 *   - job 里指向 agents/reviewer.md 作为 prompt，input.json 作为上下文
 *
 * Claude Code 主 agent 跑完测试后：
 *   1. 读 _manifest.json
 *   2. 对每个 job 启 1 个 reviewer 子 agent
 *   3. 子 agent 按 agents/reviewer.md 评审，输出 JSON
 *   4. 调 write-review.mjs 落盘（会同时写 EVALUATION.json + review.json）
 */
import {
  readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync,
} from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTestCaseSpec } from './test-case-spec.mjs'
import { getYamlPath } from './test-case-paths.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(root, '../../..')
const monoRoot = resolve(webRoot, '../..')
const runsRoot = join(webRoot, 'browser-test-runs')
const runsJsonl = join(monoRoot, '.agents/skills/ai-browser-test/runs.jsonl')
const testCasesDir = join(monoRoot, '.agents/skills/ai-browser-test/test-cases')
const reviewerPromptPath = join(monoRoot, '.agents/skills/ai-browser-test/agents/reviewer.md')

if (!existsSync(runsRoot)) process.exit(0)
const runDirs = readdirSync(runsRoot)
  .filter(d => /^(?:\d{4,}|\d{8}_\d{6}|\d+_\d{8}_\d{6})$/.test(d) && statSync(join(runsRoot, d)).isDirectory())
  .sort().reverse()
if (runDirs.length === 0) process.exit(0)

const latestRunTs = runDirs[0]
const latestRun = join(runsRoot, latestRunTs)
const evalRoot = join(latestRun, 'evaluations')

if (!existsSync(runsJsonl)) {
  console.log('[prepare-eval] no runs.jsonl yet')
  process.exit(0)
}

// 1. 读 runs.jsonl 本次 run 的行
const rows = readFileSync(runsJsonl, 'utf-8')
  .split('\n').filter(l => l.trim())
  .map(l => { try { return JSON.parse(l) } catch { return null } })
  .filter(r => r && typeof r.screenshotsDir === 'string' && r.screenshotsDir.includes(latestRunTs))

if (rows.length === 0) {
  console.log(`[prepare-eval] no runs.jsonl rows for ${latestRunTs}`)
  process.exit(0)
}

// 2. 读 vitest results.json 判定哪些 testCase pass
//    vitest fail 的用例不进 reviewer，主 agent 直接查 stack + 工具错误诊断修复
const passedTestCases = readPassedTestCases(latestRun)

mkdirSync(evalRoot, { recursive: true })

const jobs = []
const skipped = []
const stepBudgetViolations = []
for (const row of rows) {
  const testCase = row.testCase

  // 过滤：vitest fail → 跳过 reviewer
  if (passedTestCases && !passedTestCases.has(testCase)) {
    skipped.push(testCase)
    continue
  }

  // 过滤：maxSteps 超标 → 和 vitest fail 同等对待（跳过 reviewer，直接进诊断）
  // 硬编码检测，不让 reviewer 用 AI 兜底；超预算就是失败。
  const specRaw = readTestCaseSpec(getYamlPath(testCasesDir, testCase))
  const maxSteps = Number.isInteger(specRaw?.maxSteps) && specRaw.maxSteps > 0 ? specRaw.maxSteps : null
  if (maxSteps != null) {
    const actualSteps = countSteps(row)
    if (actualSteps > maxSteps) {
      const violation = { testCase, maxSteps, actualSteps, exceededBy: actualSteps - maxSteps }
      stepBudgetViolations.push(violation)
      skipped.push(testCase)
      console.error(
        `[prepare-eval] ❌ STEP_BUDGET_EXCEEDED: ${testCase} 实际 ${actualSteps} 步 > 预算 ${maxSteps} 步 `
        + `（超 ${violation.exceededBy} 步，跳过评审，直接进诊断）`,
      )
      continue
    }
  }

  const testDir = join(evalRoot, testCase)
  mkdirSync(testDir, { recursive: true })

  // Dump reviewer 子 agent 的输入上下文：spec.purpose 是权威判据，
  // runnerJson 是运行事实，historyPath / screenshotsDir 供子 agent 按需深入。
  const spec = readTestCaseSpec(getYamlPath(testCasesDir, testCase))
  const input = {
    testCase,
    suite: row.suite,
    historyPath: row.historyPath ?? null,
    screenshotsDir: row.screenshotsDir ?? null,
    spec,
    runnerJson: row,
  }
  writeFileSync(join(testDir, 'input.json'), JSON.stringify(input, null, 2), 'utf-8')

  const reviewPath = join(testDir, 'review.json')
  jobs.push({
    testCase,
    suite: row.suite,
    reviewerPromptPath,
    inputPath: join(testDir, 'input.json'),
    outputPath: reviewPath,
    filled: existsSync(reviewPath),
  })
}

const manifest = {
  runTimestamp: latestRunTs,
  runDir: latestRun,
  reviewerPromptPath,
  generatedAt: new Date().toISOString(),
  totalJobs: jobs.length,
  filledJobs: jobs.filter(j => j.filled).length,
  skippedFailedTestCases: skipped,
  stepBudgetViolations,
  jobs,
}
writeFileSync(join(evalRoot, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')

// 独立的 violations 文件，供 generate-report.mjs 高亮 + 用户直接查
if (stepBudgetViolations.length > 0) {
  writeFileSync(
    join(evalRoot, 'step-budget-violations.json'),
    JSON.stringify({ runTimestamp: latestRunTs, violations: stepBudgetViolations }, null, 2),
    'utf-8',
  )
}

const skipMsg = skipped.length > 0
  ? `；跳过 ${skipped.length} 个 fail/超预算用例（${skipped.join(', ')}）`
  : ''
const budgetMsg = stepBudgetViolations.length > 0
  ? `\n[prepare-eval] ⚠️  ${stepBudgetViolations.length} 个用例超出 maxSteps 预算：`
    + stepBudgetViolations.map(v => `\n  - ${v.testCase}: ${v.actualSteps}/${v.maxSteps} (+${v.exceededBy})`).join('')
  : ''
console.log(
  `[prepare-eval] ${jobs.length} reviewer job(s) for ${latestRunTs} `
  + `(${manifest.filledJobs} pre-filled)${skipMsg}${budgetMsg}`,
)

// ─────────────────────────────────────────────────────────────────────

/**
 * 从 vitest results.json 解析 pass 的 testCase 名集合。
 * testCase 名约定：测试文件名去 .browser.tsx 后缀后，取最前缀段（数字或 kebab）
 * 或者直接用 vitest test name — 这里尝试按 file 推，匹配 runs.jsonl 的 testCase 字段。
 * 读不到 results.json → 返回 null（不过滤，全量生成 job）。
 */
function readPassedTestCases(runDir) {
  const resultsPath = join(runDir, 'results.json')
  if (!existsSync(resultsPath)) return null

  let results
  try {
    results = JSON.parse(readFileSync(resultsPath, 'utf-8'))
  } catch {
    return null
  }

  // vitest json reporter 结构：{ testResults: [{ name, status, assertionResults: [...] }] }
  if (!Array.isArray(results.testResults)) return null

  const passed = new Set()
  for (const file of results.testResults) {
    const fileName = (file.name || '').split('/').pop() || ''
    // 去掉 .browser.tsx 后缀作为 testCase 前缀候选
    const candidate = fileName.replace(/\.browser\.tsx$/, '')
    // 只有文件整体 pass（所有 assertion 都 passed）才算 testCase pass
    const allPassed = Array.isArray(file.assertionResults)
      ? file.assertionResults.every(a => a.status === 'passed')
      : file.status === 'passed'
    if (allPassed) passed.add(candidate)
  }
  return passed
}

/**
 * 计算一次 run 的步数（LLM 轮次）。
 * 首选：max(toolCallDetails[].turnIndex) + 1
 * 降级：toolCalls.length（没有 turnIndex 时）
 * 两者都没 → 1 步（有回复但没工具调用）
 */
function countSteps(row) {
  const details = Array.isArray(row?.toolCallDetails) ? row.toolCallDetails : null
  if (details && details.length > 0) {
    const turnIndices = details.map(d => Number(d?.turnIndex)).filter(n => Number.isFinite(n))
    if (turnIndices.length > 0) return Math.max(...turnIndices) + 1
    return details.length
  }
  const toolCalls = Array.isArray(row?.toolCalls) ? row.toolCalls : null
  if (toolCalls && toolCalls.length > 0) return toolCalls.length
  return 1
}
