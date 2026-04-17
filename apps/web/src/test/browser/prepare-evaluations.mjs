#!/usr/bin/env node
/**
 * Prepare evaluator jobs for the latest test run.
 *
 * Creates <runDir>/evaluations/_manifest.json describing which critics should
 * run for each test case. The Claude Code main agent reads this manifest after
 * a run completes, spawns one subagent per (testCase, critic) pair, and writes
 * results back to <runDir>/evaluations/<testCase>/<critic>.json.
 *
 * When generate-report.mjs runs, it picks up those JSON files and
 * surfaces them in the self-contained HTML report — partially filled manifests
 * still produce useful reports.
 *
 * Selection rule (mirrors SKILL.md evaluation-aggregation.md):
 *   - suite === 'chat'          → 4 critics (answer-quality, tool-selection, efficiency, visual)
 *   - suite !== 'chat' (page)   → 1 critic (visual)
 */
import {
  readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync,
} from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(root, '../../..')
const monoRoot = resolve(webRoot, '../..')
const runsRoot = join(webRoot, 'browser-test-runs')
const runsJsonl = join(monoRoot, '.agents/skills/ai-browser-test/runs.jsonl')
const evaluatorsDir = join(monoRoot, '.agents/skills/ai-browser-test/evaluators')

if (!existsSync(runsRoot)) process.exit(0)
const runDirs = readdirSync(runsRoot)
  .filter(d => /^\d{8}_\d{6}/.test(d) && statSync(join(runsRoot, d)).isDirectory())
  .sort().reverse()
if (runDirs.length === 0) process.exit(0)

const latestRunTs = runDirs[0]
const latestRun = join(runsRoot, latestRunTs)
const evalRoot = join(latestRun, 'evaluations')

const CHAT_CRITICS = ['answer-quality-critic', 'tool-selection-critic', 'efficiency-critic', 'visual-critic']
const PAGE_CRITICS = ['visual-critic']

function ensureCriticExists(name) {
  return existsSync(join(evaluatorsDir, `${name}.md`))
}

if (!existsSync(runsJsonl)) {
  console.log('[prepare-eval] no runs.jsonl yet')
  process.exit(0)
}

const rows = readFileSync(runsJsonl, 'utf-8')
  .split('\n').filter(l => l.trim())
  .map(l => { try { return JSON.parse(l) } catch { return null } })
  .filter(r => r && typeof r.screenshotsDir === 'string' && r.screenshotsDir.includes(latestRunTs))

if (rows.length === 0) {
  console.log(`[prepare-eval] no runs.jsonl rows for ${latestRunTs}`)
  process.exit(0)
}

mkdirSync(evalRoot, { recursive: true })

const jobs = []
for (const row of rows) {
  const testCase = row.testCase
  const critics = (row.suite === 'chat' ? CHAT_CRITICS : PAGE_CRITICS).filter(ensureCriticExists)
  const testDir = join(evalRoot, testCase)
  mkdirSync(testDir, { recursive: true })

  // Dump the input bundle the main agent hands to each subagent.
  const input = {
    testCase,
    suite: row.suite,
    historyPath: row.historyPath ?? null,
    screenshotsDir: row.screenshotsDir ?? null,
    runnerJson: row,
  }
  writeFileSync(join(testDir, 'input.json'), JSON.stringify(input, null, 2), 'utf-8')

  for (const critic of critics) {
    const jobPath = join(testDir, `${critic}.json`)
    const filled = existsSync(jobPath)
    jobs.push({
      testCase,
      suite: row.suite,
      critic,
      criticMdPath: join(evaluatorsDir, `${critic}.md`),
      inputPath: join(testDir, 'input.json'),
      outputPath: jobPath,
      filled,
    })
  }
}

const manifest = {
  runTimestamp: latestRunTs,
  runDir: latestRun,
  evaluatorsDir,
  generatedAt: new Date().toISOString(),
  totalJobs: jobs.length,
  filledJobs: jobs.filter(j => j.filled).length,
  jobs,
}
writeFileSync(join(evalRoot, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')

console.log(
  `[prepare-eval] ${jobs.length} job(s) prepared for ${rows.length} test case(s) `
  + `(${manifest.filledJobs} pre-filled) at ${evalRoot}/_manifest.json`,
)
