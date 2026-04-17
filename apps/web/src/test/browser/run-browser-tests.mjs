#!/usr/bin/env node
/**
 * Browser test runner wrapper.
 *
 * Usage:
 *   node run-browser-tests.mjs 009                        # run test 009 (chat suite)
 *   node run-browser-tests.mjs 009 010 basic              # run tests 009, 010, and basic-*
 *   node run-browser-tests.mjs --suite skill-market       # run all skill-market tests
 *   node run-browser-tests.mjs --suite chat               # run all chat tests (top-level __tests__/)
 *   node run-browser-tests.mjs --suite skill-market 001   # skill-market/001-*
 *   node run-browser-tests.mjs --all                      # run everything
 *
 * Without arguments, prints usage and available suites.
 */
import { execSync } from 'node:child_process'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync, statSync, existsSync, rmSync } from 'node:fs'

const root = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(root, '../../..')

const args = process.argv.slice(2)
const extraVitestArgs = []
const patterns = []
let suite = null

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--all') {
    patterns.length = 0
    patterns.push('__ALL__')
  } else if (arg === '--suite') {
    suite = args[++i]
    if (!suite) {
      console.error('--suite requires a name (e.g. chat, skill-market)')
      process.exit(1)
    }
  } else if (arg.startsWith('--')) {
    extraVitestArgs.push(arg)
  } else {
    patterns.push(arg)
  }
}

const testsRoot = resolve(root, '__tests__')

function listSuites() {
  const names = ['chat']
  try {
    for (const entry of readdirSync(testsRoot)) {
      const abs = resolve(testsRoot, entry)
      try {
        if (statSync(abs).isDirectory()) names.push(entry)
      } catch {}
    }
  } catch {}
  return names
}

function listTestsForSuite(suiteName) {
  const dir = suiteName === 'chat' ? testsRoot : resolve(testsRoot, suiteName)
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.browser.tsx'))
      .sort()
  } catch {
    return []
  }
}

if (patterns.length === 0 && !suite) {
  console.log(`
  AI Browser Test Runner
  ──────────────────────
  Usage:
    pnpm test:browser:run <pattern> [pattern...]         run matching tests by name
    pnpm test:browser:run --suite <name> [pattern...]    run tests in a suite (optionally filtered)
    pnpm test:browser:run --all                          run all tests

  Examples:
    pnpm test:browser:run 009                            test 009 (any suite)
    pnpm test:browser:run 007 009 basic                  tests 007, 009, and basic-*
    pnpm test:browser:run --suite skill-market           all skill-market tests
    pnpm test:browser:run --suite chat 100               chat test 100
    pnpm test:browser:run --all                          everything

  Suites:`)
  for (const s of listSuites()) {
    const tests = listTestsForSuite(s).map((f) => f.replace('.browser.tsx', ''))
    console.log(`    ${s.padEnd(16)} ${tests.length} test(s)`)
  }
  console.log(`\n  Available tests:`)
  for (const s of listSuites()) {
    const tests = listTestsForSuite(s)
    if (!tests.length) continue
    console.log(`\n  [${s}]`)
    for (const f of tests) {
      console.log(`    ${f.replace('.browser.tsx', '')}`)
    }
  }
  console.log()
  process.exit(0)
}

const vitestArgs = ['run', '--config', 'vitest.browser.config.ts']

function collectSuiteFiles(suiteName) {
  if (suiteName === 'chat') {
    try {
      return readdirSync(testsRoot)
        .filter((f) => f.endsWith('.browser.tsx'))
        .map((f) => `src/test/browser/__tests__/${f}`)
    } catch { return [] }
  }
  const dir = resolve(testsRoot, suiteName)
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.browser.tsx'))
      .map((f) => `src/test/browser/__tests__/${suiteName}/${f}`)
  } catch { return [] }
}

if (!patterns.includes('__ALL__')) {
  let candidates = []
  if (suite) {
    candidates = collectSuiteFiles(suite)
    if (!candidates.length) {
      console.error(`Suite "${suite}" has no tests`)
      process.exit(1)
    }
  }
  if (patterns.length > 0) {
    if (candidates.length > 0) {
      candidates = candidates.filter((p) =>
        patterns.some((pat) => p.includes(pat)),
      )
      if (!candidates.length) {
        console.error(`No tests in suite "${suite}" match patterns: ${patterns.join(', ')}`)
        process.exit(1)
      }
    } else {
      function collectAllBrowserFiles() {
        const out = []
        function walk(dir, rel) {
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === 'browser-test-runs') continue
            const absEntry = resolve(dir, entry.name)
            const relEntry = rel ? `${rel}/${entry.name}` : entry.name
            if (entry.isDirectory()) { walk(absEntry, relEntry); continue }
            if (!entry.name.endsWith('.browser.tsx')) continue
            out.push(`src/test/browser/__tests__/${relEntry}`)
          }
        }
        try { walk(testsRoot, '') } catch {}
        return out
      }
      const all = collectAllBrowserFiles()
      candidates = all.filter((p) => patterns.some((pat) => p.includes(pat)))
      if (!candidates.length) {
        console.error(`No .browser.tsx file matches patterns: ${patterns.join(', ')}`)
        process.exit(1)
      }
    }
  }
  for (const f of candidates) vitestArgs.push(f)
} else if (suite) {
  console.warn('Warning: --all overrides --suite')
}

vitestArgs.push(...extraVitestArgs)

// ── browser-test-runs 保留策略：最近 N 次，其余自动清理 ──
const runsRoot = join(webRoot, 'browser-test-runs')
const keep = Number.parseInt(process.env.BROWSER_TEST_RUN_KEEP ?? '10', 10) || 10
if (existsSync(runsRoot)) {
  const dirs = readdirSync(runsRoot)
    .filter(d => /^\d{8}_\d{6}/.test(d) && statSync(join(runsRoot, d)).isDirectory())
    .sort().reverse()
  if (dirs.length > keep) {
    const toDelete = dirs.slice(keep)
    for (const d of toDelete) {
      rmSync(join(runsRoot, d), { recursive: true, force: true })
    }
    console.log(`[runs-prune] kept ${keep}, removed ${toDelete.length} old run(s)`)
  }
}

// Quote args with regex metacharacters to avoid shell interpretation
const cmd = `pnpm exec vitest ${vitestArgs.map(a => /[|*?(){}[\]\\]/.test(a) ? `'${a}'` : a).join(' ')}`
console.log(`Running: ${cmd}\n`)

try {
  execSync(cmd, { cwd: webRoot, stdio: 'inherit' })
} catch {
  // vitest exits non-zero on test failure — continue to report generation
}

// 评审 jobs 清单（主 agent 读取后并行启 critic 子 agent 填槽）
try {
  execSync('node src/test/browser/prepare-evaluations.mjs', { cwd: webRoot, stdio: 'inherit' })
} catch (e) {
  console.error('Warning: prepare-evaluations failed:', e?.message || e)
}

// 自包含 HTML 报告（每次 run 独立 + 主页索引，双击打开）
try {
  execSync('node src/test/browser/generate-report.mjs', { cwd: webRoot, stdio: 'inherit' })
} catch (e) {
  console.error('Warning: generate-report failed:', e?.message || e)
}
