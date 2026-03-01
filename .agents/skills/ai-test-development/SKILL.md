---
name: ai-test-development
description: Use when creating, extending, or debugging automated tests for server modules or web utilities — covers test environment setup, test runner selection, layer-based test organization, pure function extraction, environment isolation, and concurrent test patterns
---

# AI Test Development

## Overview

项目维护两套独立测试体系：

| 体系 | 运行器 | 断言库 | 文件约定 | 运行方式 |
|------|--------|--------|----------|----------|
| 服务端 | `node:test`（自定义 runner） | `node:assert/strict` | `*.test.ts` | `node --import tsx/esm` 直接执行 |
| Web 端 | Vitest | `vitest`（expect） | `*.vitest.ts` | `pnpm vitest --run` |

两套体系共享同一套环境隔离原则：临时目录 + `setOpenLoafRootOverride` + DB session 隔离。

## When to Use

- 为服务端模块（`apps/server/`）编写新测试
- 为 Web 端纯函数/工具（`apps/web/src/lib/`）编写新测试
- 从 React 组件或复杂模块中提取可测试逻辑
- 调试现有测试失败
- 设计测试分层策略（纯函数 → I/O → 集成）

## Quick Reference

### 测试运行器选择

```
需要测试的代码在哪里？
├── apps/server/  → 服务端测试（node:assert + 自定义 runner）
│   文件：src/**/__tests__/*.test.ts
│   运行：cd apps/server && node --enable-source-maps --import tsx/esm \
│         --import ./scripts/registerMdTextLoader.mjs src/path/__tests__/xxx.test.ts
│
└── apps/web/     → Web 端测试（Vitest）
    文件：src/**/__tests__/*.vitest.ts
    运行：cd apps/web && pnpm vitest --run src/path/__tests__/xxx.vitest.ts
```

### 文件命名约定

- 服务端：`apps/server/src/<module>/__tests__/<name>.test.ts`
- Web 端：`apps/web/src/lib/<module>/__tests__/<name>.vitest.ts`
- 测试辅助：`__tests__/helpers/` 目录下

## Core Patterns

### 1. 分层测试组织（A → B → C）

每个测试文件按三层组织，从纯到重：

- **A 层（纯函数）**：无 I/O、无副作用，手动构造输入数据
- **B 层（I/O 操作）**：文件读写、DB 操作，需要环境隔离
- **C 层（集成）**：端到端流程，组合多个模块

参考：`apps/server/src/ai/__tests__/chatFileStore.test.ts`

### 2. 服务端测试模板

```typescript
import assert from 'node:assert/strict'
// ... 业务导入

// ---- Test runner ----
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

// ---- Main ----
async function main() {
  // Setup: 临时目录 + root override + DB session
  // Tests: A → B → C 分层
  // Teardown: 清理 DB + 重置 override + 删除临时目录
  // Summary: 输出统计
}

main().catch((err) => { console.error(err); process.exit(1) })
```

### 3. Web 端测试模板

```typescript
import { describe, expect, it } from 'vitest'
import { myFunction } from '../my-module'

describe('myFunction', () => {
  it('描述行为', () => {
    expect(myFunction(input)).toBe(expected)
  })
})
```

Vitest 配置：`apps/web/vitest.config.ts`（jsdom 环境，`@/` 别名已配置）。

### 4. 环境隔离模式

```typescript
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { setOpenLoafRootOverride } from '@openloaf/config'

// Setup
const tempDir = path.join(os.tmpdir(), `mytest_${Date.now()}`)
await fs.mkdir(tempDir, { recursive: true })
setOpenLoafRootOverride(tempDir)

// ... 测试代码 ...

// Teardown（放在 finally 块中）
setOpenLoafRootOverride(null)
await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
```

需要 DB 隔离时，额外创建 Prisma session 并在 teardown 中删除。

### 5. 纯函数提取策略

从 React 组件或复杂模块中提取可测试逻辑：

1. 识别无副作用的计算逻辑（条件判断、数据变换、查找算法）
2. 提取到独立 `.ts` 文件（非 `.tsx`），参数用 `input` 对象模式
3. 在原组件中调用提取后的函数
4. 为提取的函数编写 Vitest 测试

范例：
- 提取前：`apps/web/src/components/chat/ChatCoreProvider.tsx`（800+ 行组件）
- 提取后：`apps/web/src/lib/chat/branch-utils.ts`（7 个纯函数）
- 测试：`apps/web/src/lib/chat/__tests__/branch-utils.vitest.ts`（20 个用例）

## Common Mistakes

| 错误 | 修复 |
|------|------|
| 服务端测试用 Vitest | 服务端用 `node:assert` + 自定义 runner，直接 `node` 执行 |
| 忘记 `setOpenLoafRootOverride(null)` | 放在 `finally` 块中，确保异常时也能重置 |
| 测试间共享可变状态 | 每个测试用独立 session ID（`crypto.randomUUID()`） |
| 忘记 `clearSessionDirCache()` | 切换 root override 后必须清除缓存 |
| Web 测试文件命名为 `.test.ts` | 必须用 `.vitest.ts`，否则 Vitest 不会匹配 |
| 在测试中直接 import React 组件 | 提取纯函数到独立文件，测试纯函数 |

## Key Files

