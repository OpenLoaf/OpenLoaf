#!/usr/bin/env node
/**
 * 最终裁决脚本 —— 聚合 vitest 与 aiJudge(reviewer) 结果，决定整个 run 是否 fail。
 *
 * 为什么独立成脚本：
 *   - vitest 通过 runs.jsonl / results.json 立即可得
 *   - aiJudge 的 EVALUATION.json / review.json 是人工主 agent 并行启 reviewer 子 agent
 *     跑完 write-review.mjs 之后才有 —— 跟 run-browser-tests.mjs 的生命周期不重合
 *   - 所以 runner 不在 vitest 结束时就 exit，而是留一个独立的 gate，由主 agent / CI
 *     在 reviewer 全跑完之后调用，才能拿到完整裁决
 *
 * 判定规则（任一命中 = 整个 run fail）:
 *   1. 任一 `<runDir>/evaluations/<testCase>/review.json.aggregate.verdict === 'FAIL'`
 *   2. `<runDir>/_runner-status.json.vitestFailed === true`
 *      （由 run-browser-tests.mjs 捕获 vitest 退出码后写入）
 *
 * Usage:
 *   node check-run-verdict.mjs                       # 检查最新 run
 *   node check-run-verdict.mjs --run-dir <path>      # 指定具体 run 目录
 *
 * Exit code:
 *   0 = 所有用例 pass（含 PARTIAL，PARTIAL 不阻断但会打印 warning）
 *   1 = 有 FAIL 或 vitest 失败
 *   2 = 找不到 runDir / evaluations 尚未就绪
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(root, '../../..')
const runsRoot = join(webRoot, 'browser-test-runs')

const { values } = parseArgs({
  options: {
    'run-dir': { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(`check-run-verdict — browser test run 最终裁决

Usage:
  node check-run-verdict.mjs                    # 检查最新 run
  node check-run-verdict.mjs --run-dir <path>   # 指定 run 目录

Exit:
  0 = pass   1 = fail   2 = 环境问题
`)
  process.exit(0)
}

function resolveRunDir() {
  if (values['run-dir']) {
    const abs = resolve(values['run-dir'])
    if (!existsSync(abs)) {
      console.error(`[check-verdict] --run-dir 不存在: ${abs}`)
      process.exit(2)
    }
    return abs
  }
  if (!existsSync(runsRoot)) {
    console.error(`[check-verdict] browser-test-runs 不存在: ${runsRoot}`)
    process.exit(2)
  }
  const dirs = readdirSync(runsRoot)
    .filter(d => /^(?:\d{4,}|\d{8}_\d{6}|\d+_\d{8}_\d{6})$/.test(d)
      && statSync(join(runsRoot, d)).isDirectory())
    .sort().reverse()
  if (dirs.length === 0) {
    console.error(`[check-verdict] 没有任何 run 目录: ${runsRoot}`)
    process.exit(2)
  }
  return join(runsRoot, dirs[0])
}

const runDir = resolveRunDir()
const evalRoot = join(runDir, 'evaluations')
const statusPath = join(runDir, '_runner-status.json')

let vitestFailed = false
if (existsSync(statusPath)) {
  try {
    const status = JSON.parse(readFileSync(statusPath, 'utf-8'))
    vitestFailed = status.vitestFailed === true
  } catch (err) {
    console.error(`[check-verdict] _runner-status.json 解析失败: ${err.message}`)
  }
}

const failTestCases = []
const partialTestCases = []
const passTestCases = []
const missingEvalTestCases = []

if (existsSync(evalRoot)) {
  const manifestPath = join(evalRoot, '_manifest.json')
  let expectedCases = []
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      expectedCases = (manifest.jobs ?? []).map(j => j.testCase)
    } catch { /* ignore */ }
  }

  for (const tc of expectedCases) {
    const reviewPath = join(evalRoot, tc, 'review.json')
    if (!existsSync(reviewPath)) {
      missingEvalTestCases.push(tc)
      continue
    }
    try {
      const review = JSON.parse(readFileSync(reviewPath, 'utf-8'))
      const verdict = review?.aggregate?.verdict
      if (verdict === 'FAIL') failTestCases.push(tc)
      else if (verdict === 'PARTIAL') partialTestCases.push(tc)
      else if (verdict === 'PASS') passTestCases.push(tc)
      else missingEvalTestCases.push(tc)
    } catch {
      missingEvalTestCases.push(tc)
    }
  }
}

// ── 裁决 ──
console.log(`[check-verdict] run: ${runDir}`)
console.log(`  vitest: ${vitestFailed ? 'FAIL' : 'pass'}`)
console.log(`  aiJudge: ${passTestCases.length} pass, ${partialTestCases.length} partial, `
  + `${failTestCases.length} fail, ${missingEvalTestCases.length} missing`)

if (failTestCases.length > 0) {
  console.log(`  🔴 aiJudge FAIL 用例: ${failTestCases.join(', ')}`)
}
if (partialTestCases.length > 0) {
  console.log(`  🟡 aiJudge PARTIAL 用例: ${partialTestCases.join(', ')}`)
}
if (missingEvalTestCases.length > 0) {
  console.log(`  ⚪ 未评审用例（reviewer 未跑完或失败）: ${missingEvalTestCases.join(', ')}`)
  console.log('     若此脚本在 reviewer 子 agent 跑完前被调用，请等 reviewer 全部完成再 retry')
}

const shouldFail = vitestFailed || failTestCases.length > 0
if (shouldFail) {
  console.log('[check-verdict] ❌ 整个 run 判定 FAIL')
  process.exit(1)
}

console.log('[check-verdict] ✅ 整个 run 判定 PASS')
process.exit(0)
