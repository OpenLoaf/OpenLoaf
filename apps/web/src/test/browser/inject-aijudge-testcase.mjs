#!/usr/bin/env node
/**
 * 批量给所有 .browser.tsx 里的 `aiJudge({ ... })` 调用注入 `testCase: '<id>'`。
 *
 * 为什么需要：没传 testCase 时 aiJudge 的判决不会落到 data/<testCase>.json，
 * HTML 报告的「⚖️ AI 裁判」卡拿不到数据。手工给 28 个文件加一行容易漏，也难维护。
 *
 * 推断 testCase 的规则（两步）：
 *   1) 同一个文件里通常已经有 `saveTestData({ testCase: 'xxx', ... })` 或 recordProbeRun 同款，
 *      直接拿那里的字面量 id（最可靠，和 runner 落盘的文件名 100% 对齐）；
 *   2) 如果找不到（极少数），按路径推导：__tests__/<suite>/<name>.browser.tsx → <suite>-<name>；
 *      顶层 __tests__/<name>.browser.tsx → <name>。
 *
 * 已经包含 `testCase:` 的 aiJudge 调用会被跳过（幂等可重跑）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { relative, dirname, join } from 'node:path'
import { globSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
// 从 src/test/browser/ 往上走到 apps/web，再取 __tests__ 下所有 .browser.tsx
const TESTS_DIR = join(ROOT, '__tests__')

const files = globSync('**/*.browser.tsx', { cwd: TESTS_DIR }).map(p => join(TESTS_DIR, p))

let changed = 0
let skipped = 0
let noJudge = 0

for (const file of files) {
  const src = readFileSync(file, 'utf-8')

  // 没调 aiJudge 的跳过
  if (!/\baiJudge\s*\(\s*\{/.test(src)) {
    noJudge++
    continue
  }

  // 1) 优先从 saveTestData / recordProbeRun 的 meta 里拿 testCase 字面量
  //    兼容两种写法：
  //      a) `const meta = { testCase: 'xxx', ... }` 然后 saveTestData(meta)
  //      b) 直接 saveTestData({ testCase: 'xxx', ... })
  let testCase = null
  const m1 = src.match(/testCase\s*:\s*['"]([^'"]+)['"]/)
  if (m1) testCase = m1[1]

  // 2) 按路径推导兜底
  if (!testCase) {
    const rel = relative(TESTS_DIR, file).replace(/\.browser\.tsx$/, '')
    testCase = rel.includes('/') ? rel.replace(/\//g, '-') : rel
  }

  // 查找所有 aiJudge({...}) 调用，给没有 testCase 字段的注入
  // 采用括号计数，避免正则错误匹配跨多个 aiJudge 的嵌套对象
  let out = src
  let cursor = 0
  let changedInFile = false
  while (true) {
    const idx = out.indexOf('aiJudge(', cursor)
    if (idx < 0) break
    // 定位紧随其后的 `{`
    let i = idx + 'aiJudge('.length
    while (i < out.length && /\s/.test(out[i])) i++
    if (out[i] !== '{') { cursor = idx + 1; continue }
    // 括号计数找到匹配的 `}`
    const openBrace = i
    let depth = 0
    let j = openBrace
    for (; j < out.length; j++) {
      const c = out[j]
      if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) break }
    }
    if (depth !== 0) { cursor = idx + 1; continue }
    const argSlice = out.slice(openBrace, j + 1)
    // 已经有 testCase 字段就跳过
    if (/\btestCase\s*:/.test(argSlice)) { cursor = j + 1; continue }
    // 在 `{` 后插入一行 `testCase: '...',`；保持缩进与上下文一致
    // 尝试复用下一行的缩进；否则简单给 2 空格
    const after = out.slice(openBrace + 1)
    const indentMatch = after.match(/^\s*\n(\s+)/)
    const indent = indentMatch ? indentMatch[1] : '    '
    const insert = `\n${indent}testCase: '${testCase}',`
    out = out.slice(0, openBrace + 1) + insert + out.slice(openBrace + 1)
    changedInFile = true
    cursor = j + 1 + insert.length
  }

  if (changedInFile) {
    writeFileSync(file, out, 'utf-8')
    changed++
    console.log(`✓ ${relative(process.cwd(), file)}  → testCase: '${testCase}'`)
  } else {
    skipped++
  }
}

console.log(`\nDone. changed=${changed}  skipped(already had testCase)=${skipped}  noJudge=${noJudge}  total=${files.length}`)
