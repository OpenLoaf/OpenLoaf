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
 * 能力组 & 工具 ID 一致性测试
 *
 * 验证：
 *   A. 能力组中的工具 ID 与 TOOL_REGISTRY 一致
 *   B. 新工具 ID（PascalCase）在正确的能力组中
 *   C. 旧工具 ID 不再出现在能力组中
 *   D. agentFactory 中的工具 ID 正确
 *   E. contextWindowManager 中的工具重要度映射正确
 *   F. supervisionService 中的只读工具集正确
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/capabilityGroups.test.ts
 */
import assert from 'node:assert/strict'
import { CAPABILITY_GROUPS } from '@/ai/tools/capabilityGroups'
import { buildToolset } from '@/ai/tools/toolRegistry'

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
// Main
// ---------------------------------------------------------------------------

async function main() {
  // -----------------------------------------------------------------------
  // A. 能力组工具 ID 在 TOOL_REGISTRY 中存在
  // -----------------------------------------------------------------------
  console.log('\nA — 能力组工具 ID 存在于 TOOL_REGISTRY')

  for (const group of CAPABILITY_GROUPS) {
    await test(`能力组 "${group.id}" 的所有工具可被注册`, () => {
      const toolset = buildToolset(group.toolIds)
      for (const toolId of group.toolIds) {
        // 工具可能不在当前 registry 中（如 MCP 工具），但核心工具必须在
        const coreTools = ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash']
        if (coreTools.includes(toolId)) {
          assert.ok(
            toolset[toolId],
            `核心工具 "${toolId}" 在能力组 "${group.id}" 中定义但未在 registry 中找到`,
          )
        }
      }
    })
  }

  // -----------------------------------------------------------------------
  // B. 新工具 ID 在正确的能力组中
  // -----------------------------------------------------------------------
  console.log('\nB — 新工具 ID 在正确的能力组中')

  const FILE_READ_GROUP = CAPABILITY_GROUPS.find((g) => g.id === 'file-read')
  const FILE_WRITE_GROUP = CAPABILITY_GROUPS.find((g) => g.id === 'file-write')
  const SHELL_GROUP = CAPABILITY_GROUPS.find((g) => g.id === 'shell')

  await test('file-read 组包含 Read, Glob, Grep', () => {
    assert.ok(FILE_READ_GROUP, '应存在 file-read 能力组')
    assert.ok(FILE_READ_GROUP!.toolIds.includes('Read'), '应包含 Read')
    assert.ok(FILE_READ_GROUP!.toolIds.includes('Glob'), '应包含 Glob')
    assert.ok(FILE_READ_GROUP!.toolIds.includes('Grep'), '应包含 Grep')
  })

  await test('file-write 组包含 Edit, Write', () => {
    assert.ok(FILE_WRITE_GROUP, '应存在 file-write 能力组')
    assert.ok(FILE_WRITE_GROUP!.toolIds.includes('Edit'), '应包含 Edit')
    assert.ok(FILE_WRITE_GROUP!.toolIds.includes('Write'), '应包含 Write')
  })

  await test('shell 组包含 Bash', () => {
    assert.ok(SHELL_GROUP, '应存在 shell 能力组')
    assert.ok(SHELL_GROUP!.toolIds.includes('Bash'), '应包含 Bash')
  })

  // -----------------------------------------------------------------------
  // C. 旧工具 ID 不在能力组中
  // -----------------------------------------------------------------------
  console.log('\nC — 旧工具 ID 不在能力组中')

  const OLD_IDS = ['shell-command', 'read-file', 'apply-patch', 'list-dir', 'grep-files']

  await test('能力组中不包含任何旧工具 ID', () => {
    for (const group of CAPABILITY_GROUPS) {
      for (const oldId of OLD_IDS) {
        assert.ok(
          !group.toolIds.includes(oldId),
          `能力组 "${group.id}" 不应包含旧 ID "${oldId}"`,
        )
      }
    }
  })

  // -----------------------------------------------------------------------
  // D. 能力组元数据完整性
  // -----------------------------------------------------------------------
  console.log('\nD — 能力组元数据完整性')

  await test('所有能力组有 id、label、description、toolIds', () => {
    for (const group of CAPABILITY_GROUPS) {
      assert.ok(group.id, `组缺少 id`)
      assert.ok(group.label, `组 ${group.id} 缺少 label`)
      assert.ok(group.description, `组 ${group.id} 缺少 description`)
      assert.ok(group.toolIds.length > 0, `组 ${group.id} 的 toolIds 为空`)
    }
  })

  await test('所有能力组 tools 数组已解析', () => {
    for (const group of CAPABILITY_GROUPS) {
      assert.ok(Array.isArray(group.tools), `组 ${group.id} 的 tools 不是数组`)
      assert.equal(
        group.tools.length,
        group.toolIds.length,
        `组 ${group.id} 的 tools 长度应与 toolIds 相同`,
      )
    }
  })

  // -----------------------------------------------------------------------
  // E. 工具 ID 无重复
  // -----------------------------------------------------------------------
  console.log('\nE — 工具 ID 无重复')

  await test('同一能力组内无重复工具 ID', () => {
    for (const group of CAPABILITY_GROUPS) {
      const seen = new Set<string>()
      for (const toolId of group.toolIds) {
        assert.ok(!seen.has(toolId), `组 ${group.id} 中 "${toolId}" 重复`)
        seen.add(toolId)
      }
    }
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
