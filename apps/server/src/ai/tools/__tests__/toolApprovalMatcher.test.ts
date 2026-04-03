/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * Tool Approval Matcher 单元测试
 *
 * 验证：
 *   A. parseRuleString — 规则字符串解析
 *   B. doesRuleMatch — 单条规则匹配
 *   C. evaluateToolRules — 多规则评估（deny > allow）
 *   D. suggestRule — 建议规则生成
 *   E. mergeToolApprovalRules — 规则合并
 *
 * 执行：
 *   cd apps/server && npx tsx src/ai/tools/__tests__/toolApprovalMatcher.test.ts
 */

import assert from 'node:assert/strict'
import {
  parseRuleString,
  ruleToString,
  doesRuleMatch,
  evaluateToolRules,
  suggestRule,
  mergeToolApprovalRules,
  extractMatchContent,
} from '../toolApprovalMatcher'

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0
let failed = 0
const errors: string[] = []

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (err: any) {
    failed++
    const m = err?.message ?? String(err)
    errors.push(`${name}: ${m}`)
    console.log(`  \u2717 ${name}: ${m}`)
  }
}

// ---------------------------------------------------------------------------
// A. parseRuleString
// ---------------------------------------------------------------------------

console.log('\nA — parseRuleString')

await test('tool-level rule (no parens)', () => {
  assert.deepStrictEqual(parseRuleString('Bash'), { toolName: 'Bash' })
})

await test('rule with content', () => {
  assert.deepStrictEqual(parseRuleString('Bash(git *)'), {
    toolName: 'Bash',
    ruleContent: 'git *',
  })
})

await test('rule with wildcard-only content treated as tool-level', () => {
  assert.deepStrictEqual(parseRuleString('Edit(*)'), { toolName: 'Edit' })
})

await test('rule with empty parens treated as tool-level', () => {
  assert.deepStrictEqual(parseRuleString('Edit()'), { toolName: 'Edit' })
})

await test('file path rule', () => {
  assert.deepStrictEqual(parseRuleString('Edit(/src/**)'), {
    toolName: 'Edit',
    ruleContent: '/src/**',
  })
})

await test('ruleToString roundtrip', () => {
  assert.equal(ruleToString({ toolName: 'Bash' }), 'Bash')
  assert.equal(ruleToString({ toolName: 'Bash', ruleContent: 'git *' }), 'Bash(git *)')
})

// ---------------------------------------------------------------------------
// B. doesRuleMatch
// ---------------------------------------------------------------------------

console.log('\nB — doesRuleMatch')

await test('tool-level rule matches any call', () => {
  assert.ok(doesRuleMatch('Bash', 'Bash', 'git push'))
  assert.ok(doesRuleMatch('Edit', 'Edit', '/any/path'))
})

await test('tool-level rule does not match different tool', () => {
  assert.ok(!doesRuleMatch('Bash', 'Edit', undefined))
})

await test('Bash wildcard: "git *" matches "git push"', () => {
  assert.ok(doesRuleMatch('Bash(git *)', 'Bash', 'git push'))
})

await test('Bash wildcard: "git *" matches bare "git"', () => {
  assert.ok(doesRuleMatch('Bash(git *)', 'Bash', 'git'))
})

await test('Bash wildcard: "git *" does not match "npm install"', () => {
  assert.ok(!doesRuleMatch('Bash(git *)', 'Bash', 'npm install'))
})

await test('Bash exact: "npm install" matches exactly', () => {
  assert.ok(doesRuleMatch('Bash(npm install)', 'Bash', 'npm install'))
})

await test('Bash exact: does not match different command', () => {
  assert.ok(!doesRuleMatch('Bash(npm install)', 'Bash', 'npm run build'))
})

await test('Bash wildcard: "npm *" matches "npm run build"', () => {
  assert.ok(doesRuleMatch('Bash(npm *)', 'Bash', 'npm run build'))
})

await test('Edit glob: "/src/**" matches nested path', () => {
  assert.ok(doesRuleMatch('Edit(/src/**)', 'Edit', '/src/foo/bar.ts'))
})

await test('Edit glob: "/src/**" does not match /other/path', () => {
  assert.ok(!doesRuleMatch('Edit(/src/**)', 'Edit', '/other/path.ts'))
})

