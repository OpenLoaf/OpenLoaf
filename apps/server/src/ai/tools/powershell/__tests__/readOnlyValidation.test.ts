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
 * PowerShell read-only validation 单元测试
 *
 * 覆盖：
 *   A. resolveToCanonical — 别名解析（大小写不敏感）
 *   B. isReadOnlyCommand  — 安全只读检测
 *   C. hasSyncSecurityConcerns — 正则级危险模式识别
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/powershell/__tests__/readOnlyValidation.test.ts
 */
import assert from 'node:assert/strict'

import {
  hasSyncSecurityConcerns,
  isReadOnlyCommand,
  resolveToCanonical,
} from '@/ai/tools/powershell/readOnlyValidation'

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

console.log('\nA — resolveToCanonical 别名解析')

test('ls → get-childitem', () => {
  assert.equal(resolveToCanonical('ls'), 'get-childitem')
})

test('cat → get-content', () => {
  assert.equal(resolveToCanonical('cat'), 'get-content')
})

test('rm → remove-item', () => {
  assert.equal(resolveToCanonical('rm'), 'remove-item')
})

test('Get-ChildItem → get-childitem（大小写不敏感）', () => {
  assert.equal(resolveToCanonical('Get-ChildItem'), 'get-childitem')
})

test('GET-CONTENT → get-content（大写不敏感）', () => {
  assert.equal(resolveToCanonical('GET-CONTENT'), 'get-content')
})

test('未知命令直接小写返回', () => {
  assert.equal(resolveToCanonical('MyUnknownCmd'), 'myunknowncmd')
})

test('iex → invoke-expression', () => {
  assert.equal(resolveToCanonical('iex'), 'invoke-expression')
})

console.log('\nB — isReadOnlyCommand 只读检测')

test('Get-Content file.txt → true', () => {
  assert.equal(isReadOnlyCommand('Get-Content file.txt'), true)
})

test('Get-ChildItem → true', () => {
  assert.equal(isReadOnlyCommand('Get-ChildItem'), true)
})

test('ls 别名 → true', () => {
  assert.equal(isReadOnlyCommand('ls'), true)
})

test('Remove-Item file.txt → false', () => {
  assert.equal(isReadOnlyCommand('Remove-Item file.txt'), false)
})

test('rm 别名 → false', () => {
  assert.equal(isReadOnlyCommand('rm file.txt'), false)
})

test('空字符串 → false', () => {
  assert.equal(isReadOnlyCommand(''), false)
})

test('仅空白 → false', () => {
  assert.equal(isReadOnlyCommand('   '), false)
})

test('即使命令在白名单，若含 $(...) 仍判定为非只读', () => {
  assert.equal(isReadOnlyCommand('Get-Content $(rm -rf /)'), false)
})

console.log('\nC — hasSyncSecurityConcerns 危险模式识别')

test('$(rm -rf) → true（子表达式）', () => {
  assert.equal(hasSyncSecurityConcerns('$(rm -rf)'), true)
})

test('Get-ChildItem → false（纯只读）', () => {
  assert.equal(hasSyncSecurityConcerns('Get-ChildItem'), false)
})

test('@splat → true（参数飞溅）', () => {
  assert.equal(hasSyncSecurityConcerns('Get-Process @args'), true)
})

test('.Method() → true（成员调用）', () => {
  assert.equal(hasSyncSecurityConcerns('$x.Invoke()'), true)
})

test('$var = 1 → true（赋值）', () => {
  assert.equal(hasSyncSecurityConcerns('$var = 1'), true)
})

test('--% 停止解析 → true', () => {
  assert.equal(hasSyncSecurityConcerns('cmd.exe --% /c whoami'), true)
})

test('UNC path \\\\server\\share → true', () => {
  assert.equal(hasSyncSecurityConcerns('Get-Content \\\\server\\share\\file'), true)
})

test('[Type]::Method() → true（静态方法调用）', () => {
  assert.equal(
    hasSyncSecurityConcerns('[System.IO.File]::ReadAllText("x")'),
    true,
  )
})

test('空字符串 → false', () => {
  assert.equal(hasSyncSecurityConcerns(''), false)
})

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (errors.length > 0) {
  console.log('\nFailed:')
  for (const e of errors) console.log(`  - ${e}`)
  process.exit(1)
}
