/**
 * AI Agent 行为测试运行器
 * 包装 Promptfoo，抑制噪音日志，只输出测试结果摘要。
 *
 * 用法: node scripts/run-behavior-test.mjs [--filter-pattern "ts-001"] [--repeat 3]
 */
import { execSync } from 'node:child_process'
import { readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2).join(' ')
const outFile = join(import.meta.dirname, '..', '.behavior-test-output.json')

const cmd = [
  'node --no-warnings --env-file=.env',
  '--enable-source-maps --import tsx/esm',
  '--import ./scripts/registerMdTextLoader.mjs',
  '../../node_modules/promptfoo/dist/src/entrypoint.js eval',
  '-c src/ai/__tests__/agent-behavior/promptfooconfig.yaml',
  '--no-cache --max-concurrency 1 --no-progress-bar',
  `-o ${outFile}`,
  args,
].join(' ')

console.log('🔬 运行 AI Agent 行为测试...\n')

let exitCode = 0
try {
  execSync(cmd, {
    cwd: join(import.meta.dirname, '..'),
    stdio: ['inherit', 'ignore', 'ignore'],
    timeout: 10 * 60 * 1000,
  })
} catch (err) {
  exitCode = err.status ?? 1
}

// 解析并输出结果
try {
  const data = JSON.parse(readFileSync(outFile, 'utf-8'))
  const results = data?.results?.results ?? []

  let passed = 0
  let failed = 0

  for (const r of results) {
    const desc = r.testCase?.description ?? '?'
    const ok = r.success
    const asserts = r.gradingResult?.componentResults ?? []
    const output = (r.response?.output ?? '').slice(0, 80)

    if (ok) {
      passed++
      console.log(`  ✅ ${desc}`)
    } else {
      failed++
      console.log(`  ❌ ${desc}`)
      for (const a of asserts) {
        if (!a.pass) {
          const type = a.assertion?.type ?? '?'
          const reason = (a.reason ?? '').slice(0, 120)
          console.log(`     └─ [${type}] ${reason}`)
        }
      }
    }
    if (output) {
      console.log(`     💬 ${output}...`)
    }
  }

  const total = passed + failed
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0
  console.log(`\n📊 结果: ${passed}/${total} 通过 (${pct}%)`)
  if (failed > 0) console.log(`   ${failed} 个用例失败`)

  // 清理临时文件
  try { unlinkSync(outFile) } catch {}

  process.exit(failed > 0 ? 1 : 0)
} catch {
  console.log('\n⚠️  无法解析测试结果，请检查配置。')
  process.exit(1)
}
