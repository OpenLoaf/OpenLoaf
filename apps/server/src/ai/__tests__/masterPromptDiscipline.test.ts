/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * Regression tests for master prompt output discipline.
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/masterPromptDiscipline.test.ts
 */
import assert from 'node:assert/strict'

import { getMasterPrompt } from '@/ai/agent-templates/templates/master'

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
    const message = err?.message ?? String(err)
    errors.push(`${name}: ${message}`)
    console.log(`  \u2717 ${name}: ${message}`)
  }
}

await test('ZH: master prompt defaults to silent first tool batch', () => {
  const prompt = getMasterPrompt('zh-CN')
  assert.match(prompt, /默认直接静默发出第一批工具/)
  assert.match(prompt, /现在激活它们：/)
  assert.match(prompt, /第 1 步：/)
  assert.doesNotMatch(prompt, /发第一批工具前，如果用户意图需要澄清或计划需要对齐/)
})

await test('EN: master prompt defaults to silent first tool batch', () => {
  const prompt = getMasterPrompt('en-US')
  assert.match(prompt, /default to sending the first tool batch silently/i)
  assert.match(prompt, /Now I'll activate them:/)
  assert.match(prompt, /Step 1:/)
  assert.doesNotMatch(prompt, /before the first tool batch — \*\*one sentence\*\* of/i)
})

console.log(`\nPassed: ${passed}, Failed: ${failed}`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const error of errors) console.log(`- ${error}`)
  process.exit(1)
}
