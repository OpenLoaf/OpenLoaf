// @ts-nocheck — AI SDK 泛型在直接调用时有类型推断问题，运行时正确性由测试覆盖。
/**
 * repairToolCall 回归测试
 *
 * 复现 chat_20260316_201510_b0m3emrs 中的死循环 bug：
 * Kimi K2.5 调用 shell-command 传入 timeoutMs: -1，Zod 校验失败，
 * 连续 13 次相同验证错误形成死循环。
 *
 * 本测试验证两层修复：
 *   1. Schema 层 — timeoutMs 已从 shell-command 移除，旧参数被忽略
 *   2. Repair 层 — 熔断器 + 语义修复（剥离无效可选字段）
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm \
 *     src/ai/shared/__tests__/repairToolCall.test.ts
 */
import assert from 'node:assert/strict'
import { InvalidToolInputError } from 'ai'
import { shellCommandToolDef } from '@openloaf/api/types/tools/runtime'
import { createToolCallRepair } from '@/ai/shared/repairToolCall'

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
    console.log(`  ✓ ${name}`)
  } catch (err: any) {
    failed++
    const m = err?.message ?? String(err)
    errors.push(`${name}: ${m}`)
    console.log(`  ✗ ${name}: ${m}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 模拟一个 InvalidToolInputError（Zod 验证失败时 AI SDK 抛出的类型）。 */
function makeInvalidInputError(message: string, zodIssues: any[]): Error {
  // AI SDK 的 InvalidToolInputError 通过 isInstance 静态方法检测，
  // 内部使用 Symbol marker。我们直接构造带正确标记的实例。
  const err = new InvalidToolInputError({
    toolName: 'shell-command',
    toolArgs: '{}',
    message,
  });
  // 将 Zod issues 注入 cause
  (err as any).cause = { issues: zodIssues };
  return err;
}

/** 模拟 inputSchema 回调（返回 JSON Schema）。 */
function mockInputSchema(requiredFields: string[]) {
  return async (_opts: { toolName: string }) => ({
    type: 'object' as const,
    required: requiredFields,
    properties: {},
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // =========================================================================
  // A 层 — Schema 层修复验证
  // =========================================================================
  console.log('\nA 层 — Schema 层修复（timeoutMs 已从 shell-command 移除）')

  await test('A1: shell-command schema 不再包含 timeoutMs', () => {
    const shape = shellCommandToolDef.parameters.shape as Record<string, unknown>
    assert.equal('timeoutMs' in shape, false, 'timeoutMs should be removed from schema')
  })

  await test('A2: shell-command schema 不再包含 sandboxPermissions', () => {
    const shape = shellCommandToolDef.parameters.shape as Record<string, unknown>
    assert.equal('sandboxPermissions' in shape, false)
  })

  await test('A3: shell-command schema 不再包含 justification', () => {
    const shape = shellCommandToolDef.parameters.shape as Record<string, unknown>
    assert.equal('justification' in shape, false)
  })

  await test('A4: shell-command schema 不再包含 actionName', () => {
    const shape = shellCommandToolDef.parameters.shape as Record<string, unknown>
    assert.equal('actionName' in shape, false)
  })

  await test('A5: 原始故障输入（含 timeoutMs:-1）现在会被 Zod strip 掉多余字段并通过验证', () => {
    // 这是 Kimi K2.5 实际传入的参数
    const faultyInput = {
      command: 'python3 orange_book_scraper.py',
      actionName: '运行橙皮书数据抓取测试',
      justification: '运行橙皮书爬虫抓取日本工业品数据',
      timeoutMs: -1,
    }
    const result = shellCommandToolDef.parameters.safeParse(faultyInput)
    assert.equal(result.success, true, 'should pass validation after removing unused fields from schema')
  })

  await test('A6: 正常输入仍然通过验证', () => {
    const result = shellCommandToolDef.parameters.safeParse({
      command: 'ls -la',
      workdir: '/tmp',
    })
    assert.equal(result.success, true)
  })

  await test('A7: 必填字段 command 缺失仍然报错', () => {
    const result = shellCommandToolDef.parameters.safeParse({
      workdir: '/tmp',
    })
    assert.equal(result.success, false)
  })

  // =========================================================================
  // B 层 — Repair 语义修复验证
  // =========================================================================
  console.log('\nB 层 — Repair 语义修复（剥离无效可选字段）')

  await test('B1: 语义修复 — 删除无效的可选字段 timeoutMs', async () => {
    const repair = createToolCallRepair()
    const toolCall = {
      toolCallId: 'test-b1',
      toolName: 'shell-command',
      input: JSON.stringify({
        command: 'python3 script.py',
        timeoutMs: -1,
      }),
    }
    const error = makeInvalidInputError(
      'Too small: expected number to be >0',
      [{ code: 'too_small', minimum: 0, inclusive: false, path: ['timeoutMs'], message: 'Too small: expected number to be >0' }],
    )

    const result = await repair({
      toolCall,
      tools: {},
      error,
      inputSchema: mockInputSchema(['command']),
    })

    assert.ok(result, 'should return a repaired tool call')
    const parsed = JSON.parse(result!.input)
    assert.equal(parsed.command, 'python3 script.py', 'command should be preserved')
    assert.equal('timeoutMs' in parsed, false, 'timeoutMs should be stripped')
  })

  await test('B2: 语义修复 — 不删除 required 字段', async () => {
    const repair = createToolCallRepair()
    const toolCall = {
      toolCallId: 'test-b2',
      toolName: 'shell-command',
      input: JSON.stringify({ command: '' }),
    }
    const error = makeInvalidInputError(
      'String must contain at least 1 character(s)',
      [{ code: 'too_small', minimum: 1, path: ['command'], message: 'String must contain at least 1 character(s)' }],
    )

    const result = await repair({
      toolCall,
      tools: {},
      error,
      inputSchema: mockInputSchema(['command']),
    })

    // command 是 required 字段，不能被删除，所以语义修复不应修改
    // 它会走 JSON repair 回退逻辑，但 JSON 本身是完好的，不会修改
    if (result) {
      const parsed = JSON.parse(result.input)
      assert.equal('command' in parsed, true, 'command should NOT be stripped')
    }
  })

  await test('B3: 语义修复 — 多个无效可选字段同时删除', async () => {
    const repair = createToolCallRepair()
    const toolCall = {
      toolCallId: 'test-b3',
      toolName: 'shell-command',
      input: JSON.stringify({
        command: 'ls',
        timeoutMs: -1,
        badField: 'invalid',
      }),
    }
    const error = makeInvalidInputError(
      'Multiple validation errors',
      [
        { code: 'too_small', path: ['timeoutMs'], message: 'Too small' },
        { code: 'invalid_type', path: ['badField'], message: 'Unexpected field' },
      ],
    )

    const result = await repair({
      toolCall,
      tools: {},
      error,
      inputSchema: mockInputSchema(['command']),
    })

    assert.ok(result, 'should return a repaired tool call')
    const parsed = JSON.parse(result!.input)
    assert.equal(parsed.command, 'ls')
    assert.equal('timeoutMs' in parsed, false)
    assert.equal('badField' in parsed, false)
  })

  // =========================================================================
  // C 层 — 熔断器验证
  // =========================================================================
  console.log('\nC 层 — 熔断器（Circuit Breaker）')

  await test('C1: 同类错误连续 3 次后触发熔断，返回 null', async () => {
    // 创建新的 repair 实例（共享模块级 Map，但用唯一工具名隔离）
    const repair = createToolCallRepair()
    const error = makeInvalidInputError(
      'Too small: expected number to be >0',
      // 故意不提供 path，使语义修复无法工作，强制触发熔断
      [],
    )
    const toolCall = {
      toolCallId: 'test-c1',
      toolName: 'circuit-breaker-test-tool',
      input: JSON.stringify({ command: 'test', timeoutMs: -1 }),
    }

    // 第 1 次 — 应该尝试修复（返回非 null 或 null 取决于逻辑）
    const r1 = await repair({ toolCall, tools: {}, error, inputSchema: mockInputSchema(['command']) })
    // 第 2 次
    const r2 = await repair({ toolCall, tools: {}, error, inputSchema: mockInputSchema(['command']) })
    // 第 3 次 — 达到阈值，应该返回 null
    const r3 = await repair({ toolCall, tools: {}, error, inputSchema: mockInputSchema(['command']) })

    assert.equal(r3, null, 'third attempt should return null (circuit breaker triggered)')
  })

  // =========================================================================
  // D 层 — 完整场景复现（chat_20260316_201510_b0m3emrs）
  // =========================================================================
  console.log('\nD 层 — 完整场景复现（Kimi K2.5 死循环 bug）')

  await test('D1: Kimi K2.5 原始故障输入 — schema 层直接通过（不再触发验证错误）', () => {
    // 这是 Kimi K2.5 实际传入的完整参数
    const kimiInput = {
      command: 'python3 orange_book_scraper.py',
      actionName: '运行橙皮书数据抓取测试',
      justification: '运行橙皮书爬虫抓取日本工业品数据',
      timeoutMs: -1,
    }

    // 修复后的 schema 只有 command, workdir, login — 多余字段被 Zod strip
    const result = shellCommandToolDef.parameters.safeParse(kimiInput)
    assert.equal(result.success, true, 'Kimi K2.5 faulty input should now pass validation')

    if (result.success) {
      // 确认 Zod 只保留了有效字段
      const data = result.data as Record<string, unknown>
      assert.equal(data.command, 'python3 orange_book_scraper.py')
      assert.equal('timeoutMs' in data, false, 'timeoutMs should be stripped by Zod')
      assert.equal('actionName' in data, false, 'actionName should be stripped by Zod')
      assert.equal('justification' in data, false, 'justification should be stripped by Zod')
    }
  })

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
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
