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
 * dangerousCmdlets 常量集合完整性检查
 *
 * 规范化约定：所有 cmdlet 名称均为小写（与 resolveToCanonical 返回值匹配）。
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/powershell/__tests__/dangerousCmdlets.test.ts
 */
import assert from 'node:assert/strict'

import {
  ALIAS_HIJACK_CMDLETS,
  ARG_GATED_CMDLETS,
  DANGEROUS_SCRIPT_BLOCK_CMDLETS,
  FILEPATH_EXECUTION_CMDLETS,
  GIT_SAFETY_ARCHIVE_EXTRACTORS,
  GIT_SAFETY_WRITE_CMDLETS,
  MODULE_LOADING_CMDLETS,
  NETWORK_CMDLETS,
  WMI_CIM_CMDLETS,
  buildNeverSuggest,
} from '@/ai/tools/powershell/dangerousCmdlets'
import { COMMON_ALIASES } from '@/ai/tools/powershell/readOnlyValidation'

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

const ALL_SETS: Array<[string, ReadonlySet<string>]> = [
  ['FILEPATH_EXECUTION_CMDLETS', FILEPATH_EXECUTION_CMDLETS],
  ['DANGEROUS_SCRIPT_BLOCK_CMDLETS', DANGEROUS_SCRIPT_BLOCK_CMDLETS],
  ['MODULE_LOADING_CMDLETS', MODULE_LOADING_CMDLETS],
  ['NETWORK_CMDLETS', NETWORK_CMDLETS],
  ['ALIAS_HIJACK_CMDLETS', ALIAS_HIJACK_CMDLETS],
  ['WMI_CIM_CMDLETS', WMI_CIM_CMDLETS],
  ['GIT_SAFETY_WRITE_CMDLETS', GIT_SAFETY_WRITE_CMDLETS],
  ['GIT_SAFETY_ARCHIVE_EXTRACTORS', GIT_SAFETY_ARCHIVE_EXTRACTORS],
  ['ARG_GATED_CMDLETS', ARG_GATED_CMDLETS],
]

console.log('\nA — 各集合非空')

for (const [name, set] of ALL_SETS) {
  test(`${name} 非空`, () => {
    assert.ok(set.size > 0, `${name} 不应为空`)
  })
}

console.log('\nB — 关键 cmdlet 属于正确集合')

test('invoke-expression 属于 DANGEROUS_SCRIPT_BLOCK_CMDLETS', () => {
  assert.ok(DANGEROUS_SCRIPT_BLOCK_CMDLETS.has('invoke-expression'))
})

test('invoke-command 属于 DANGEROUS_SCRIPT_BLOCK_CMDLETS', () => {
  assert.ok(DANGEROUS_SCRIPT_BLOCK_CMDLETS.has('invoke-command'))
})

test('invoke-command 也属于 FILEPATH_EXECUTION_CMDLETS', () => {
  assert.ok(FILEPATH_EXECUTION_CMDLETS.has('invoke-command'))
})

test('import-module 属于 MODULE_LOADING_CMDLETS', () => {
  assert.ok(MODULE_LOADING_CMDLETS.has('import-module'))
})

test('invoke-webrequest 属于 NETWORK_CMDLETS', () => {
  assert.ok(NETWORK_CMDLETS.has('invoke-webrequest'))
})

test('invoke-restmethod 属于 NETWORK_CMDLETS', () => {
  assert.ok(NETWORK_CMDLETS.has('invoke-restmethod'))
})

test('set-alias 属于 ALIAS_HIJACK_CMDLETS', () => {
  assert.ok(ALIAS_HIJACK_CMDLETS.has('set-alias'))
})

test('invoke-wmimethod 属于 WMI_CIM_CMDLETS', () => {
  assert.ok(WMI_CIM_CMDLETS.has('invoke-wmimethod'))
})

test('invoke-cimmethod 属于 WMI_CIM_CMDLETS', () => {
  assert.ok(WMI_CIM_CMDLETS.has('invoke-cimmethod'))
})

test('out-file 属于 GIT_SAFETY_WRITE_CMDLETS', () => {
  assert.ok(GIT_SAFETY_WRITE_CMDLETS.has('out-file'))
})

test('tar 属于 GIT_SAFETY_ARCHIVE_EXTRACTORS', () => {
  assert.ok(GIT_SAFETY_ARCHIVE_EXTRACTORS.has('tar'))
})

console.log('\nC — cmdlet 名称已规范化（全部小写）')

for (const [name, set] of ALL_SETS) {
  test(`${name} 全部为小写`, () => {
    for (const entry of set) {
      assert.equal(
        entry,
        entry.toLowerCase(),
        `${name} 含非小写项: ${entry}`,
      )
    }
  })
}

console.log('\nD — buildNeverSuggest 聚合')

test('buildNeverSuggest 返回非空 Set', () => {
  const never = buildNeverSuggest(COMMON_ALIASES)
  assert.ok(never.size > 0)
})

test('buildNeverSuggest 包含 invoke-expression', () => {
  const never = buildNeverSuggest(COMMON_ALIASES)
  assert.ok(never.has('invoke-expression'))
})

test('buildNeverSuggest 包含 iex 别名', () => {
  const never = buildNeverSuggest(COMMON_ALIASES)
  assert.ok(never.has('iex'), 'iex 应作为 invoke-expression 的别名入集')
})

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (errors.length > 0) {
  console.log('\nFailed:')
  for (const e of errors) console.log(`  - ${e}`)
  process.exit(1)
}