| 文件 | 用途 |
|------|------|
| `apps/server/src/ai/__tests__/chatFileStore.test.ts` | 服务端测试范例（33 用例，三层组织） |
| `apps/web/src/lib/chat/__tests__/branch-utils.vitest.ts` | Web 端测试范例（20 用例） |
| `apps/web/src/lib/chat/branch-utils.ts` | 纯函数提取范例 |
| `apps/server/src/ai/__tests__/helpers/testEnv.ts` | 测试环境辅助（模型解析、RequestContext） |
| `apps/server/src/ai/__tests__/helpers/printUtils.ts` | 输出格式化辅助 |
| `packages/config/src/openloaf-paths.ts` | `setOpenLoafRootOverride` 定义 |
| `apps/web/vitest.config.ts` | Vitest 配置 |
| `apps/server/scripts/registerMdTextLoader.mjs` | MD 文本加载器（服务端测试需 import） |

详细代码模板见 [references/test-patterns.md](references/test-patterns.md)。

## AI Agent 行为测试（Promptfoo）

### 概述

除了上述分层测试体系外，项目还使用 [Promptfoo](https://github.com/promptfoo/promptfoo) 进行 **AI Agent 行为质量测试**。这类测试关注的不是代码逻辑正确性，而是 Agent 在面对自然语言指令时的行为质量：

- **工具选择正确性**：Agent 是否选了正确的工具（如"有哪些项目"应用 `project-query` 而非 `list-dir`）
- **输出语义质量**：Agent 回复是否语义合理、对用户有帮助
- **多轮对话上下文保持**：同一会话连续交互时上下文是否正确延续

### 架构

项目提供两套 Provider，覆盖不同测试场景：

| Provider | 入口函数 | 工具集 | 会话管理 | 多轮对话 | 用途 |
|----------|----------|--------|----------|----------|------|
| **E2E Provider**（默认） | `runChatStream()` | Agent 工厂自动组装 | 完整 | 支持 | 端到端行为验证 |
| **Agent Provider**（调试） | `createMasterAgentRunner()` | 手动 `toolIds` | 无 | 不支持 | 快速直接调用调试 |

#### E2E Provider（openloaf-e2e-provider.ts）

直接调用 `runChatStream()` — 即 `/ai/chat` 路由的核心服务函数，包含完整 pipeline：

```
runChatStream()
  ├─ initRequestContext()           — 完整请求上下文
  ├─ ensureSessionPreface()         — 创建/更新会话
  ├─ saveLastMessageAndResolveParent() — 持久化用户消息
  ├─ loadAndPrepareMessageChain()   — 加载历史链
  ├─ resolveChatModel()             — 从 agent config 自动解析模型
  ├─ assembleDefaultAgentInstructions() — 动态组装系统提示
  ├─ createMasterAgentRunner()      — 创建 Agent（完整工具集）
  └─ createChatStreamResponse()     — 返回 SSE Response
```

E2E Provider 通过 `consumeSseResponse()` 解析 SSE Response，提取文本、工具调用、子 Agent 事件。

#### Agent Provider（openloaf-agent-provider.ts）

直接调用 `createMasterAgentRunner()` 并手动指定 `toolIds`，跳过会话管理，用于快速工具选择调试。

### 运行方式

```bash
cd apps/server

# 运行所有 E2E 行为测试
pnpm run test:ai:behavior

# 运行指定用例
pnpm run test:ai:behavior -- --filter-description "e2e-001"

# 每个用例运行 3 次（测试稳定性）
pnpm run test:ai:behavior -- --repeat 3

# 打开 Web UI 查看结果矩阵
pnpm run test:ai:behavior:view
```

也可通过 Claude Code 的 `/ai-test` 命令运行。

### 添加新测试用例

在 `apps/server/src/ai/__tests__/agent-behavior/promptfooconfig.yaml` 的 `tests:` 数组中添加：

```yaml
# 单轮用例
- description: "e2e-NNN: 描述"
  vars:
    prompt: "用户输入"
  assert:
    - type: javascript
      value: |
        const tools = context.providerResponse?.metadata?.toolNames || [];
        return tools.includes('correct-tool')
          ? { pass: true, score: 1 }
          : { pass: false, score: 0, reason: `未调用 correct-tool，实际: [${tools}]` };
    - type: llm-rubric
      value: "期望的输出质量描述"

# 多轮对话用例
- description: "e2e-NNN: 多轮描述"
  vars:
    prompt: "dummy"
    turns: '[{"text": "第一轮输入"}, {"text": "第二轮输入"}]'
  assert:
    - type: llm-rubric
      value: "最后一轮回复应保持上下文"
```

注意：E2E Provider 不接受 `toolIds` 参数，Agent 使用完整工具集。

### 断言类型

| 类型 | 用途 | 确定性 |
|------|------|--------|
| `javascript` | 检查 `metadata.toolNames` 中的工具调用 | 确定性 |
| `llm-rubric` | LLM 判断输出是否满足语义要求 | 非确定性 |

### 失败排查

| 原因 | 修改目标 |
|------|----------|
| 工具描述不够明确 | `packages/api/src/types/tools/*.ts` |
| 系统提示词引导不足 | `apps/server/src/ai/agent-templates/templates/master/prompt.zh.md` |
| 工具别名缺失 | `apps/server/src/ai/tools/toolRegistry.ts` TOOL_ALIASES |

### 关键文件

| 文件 | 用途 |
|------|------|
| `apps/server/src/ai/__tests__/agent-behavior/promptfooconfig.yaml` | 测试用例定义 |
| `apps/server/src/ai/__tests__/agent-behavior/openloaf-e2e-provider.ts` | E2E Provider（完整 pipeline） |
| `apps/server/src/ai/__tests__/agent-behavior/openloaf-agent-provider.ts` | Agent Provider（快速调试） |
| `apps/server/src/ai/__tests__/helpers/sseParser.ts` | SSE 解析工具（含 `consumeSseResponse`） |
| `apps/server/scripts/run-behavior-test.mjs` | 测试运行脚本 |
| `.claude/commands/ai-test.md` | Claude Code `/ai-test` Skill |
