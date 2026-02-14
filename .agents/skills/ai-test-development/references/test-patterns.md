# Test Patterns Reference

详细代码模板，供 AI 创建测试时直接复制使用。

## 服务端完整测试模板

```typescript
/**
 * <模块名> comprehensive tests.
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/<module>/__tests__/<name>.test.ts
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTenasRootOverride } from '@tenas-ai/config'
import { prisma } from '@tenas-ai/db'
// ... 业务模块导入

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
// Helpers
// ---------------------------------------------------------------------------

const testSessionId = `test_<prefix>_${crypto.randomUUID()}`
let tempDir: string

// 按需定义 helper 函数（构造测试数据等）

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // ---- Setup ----
  tempDir = path.join(os.tmpdir(), `<prefix>_test_${Date.now()}`)
  await fs.mkdir(tempDir, { recursive: true })
  setTenasRootOverride(tempDir)

  // 如需 DB 隔离：
  // await prisma.chatSession.create({ data: { id: testSessionId } })

  try {
    // =================================================================
    // A layer: pure functions
    // =================================================================
    console.log('\n--- A layer: pure functions ---')

    await test('A1: 描述', () => {
      // 手动构造输入，调用纯函数，assert 结果
      assert.equal(actual, expected)
    })

    // =================================================================
    // B layer: file/DB operations
    // =================================================================
    console.log('\n--- B layer: file operations ---')

    await test('B1: 描述', async () => {
      // 涉及文件读写或 DB 操作
    })

    // =================================================================
    // C layer: integration
    // =================================================================
    console.log('\n--- C layer: integration ---')

    await test('C1: 描述', async () => {
      // 端到端流程测试
    })
  } finally {
    // ---- Teardown ----
    // await prisma.chatSession.delete({ where: { id: testSessionId } }).catch(() => {})
    setTenasRootOverride(null)
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }

  // ---- Summary ----
  console.log(`\n${passed} passed, ${failed} failed`)
  if (errors.length > 0) {
    console.log('\nFailed tests:')
    for (const e of errors) console.log(`  - ${e}`)
  }
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

## Web 端完整测试模板

```typescript
import { describe, expect, it } from 'vitest'

import {
  functionA,
  functionB,
} from '../my-module'

// ---------------------------------------------------------------------------
// A: functionA
// ---------------------------------------------------------------------------
describe('functionA', () => {
  it('A1: 正常输入 -> 预期输出', () => {
    expect(functionA({ key: 'value' })).toBe('expected')
  })

  it('A2: 边界情况 -> 安全处理', () => {
    expect(functionA({ key: '' })).toBeNull()
  })

  it('A3: 空输入 -> 默认值', () => {
    expect(functionA({})).toBe('default')
  })
})

// ---------------------------------------------------------------------------
// B: functionB
// ---------------------------------------------------------------------------
describe('functionB', () => {
  const fixtures = [
    { id: 'u1', role: 'user' },
    { id: 'a1', role: 'assistant' },
  ]

  it('B1: 描述', () => {
    expect(functionB({ messages: fixtures })).toBe('u1')
  })
})
```

Vitest 配置要点（`apps/web/vitest.config.ts`）：
- 环境：`jsdom`
- 匹配：`src/**/*.vitest.ts`, `src/**/*.vitest.tsx`
- 别名：`@/` → `./src/`, `@tenas-ai/ui` → `packages/ui/src`

## 环境隔离代码片段

### 临时目录 + Root Override

```typescript
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { setTenasRootOverride } from '@tenas-ai/config'

// Setup
const tempDir = path.join(os.tmpdir(), `mytest_${Date.now()}`)
await fs.mkdir(tempDir, { recursive: true })
setTenasRootOverride(tempDir)

// Teardown（必须在 finally 中）
setTenasRootOverride(null)
await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
```

### DB Session 隔离

```typescript
import crypto from 'node:crypto'
import { prisma } from '@tenas-ai/db'

const testSessionId = `test_${crypto.randomUUID()}`

// Setup
await prisma.chatSession.create({ data: { id: testSessionId } })

// Teardown
await prisma.chatSession.delete({ where: { id: testSessionId } }).catch(() => {})
```

### 缓存清除

切换 `setTenasRootOverride` 后，如果被测模块有内部缓存，需要手动清除：

```typescript
import { clearSessionDirCache } from '@/ai/services/chat/repositories/chatFileStore'

setTenasRootOverride(tempDir)
clearSessionDirCache()  // 重要：否则缓存指向旧路径
```

## 并发测试模式

验证 mutex/锁机制是否正确工作：

```typescript
await test('concurrent writes via mutex', async () => {
  const sid = `test_conc_${crypto.randomUUID()}`
  await prisma.chatSession.create({ data: { id: sid } })
  registerSessionDir(sid)

  // 并发写入 10 条消息
  const promises = Array.from({ length: 10 }, (_, i) =>
    appendMessage({ sessionId: sid, message: msg(`conc${i}`, null) }),
  )
  await Promise.all(promises)

  // 验证全部写入成功
  const tree = await loadMessageTree(sid)
  assert.equal(tree.byId.size, 10)

  // 清理
  await deleteSessionFiles(sid)
  await prisma.chatSession.delete({ where: { id: sid } }).catch(() => {})
})
```

## 纯函数提取示例

### 提取前（组件内嵌逻辑）

```tsx
// ChatCoreProvider.tsx 第 792-810 行
const handleSend = (opts) => {
  let parentId: string | null
  if (opts.parentMessageId !== undefined) {
    parentId = opts.parentMessageId
  } else if (messages.length === 0) {
    parentId = null
  } else {
    const last = messages.at(-1)?.id ?? null
    const isLeafInCurrent = leafMessageId && messages.some(m => m.id === leafMessageId)
    parentId = (isLeafInCurrent ? leafMessageId : null) ?? last
  }
  // ...
}
```

### 提取后（独立纯函数）

```typescript
// branch-utils.ts
export function resolveParentMessageId(input: {
  explicitParentMessageId: string | null | undefined
  leafMessageId: string | null
  messages: Array<{ id: string }>
}): string | null {
  const { explicitParentMessageId, leafMessageId, messages } = input
  if (explicitParentMessageId !== undefined) return explicitParentMessageId
  if (messages.length === 0) return null
  const lastMessageId = String(messages.at(-1)?.id ?? '') || null
  const isLeafInCurrentMessages =
    typeof leafMessageId === 'string' &&
    leafMessageId.length > 0 &&
    messages.some((m) => String(m.id) === leafMessageId)
  return (isLeafInCurrentMessages ? leafMessageId : null) ?? lastMessageId
}
```

### 提取原则

1. **参数用对象模式**：`function fn(input: { ... })` 而非多个位置参数
2. **返回值明确**：避免 `void`，返回计算结果
3. **无副作用**：不修改外部状态、不做 I/O
4. **类型最小化**：参数类型只声明实际使用的字段（`Array<{ id: string }>` 而非完整 Message 类型）
