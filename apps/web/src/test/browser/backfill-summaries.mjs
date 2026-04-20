#!/usr/bin/env node
/**
 * 一次性 backfill：扫所有 browser-test-runs/<seq>/，缺 _run-summary.json 或
 * _case-summaries/ 的就调 generate-report.mjs 的 computeRunInfo 路径补上。
 *
 * 用法：
 *   node apps/web/src/test/browser/backfill-summaries.mjs
 *   node apps/web/src/test/browser/backfill-summaries.mjs --force   # 已有也重算
 *
 * 跑一次后主页和后续 generate-report 就能秒开，不用每次扫几十 MB 的 data/*.json。
 */
import { readdirSync, existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractCaseSummary, SUMMARY_SCHEMA_VERSION } from './lib/case-summary.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const runsRoot = resolve(root, '../../../browser-test-runs')
const FORCE = process.argv.includes('--force')

if (!existsSync(runsRoot)) {
  console.log('[backfill] runs root not found:', runsRoot)
  process.exit(0)
}

const RUN_DIR_RE = /^(?:\d{4,}|\d{8}_\d{6}|\d+_\d{8}_\d{6})$/
const dirs = readdirSync(runsRoot)
  .filter(d => RUN_DIR_RE.test(d) && statSync(join(runsRoot, d)).isDirectory())
  .filter(d => existsSync(join(runsRoot, d, 'results.json')))

console.log(`[backfill] ${dirs.length} runs found, force=${FORCE}`)

let computed = 0
let skipped = 0
let failed = 0

function safeJson(s, fallback = null) { try { return JSON.parse(s) } catch { return fallback } }

for (const ts of dirs) {
  const runDir = join(runsRoot, ts)
  const runSummaryPath = join(runDir, '_run-summary.json')
  if (!FORCE && existsSync(runSummaryPath)) {
    const cached = safeJson(readFileSync(runSummaryPath, 'utf-8'))
    if (cached?.schemaVersion === SUMMARY_SCHEMA_VERSION) {
      skipped++
      continue
    }
  }

  // 读 data/*.json → 抽 summary → 写 _case-summaries + _run-summary
  const dataDir = join(runDir, 'data')
  if (!existsSync(dataDir)) {
    skipped++
    continue
  }

  try {
    const summaries = []
    for (const f of readdirSync(dataDir).filter(f => f.endsWith('.json'))) {
      const d = safeJson(readFileSync(join(dataDir, f), 'utf-8'))
      const s = extractCaseSummary(d)
      if (s) summaries.push(s)
    }

    const summaryDir = join(runDir, '_case-summaries')
    if (!existsSync(summaryDir)) mkdirSync(summaryDir, { recursive: true })
    for (const s of summaries) {
      const fn = String(s.testCase).replace(/[^a-zA-Z0-9_-]/g, '_') + '.json'
      writeFileSync(join(summaryDir, fn), JSON.stringify(s, null, 2), 'utf-8')
    }

    // _run-summary 由首次调用 generate-report 的 computeRunInfo 真正写。
    // 这里只确保 _case-summaries 全部就位，让下次 computeRunInfo 走快路径。
    computed++
    console.log(`[backfill] ${ts}: ${summaries.length} cases`)
  } catch (err) {
    failed++
    console.warn(`[backfill] ${ts} failed:`, err instanceof Error ? err.message : err)
  }
}

console.log(`\n[backfill] done — computed=${computed} skipped=${skipped} failed=${failed}`)
