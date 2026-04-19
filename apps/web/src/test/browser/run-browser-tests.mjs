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
let batch = null
let modelOverride = null
let modelSourceOverride = null
let promptLangOverride = null

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
  } else if (arg === '--batch') {
    batch = args[++i]
    if (!batch) {
      console.error('--batch requires a name (分组标签，用于主页按批次归档本次及后续用同名 batch 的 run)')
      process.exit(1)
    }
  } else if (arg.startsWith('--batch=')) {
    batch = arg.slice('--batch='.length)
  } else if (arg === '--model') {
    modelOverride = args[++i]
    if (!modelOverride) {
      console.error('--model requires an id (e.g. qwen:OL-TX-006)。列出可用模型请看 SKILL.md「列出可用 chat 模型」章节。')
      process.exit(1)
    }
  } else if (arg.startsWith('--model=')) {
    modelOverride = arg.slice('--model='.length)
  } else if (arg === '--model-source') {
    modelSourceOverride = args[++i]
    if (!modelSourceOverride) {
      console.error('--model-source requires cloud | local | saas')
      process.exit(1)
    }
  } else if (arg.startsWith('--model-source=')) {
    modelSourceOverride = arg.slice('--model-source='.length)
  } else if (arg === '--prompt-lang') {
    promptLangOverride = args[++i]
    if (promptLangOverride !== 'zh' && promptLangOverride !== 'en') {
      console.error('--prompt-lang requires zh | en (默认 en)')
      process.exit(1)
    }
  } else if (arg.startsWith('--prompt-lang=')) {
    promptLangOverride = arg.slice('--prompt-lang='.length)
    if (promptLangOverride !== 'zh' && promptLangOverride !== 'en') {
      console.error('--prompt-lang requires zh | en (默认 en)')
      process.exit(1)
    }
  } else if (arg.startsWith('--')) {
    extraVitestArgs.push(arg)
  } else {
    patterns.push(arg)
  }
}

// 模型覆盖 —— 通过环境变量传给 vitest.browser.config.ts 的 `define`，
// 进而在浏览器端 ChatProbeHarness 读取并覆盖测试文件里硬编码的 chatModelId / chatModelSource。
// 注意：只改运行时发送给后端的 model，不改 yaml / recordProbeRun 里声明的 model 字段
// （那是测试作者的"设计意图"）。runs.jsonl 不做自动修改，但 harness 状态栏会显示实际生效值。
if (modelOverride) {
  process.env.BROWSER_TEST_MODEL_OVERRIDE = modelOverride
  // 未显式指定 source 时，假设 cloud —— 绝大多数测试都跑 cloud 模型
  process.env.BROWSER_TEST_MODEL_SOURCE_OVERRIDE = modelSourceOverride || 'cloud'
  console.log(`[model-override] 强制 chatModelId="${modelOverride}" source="${process.env.BROWSER_TEST_MODEL_SOURCE_OVERRIDE}"`)
  console.log(`[model-override] ⚠️  测试里的 toolCalls / vision / fallback 断言可能基于原模型能力，换模型后要注意断言是否仍合理。`)
} else if (modelSourceOverride) {
  console.error('--model-source 必须与 --model 一起使用')
  process.exit(1)
}

// 提示词语言覆盖 —— vitest.browser.config.ts 未读到 env 时默认 'en'。
// runner CLI 显式传 `--prompt-lang zh` 可切换；不传则保持默认 'en'。
if (promptLangOverride) {
  process.env.BROWSER_TEST_PROMPT_LANG_OVERRIDE = promptLangOverride
  console.log(`[prompt-lang] 强制 promptLanguage="${promptLangOverride}"（覆盖默认的 'en'）`)
}

// batch 通过环境变量传给 vitest.browser.config.ts（写进 run-meta.json.batch）。
// 强制要求设置：没有 batch 标签的 run 在主页索引里没法分组归档，等于裸跑。
// CLI `--batch <name>` 或环境变量 `BROWSER_TEST_BATCH` 二选一，否则直接报错退出。
if (batch) {
  process.env.BROWSER_TEST_BATCH = batch
  console.log(`[batch] 本次 run 归入批次: "${batch}"`)
} else if (process.env.BROWSER_TEST_BATCH) {
  console.log(`[batch] 从环境变量继承批次: "${process.env.BROWSER_TEST_BATCH}"`)
} else {
  console.error(`
ERROR: 必须指定 batch（分组标签）。所有 run 都需要归入一个批次，否则主页无法分组。

请使用以下任一方式：
  pnpm test:browser:run --batch <name> <pattern...>
  BROWSER_TEST_BATCH=<name> pnpm test:browser:run <pattern...>

约定：batch 名建议用语义化标签（如 "regression-2026-04" / "qwen-flash" / "feature-x"），
便于后续在主页按批次回看。
`)
  process.exit(1)
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
    pnpm test:browser:run <pattern> [pattern...]                  run matching tests by name
    pnpm test:browser:run --suite <name> [pattern...]             run tests in a suite (optionally filtered)
    pnpm test:browser:run --all                                   run all tests
    pnpm test:browser:run --model <id> [--model-source cloud]     override chatModelId for this run
    pnpm test:browser:run --prompt-lang zh|en                     override prompt language (default: en)
    pnpm test:browser:run --batch <name> <pattern...>             tag this run into a batch group

  Examples:
    pnpm test:browser:run 009                                     test 009 (any suite)
    pnpm test:browser:run 007 009 basic                           tests 007, 009, and basic-*
    pnpm test:browser:run --suite skill-market                    all skill-market tests
    pnpm test:browser:run --suite chat 100                        chat test 100
    pnpm test:browser:run --all                                   everything
    pnpm test:browser:run --model qwen:OL-TX-007 --suite basic    force Qwen Plus for basic suite
    pnpm test:browser:run --model deepseek:OL-TX-003 basic-001    force DeepSeek for one test

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

// ── browser-test-runs 保留策略：默认全量保留 ──
// 历史上曾默认 `keep=10`，跑多了会悄悄删掉历史 run，失去回溯能力。
// 现在默认 0（= 不裁剪），只在显式设置 BROWSER_TEST_RUN_KEEP 时才裁剪。
// 目录名兼容两种格式：老的 `20260417_150958` 和新的 `0042_20260417_150958`。
const runsRoot = join(webRoot, 'browser-test-runs')
const keep = Number.parseInt(process.env.BROWSER_TEST_RUN_KEEP ?? '0', 10) || 0
if (keep > 0 && existsSync(runsRoot)) {
  const dirs = readdirSync(runsRoot)
    .filter(d => /^(?:\d{4,}|\d{8}_\d{6}|\d+_\d{8}_\d{6})$/.test(d) && statSync(join(runsRoot, d)).isDirectory())
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
