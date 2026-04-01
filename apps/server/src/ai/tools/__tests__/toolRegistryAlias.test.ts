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
 * 工具注册表 & 别名兼容性测试
 *
 * 验证：
 *   A. 新工具 ID（PascalCase）在 registry 中正确注册
 *   B. 旧工具 ID 通过 TOOL_ALIASES 正确映射到新 ID
 *   C. buildToolset 同时支持新旧 ID
 *   D. getToolJsonSchemas 对新旧 ID 均可用
 *   E. 工具定义 schema 验证（type: "object"）
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/toolRegistryAlias.test.ts
 */
import assert from 'node:assert/strict'
import { buildToolset, getToolJsonSchemas } from '../toolRegistry'
import { zodSchema } from 'ai'
import {
  bashToolDef,
  readToolDef,
  editToolDef,
  writeToolDef,
  globToolDef,
  grepToolDef,
} from '@openloaf/api/types/tools/runtime'

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
// A. 新工具 ID 注册验证
// ---------------------------------------------------------------------------

async function main() {
  console.log('\nA — 新工具 ID 在 TOOL_REGISTRY 中注册')

  const NEW_IDS = ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'] as const

  for (const id of NEW_IDS) {
    await test(`buildToolset 包含新 ID "${id}"`, () => {
      const toolset = buildToolset([id])
      assert.ok(toolset[id], `toolset 缺少 "${id}"`)
      assert.ok(typeof toolset[id].execute === 'function', `"${id}" 缺少 execute 方法`)
    })
  }

  // -----------------------------------------------------------------------
  // B. 旧工具 ID 别名映射
  // -----------------------------------------------------------------------
  console.log('\nB — 旧工具 ID 别名映射')

  const ALIAS_PAIRS: [string, string][] = [
    ['shell-command', 'Bash'],
    ['read-file', 'Read'],
    ['apply-patch', 'Edit'],
    ['list-dir', 'Glob'],
    ['grep-files', 'Grep'],
  ]

  for (const [oldId, newId] of ALIAS_PAIRS) {
    await test(`旧 ID "${oldId}" → 新 ID "${newId}" 映射`, () => {
      const toolset = buildToolset([oldId])
      // 别名映射后工具应以新 ID 注册
      assert.ok(toolset[newId], `使用旧 ID "${oldId}" 构建的 toolset 应包含新 ID "${newId}"`)
    })
  }

  // -----------------------------------------------------------------------
  // C. buildToolset 混合 ID 构建
  // -----------------------------------------------------------------------
  console.log('\nC — buildToolset 混合新旧 ID')

  await test('混合新旧 ID 构建 toolset 无冲突', () => {
    const toolset = buildToolset(['Bash', 'shell-command', 'Read', 'read-file', 'Edit', 'Glob', 'Grep'])
    // 新 ID 应存在
    assert.ok(toolset['Bash'], '缺少 Bash')
    assert.ok(toolset['Read'], '缺少 Read')
    assert.ok(toolset['Edit'], '缺少 Edit')
    assert.ok(toolset['Glob'], '缺少 Glob')
    assert.ok(toolset['Grep'], '缺少 Grep')
  })

  await test('空 ID 列表返回空 toolset', () => {
    const toolset = buildToolset([])
    assert.equal(Object.keys(toolset).length, 0)
  })

  await test('不存在的工具 ID 被静默忽略', () => {
    const toolset = buildToolset(['nonexistent-tool-xyz'])
    assert.equal(Object.keys(toolset).length, 0)
  })

  // -----------------------------------------------------------------------
  // D. getToolJsonSchemas 新旧 ID 均可用
  // -----------------------------------------------------------------------
  console.log('\nD — getToolJsonSchemas 兼容')

  await test('新 ID 返回有效 JSON schema', () => {
    const schemas = getToolJsonSchemas(['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'])
    for (const id of NEW_IDS) {
      assert.ok(schemas[id], `缺少 "${id}" 的 schema`)
      const schema = schemas[id] as Record<string, unknown>
      assert.equal(schema.type, 'object', `"${id}" schema type 应为 "object"`)
      assert.ok(schema.properties, `"${id}" schema 缺少 properties`)
    }
  })

  await test('旧 ID 通过别名返回有效 JSON schema', () => {
    const schemas = getToolJsonSchemas(['shell-command', 'read-file', 'apply-patch', 'list-dir', 'grep-files'])
    for (const oldId of ['shell-command', 'read-file', 'apply-patch', 'list-dir', 'grep-files']) {
      assert.ok(schemas[oldId], `旧 ID "${oldId}" 应返回 schema`)
    }
  })

  // -----------------------------------------------------------------------
  // E. 新工具定义 schema 结构验证
  // -----------------------------------------------------------------------
  console.log('\nE — 工具定义 schema 结构验证')

  const TOOL_DEFS_LIST = [
    { id: 'Bash', parameters: bashToolDef.parameters as any, expectedParams: ['command'] },
    { id: 'Read', parameters: readToolDef.parameters as any, expectedParams: ['file_path'] },
    { id: 'Edit', parameters: editToolDef.parameters as any, expectedParams: ['file_path', 'old_string', 'new_string'] },
    { id: 'Write', parameters: writeToolDef.parameters as any, expectedParams: ['file_path', 'content'] },
    { id: 'Glob', parameters: globToolDef.parameters as any, expectedParams: ['pattern'] },
    { id: 'Grep', parameters: grepToolDef.parameters as any, expectedParams: ['pattern'] },
  ]

  for (const { id, parameters, expectedParams } of TOOL_DEFS_LIST) {
    await test(`${id} schema 包含必需参数 ${expectedParams.join(', ')}`, () => {
      const converted = zodSchema(parameters)
      const jsonSchema = converted.jsonSchema as Record<string, unknown>
      assert.equal(jsonSchema.type, 'object')
      const props = jsonSchema.properties as Record<string, unknown>
      for (const param of expectedParams) {
        assert.ok(props[param], `${id} 缺少参数 "${param}"`)
      }
    })
  }

  await test('Edit schema 必须包含 replace_all 可选参数', () => {
    const converted = zodSchema(editToolDef.parameters as any)
    const jsonSchema = converted.jsonSchema as Record<string, unknown>
    const props = jsonSchema.properties as Record<string, unknown>
    assert.ok(props['replace_all'], 'Edit 缺少 replace_all 参数')
  })

  await test('Grep schema 必须包含 output_mode 枚举参数', () => {
    const converted = zodSchema(grepToolDef.parameters as any)
    const jsonSchema = converted.jsonSchema as Record<string, unknown>
    const props = jsonSchema.properties as Record<string, unknown>
    assert.ok(props['output_mode'], 'Grep 缺少 output_mode 参数')
  })

  await test('Bash schema 必须包含 run_in_background 可选参数', () => {
    const converted = zodSchema(bashToolDef.parameters as any)
    const jsonSchema = converted.jsonSchema as Record<string, unknown>
    const props = jsonSchema.properties as Record<string, unknown>
    assert.ok(props['run_in_background'], 'Bash 缺少 run_in_background 参数')
  })

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
  if (errors.length > 0) {
    console.log('\nFailed:')
    for (const e of errors) console.log(`  - ${e}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
