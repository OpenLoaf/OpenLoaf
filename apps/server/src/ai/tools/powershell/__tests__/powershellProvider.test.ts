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
 * PowerShell provider (encoding + arg 构造) 单元测试
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/powershell/__tests__/powershellProvider.test.ts
 */
import assert from 'node:assert/strict'

import {
  buildPowerShellArgs,
  encodePowerShellCommand,
} from '@/ai/tools/powershell/powershellProvider'

let passed = 0
let failed = 0
const errors: string[] = []

function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (err: any) {
    failed++
    const m = err?.message ?? String(err)
    errors.push(`${name}: ${m}`)
    console.log(`  \u2717 ${name}: ${m}`)
  }
}

console.log('\nA — encodePowerShellCommand')

test('返回非空字符串', () => {
  const encoded = encodePowerShellCommand('Get-Date')
  assert.equal(typeof encoded, 'string')
  assert.ok(encoded.length > 0)
})

test('只包含合法 base64 字符', () => {
  const encoded = encodePowerShellCommand('Get-Date')
  assert.match(encoded, /^[A-Za-z0-9+/=]+$/)
})

test('解码回 UTF-16LE 后等于原命令', () => {
  const original = 'Get-Date'
  const encoded = encodePowerShellCommand(original)
  const decoded = Buffer.from(encoded, 'base64').toString('utf16le')
  assert.equal(decoded, original)
})

test('处理包含中文的命令', () => {
  const original = 'Write-Host "你好"'
  const encoded = encodePowerShellCommand(original)
  const decoded = Buffer.from(encoded, 'base64').toString('utf16le')
  assert.equal(decoded, original)
})

console.log('\nB — buildPowerShellArgs 非 encoded 模式')

test('默认返回 -NoProfile -NonInteractive -Command <cmd>', () => {
  const args = buildPowerShellArgs('Get-Date')
  assert.deepEqual(args, [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Get-Date',
  ])
})

test('encoded: false 等同默认', () => {
  const args = buildPowerShellArgs('Get-Date', { encoded: false })
  assert.ok(args.includes('-Command'))
  assert.ok(args.includes('-NoProfile'))
  assert.ok(args.includes('-NonInteractive'))
  assert.ok(!args.includes('-EncodedCommand'))
})

console.log('\nC — buildPowerShellArgs encoded 模式')

test('encoded: true 使用 -EncodedCommand', () => {
  const args = buildPowerShellArgs('Get-Date', { encoded: true })
  assert.ok(args.includes('-EncodedCommand'))
  assert.ok(!args.includes('-Command'))
})

test('encoded: true 包含 base64 字符串', () => {
  const args = buildPowerShellArgs('Get-Date', { encoded: true })
  const idx = args.indexOf('-EncodedCommand')
  assert.ok(idx >= 0)
  const payload = args[idx + 1]
  assert.ok(payload !== undefined)
  assert.match(payload!, /^[A-Za-z0-9+/=]+$/)
  // base64 → utf16le 应等于原命令
  const decoded = Buffer.from(payload!, 'base64').toString('utf16le')
  assert.equal(decoded, 'Get-Date')
})

test('encoded 模式仍保留 -NoProfile / -NonInteractive', () => {
  const args = buildPowerShellArgs('Get-Date', { encoded: true })
  assert.ok(args.includes('-NoProfile'))
  assert.ok(args.includes('-NonInteractive'))
})

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (errors.length > 0) {
  console.log('\nFailed:')
  for (const e of errors) console.log(`  - ${e}`)
  process.exit(1)
}