await test('content rule with no matchContent → no match', () => {
  assert.ok(!doesRuleMatch('Bash(git *)', 'Bash', undefined))
})

// ---------------------------------------------------------------------------
// C. evaluateToolRules
// ---------------------------------------------------------------------------

console.log('\nC — evaluateToolRules')

await test('allow rule matches → "allow"', () => {
  const rules = { allow: ['Bash(git *)'] }
  assert.equal(evaluateToolRules(rules, 'Bash', { command: 'git push' }), 'allow')
})

await test('deny rule matches → "deny"', () => {
  const rules = { deny: ['Bash(rm -rf *)'] }
  assert.equal(evaluateToolRules(rules, 'Bash', { command: 'rm -rf /' }), 'deny')
})

await test('deny takes precedence over allow', () => {
  const rules = {
    allow: ['Bash(git *)'],
    deny: ['Bash(git push --force *)'],
  }
  assert.equal(
    evaluateToolRules(rules, 'Bash', { command: 'git push --force origin main' }),
    'deny',
  )
})

await test('no match → "unmatched"', () => {
  const rules = { allow: ['Bash(git *)'] }
  assert.equal(evaluateToolRules(rules, 'Bash', { command: 'npm install' }), 'unmatched')
})

await test('empty rules → "unmatched"', () => {
  assert.equal(evaluateToolRules({}, 'Bash', { command: 'git push' }), 'unmatched')
})

await test('tool-level allow for Edit', () => {
  const rules = { allow: ['Edit'] }
  assert.equal(evaluateToolRules(rules, 'Edit', { file_path: '/any/path.ts' }), 'allow')
})

// ---------------------------------------------------------------------------
// D. suggestRule
// ---------------------------------------------------------------------------

console.log('\nD — suggestRule')

await test('Bash: extracts two-word prefix', () => {
  assert.equal(suggestRule('Bash', { command: 'git push origin main' }), 'Bash(git push *)')
})

await test('Bash: single-word command', () => {
  assert.equal(suggestRule('Bash', { command: 'ls' }), 'Bash(ls *)')
})

await test('Edit: suggests parent dir glob', () => {
  assert.equal(suggestRule('Edit', { file_path: '/src/components/Foo.tsx' }), 'Edit(/src/components/**)')
})

await test('Write: suggests parent dir glob', () => {
  assert.equal(suggestRule('Write', { file_path: '/src/utils/helper.ts' }), 'Write(/src/utils/**)')
})

await test('unknown tool: returns tool name', () => {
  assert.equal(suggestRule('CustomTool', {}), 'CustomTool')
})

// ---------------------------------------------------------------------------
// E. mergeToolApprovalRules
// ---------------------------------------------------------------------------

console.log('\nE — mergeToolApprovalRules')

await test('merges allow and deny from multiple sources', () => {
  const result = mergeToolApprovalRules(
    { allow: ['Bash(git *)'], deny: ['Bash(rm *)'] },
    { allow: ['Edit'], deny: ['Bash(rm *)'] },
    undefined,
  )
  assert.deepStrictEqual(result.allow?.sort(), ['Bash(git *)', 'Edit'])
  assert.deepStrictEqual(result.deny, ['Bash(rm *)'])
})

await test('handles empty inputs', () => {
  const result = mergeToolApprovalRules(undefined, undefined)
  assert.equal(result.allow, undefined)
  assert.equal(result.deny, undefined)
})

// ---------------------------------------------------------------------------
// F. extractMatchContent
// ---------------------------------------------------------------------------

console.log('\nF — extractMatchContent')

await test('Bash extracts command', () => {
  assert.equal(extractMatchContent('Bash', { command: 'git push' }), 'git push')
})

await test('Edit extracts file_path', () => {
  assert.equal(extractMatchContent('Edit', { file_path: '/src/foo.ts' }), '/src/foo.ts')
})

await test('unknown tool returns undefined', () => {
  assert.equal(extractMatchContent('CustomTool', { foo: 'bar' }), undefined)
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`)
if (errors.length > 0) {
  console.log('\nFailed:')
  for (const e of errors) console.log(`  - ${e}`)
  process.exit(1)
}
