#!/usr/bin/env node
/**
 * build-diagnose-prompt CLI —— 从命令行生成"失败用例诊断子 agent 的提示词"。
 *
 * 和 HTML 报告右上角「📋 复制完整 Prompt」按钮复制出来的内容一模一样，给主引擎
 * 在 CI / 失败闭环里可以直接:
 *
 *   TEXT=$(pnpm -s test:browser:diagnose-prompt <testCase>)
 *   Agent({ subagent_type:"general-purpose", prompt: TEXT + "\n\n<agents/diagnoser.md 内容>" })
 *
 * Usage:
 *   pnpm test:browser:diagnose-prompt <testCase>               # 最新 run
 *   pnpm test:browser:diagnose-prompt <testCase> --run 0042    # 指定 run seq
 *   pnpm test:browser:diagnose-prompt <testCase> --run-dir <abs>
 *   node src/test/browser/build-diagnose-prompt.mjs <testCase>
 *
 * stdout = 提示词纯文本；stderr = 警告/提示（如"prevRun 不可用"），正常情况下静默。
 *
 * 退出码：
 *   0  提示词生成成功（即便部分字段缺失）
 *   1  参数错误或 run 目录找不到
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDiagnosePromptText, collectDiagnoseContext } from './lib/build-diagnose-prompt.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(scriptDir, '../../..')
const monoRoot = resolve(webRoot, '../..')
const runsRoot = resolve(webRoot, 'browser-test-runs')

function parseArgs(argv) {
  const args = { testCase: null, runArg: null, runDir: null, help: false, quiet: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') { args.help = true; continue }
    if (a === '-q' || a === '--quiet') { args.quiet = true; continue }
    if (a === '--run') { args.runArg = argv[++i]; continue }
    if (a.startsWith('--run=')) { args.runArg = a.slice('--run='.length); continue }
    if (a === '--run-dir') { args.runDir = argv[++i]; continue }
    if (a.startsWith('--run-dir=')) { args.runDir = a.slice('--run-dir='.length); continue }
    if (!args.testCase && !a.startsWith('-')) { args.testCase = a; continue }
    process.stderr.write(`[warn] unknown arg: ${a}\n`)
  }
  return args
}

function printHelp() {
  process.stderr.write(`build-diagnose-prompt <testCase> [--run <seq>] [--run-dir <path>] [--quiet]

Outputs the full diagnosis prompt for the given testCase to stdout. Mirrors the
"copy prompt" button on the HTML report, so the main engine can pipe it into a
diagnoser sub-agent.

Positional:
  <testCase>          Full slug (e.g. basic-011-toolsearch-preface).

Options:
  --run <seq>         Run dir seq (e.g. 0042). Defaults to latest run with results.json.
  --run-dir <path>    Absolute run dir path (overrides --run).
  --quiet             Suppress stderr warnings about missing data.
  -h, --help          Show this help.
`)
}

const args = parseArgs(process.argv.slice(2))

if (args.help) {
  printHelp()
  process.exit(0)
}

if (!args.testCase) {
  process.stderr.write('[error] 缺少 testCase 参数。用 --help 查看用法。\n')
  process.exit(1)
}

try {
  const { ctx, runDir, missing } = collectDiagnoseContext({
    testCase: args.testCase,
    runArg: args.runDir || args.runArg,
    runsRoot,
    monoRoot,
  })
  if (!args.quiet && missing.length) {
    process.stderr.write(`[info] run=${runDir}\n`)
    process.stderr.write(`[info] 部分数据缺失，相应段落已省略：\n`)
    for (const m of missing) process.stderr.write(`  - ${m}\n`)
  }
  const text = buildDiagnosePromptText(ctx)
  process.stdout.write(text)
  if (!text.endsWith('\n')) process.stdout.write('\n')
  process.exit(0)
} catch (err) {
  process.stderr.write(`[error] ${err?.message || err}\n`)
  process.exit(1)
}
