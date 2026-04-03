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
 * 技术债验证测试 — Agent 系统 & 模型抽象层
 *
 * 采用静态源码断言方式（node:fs 读取文件，字符串匹配）验证以下 9 项已知技术债：
 *
 * TD-1: MCP PID 跟踪空实现 — doConnect() 从未给 entry.pid 赋值
 * TD-2: @deprecated agentManager Proxy 仍被 agentTools.ts 直接导入使用
 * TD-3: [FIXED] CORE_TOOL_IDS 已提取到 shared/coreToolIds.ts，三处引用均使用共享定义
 * TD-4: CLI 适配器 buildEmptyUsage / stripAnsiControlSequences 函数重复
 * TD-5: AsyncQueue 通用数据结构内联在 codexAppServerLanguageModel.ts 中
 * TD-6: cliAdapter.ts 中 provider ID 硬编码魔法字符串
 * TD-7: [FIXED] AgentManager God Object 已拆分为独立模块（executeAgent 提取到 agentExecutor.ts）
 * TD-8: ChatStreamUseCase 空壳类 — execute 仅透传调用（已修复：类已删除，直接调用 runChatStream）
 * TD-9: ai.ts DEPRECATED_MESSAGE 含 "vedio" 拼写错误
 *
 * 用法：
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/tech-debt-agent-model.test.ts
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// 辅助：相对于 monorepo server 包的绝对路径
// ---------------------------------------------------------------------------

// 测试文件位于 src/ai/__tests__/，向上两层到达 src/
const SERVER_SRC = path.resolve(import.meta.dirname, '../..')

function readSrc(relPath: string): string {
  const fullPath = path.join(SERVER_SRC, relPath)
  return fs.readFileSync(fullPath, 'utf-8')
}

function existsSrc(relPath: string): boolean {
  return fs.existsSync(path.join(SERVER_SRC, relPath))
}

// ---------------------------------------------------------------------------
// 轻量测试运行器（与现有测试风格保持一致）
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const failures: string[] = []

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err: any) {
    failed++
    const msg = err?.message ?? String(err)
    failures.push(`${name}: ${msg}`)
    console.log(`  ✗ ${name}: ${msg}`)
  }
}

// ---------------------------------------------------------------------------
// TD-1: MCP PID 跟踪空实现
// ---------------------------------------------------------------------------

await test(
  'TD-1 [MCP PID] doConnect() 从未给 entry.pid 赋值（PID 跟踪空实现）',
  () => {
    const source = readSrc('ai/services/mcpClientManager.ts')

    // 确认 pid 字段声明存在
    assert.ok(
      source.includes('pid?: number'),
      '期望 MCPClientEntry 声明了 pid?: number 字段',
    )

    // 提取 doConnect 方法体：从 "private async doConnect" 到下一个 "private " 方法
    const doConnectStart = source.indexOf('private async doConnect(')
    assert.ok(doConnectStart !== -1, '期望找到 doConnect 方法')

    // 找到 doConnect 结束位置（下一个 private 方法或类结束）
    const afterDoConnect = source.slice(doConnectStart + 1)
    const nextPrivateOffset = afterDoConnect.search(/\n {2}(private|public|async) /)
    const doConnectBody =
      nextPrivateOffset === -1
        ? afterDoConnect
        : afterDoConnect.slice(0, nextPrivateOffset)

    // [FIXED] doConnect 现在应包含 entry.pid 赋值
    const hasPidAssignment = /entry\.pid\s*=/.test(doConnectBody)
    assert.equal(
      hasPidAssignment,
      true,
      '[FIXED] doConnect() 内已有 entry.pid 赋值，PID 跟踪已实现',
    )
  },
)

// ---------------------------------------------------------------------------
// TD-2: @deprecated agentManager Proxy 迁移（已修复）
// ---------------------------------------------------------------------------

await test(
  'TD-2 [FIXED] agentTools.ts 已迁移到 getAgentManager()',
  () => {
    const agentToolsSrc = readSrc('ai/tools/agentTools.ts')

    // agentTools.ts 不再导入废弃的 agentManager proxy
    const importsDeprecated =
      agentToolsSrc.includes("import { agentManager") ||
      agentToolsSrc.includes("import {agentManager")
    assert.equal(
      importsDeprecated,
      false,
      '[FIXED] agentTools.ts 不再导入废弃的 agentManager proxy',
    )

    // agentTools.ts 已改用 getAgentManager()
    assert.ok(
      agentToolsSrc.includes('getAgentManager'),
      '[FIXED] agentTools.ts 已使用 getAgentManager()',
    )
  },
)

// ---------------------------------------------------------------------------
// TD-3: CORE_TOOL_IDS 三处定义不一致 → [FIXED] 提取到 shared/coreToolIds.ts
// ---------------------------------------------------------------------------

await test(
  'TD-3 [FIXED] CORE_TOOL_IDS 已提取到 shared/coreToolIds.ts，三处引用均使用共享定义',
  () => {
    const source = readSrc('ai/services/agentFactory.ts')
    const sharedSrc = readSrc('ai/shared/coreToolIds.ts')

    // 共享模块应包含三个具名导出
    assert.ok(
      sharedSrc.includes('export const MASTER_CORE_TOOL_IDS'),
      '[FIXED] coreToolIds.ts 包含 MASTER_CORE_TOOL_IDS',
    )
    assert.ok(
      sharedSrc.includes('export const PM_CORE_TOOL_IDS'),
      '[FIXED] coreToolIds.ts 包含 PM_CORE_TOOL_IDS',
    )
    assert.ok(
      sharedSrc.includes('export const SUB_AGENT_CORE_TOOL_IDS'),
      '[FIXED] coreToolIds.ts 包含 SUB_AGENT_CORE_TOOL_IDS',
    )
    assert.ok(
      sharedSrc.includes('export const CORE_TOOL_IDS'),
      '[FIXED] coreToolIds.ts 包含 CORE_TOOL_IDS 基础集合',
    )

    // agentFactory.ts 应从共享模块导入
    const importsShared =
      source.includes("from '@/ai/shared/coreToolIds'") ||
      source.includes('from "@/ai/shared/coreToolIds"')
    assert.ok(importsShared, '[FIXED] agentFactory.ts 从 shared/coreToolIds 导入')

    // agentFactory.ts 使用共享常量而非内联数组（检查 coreToolIds 赋值行引用了共享常量）
    const pmFnStart = source.indexOf('export function createPMAgent(')
    assert.ok(pmFnStart !== -1, '期望找到 createPMAgent 函数')
    const pmSection = source.slice(pmFnStart, pmFnStart + 500)
    assert.ok(
      /const coreToolIds\s*=\s*\[\.\.\.PM_CORE_TOOL_IDS\]/.test(pmSection),
      '[FIXED] createPMAgent 使用 PM_CORE_TOOL_IDS 共享常量',
    )

    const subFnStart = source.indexOf('function createGeneralPurposeSubAgent(')
    assert.ok(subFnStart !== -1, '期望找到 createGeneralPurposeSubAgent 函数')
    const subSection = source.slice(subFnStart, subFnStart + 500)
    assert.ok(
      /const coreToolIds\s*=\s*\[\.\.\.SUB_AGENT_CORE_TOOL_IDS\]/.test(subSection),
      '[FIXED] createGeneralPurposeSubAgent 使用 SUB_AGENT_CORE_TOOL_IDS 共享常量',
    )

    // 共享模块中 MASTER 和 PM 包含 Agent + SendMessage，SUB_AGENT 不含
    assert.ok(
      sharedSrc.includes("'Agent'") && sharedSrc.includes("'SendMessage'"),
      '[FIXED] 共享模块包含 Agent + SendMessage（供 MASTER/PM 使用）',
    )
    assert.ok(
      sharedSrc.includes('SUB_AGENT_CORE_TOOL_IDS = CORE_TOOL_IDS'),
      '[FIXED] SUB_AGENT_CORE_TOOL_IDS 明确指向不含 Agent/SendMessage 的基础集合',
    )
  },
)

// ---------------------------------------------------------------------------
// TD-4: CLI 适配器 buildEmptyUsage / stripAnsiControlSequences 函数重复
// ---------------------------------------------------------------------------

await test(
  'TD-4 [FIXED] CLI 适配器函数已提取到 cliShared.ts',
  () => {
    const sharedSrc = readSrc('ai/models/cli/cliShared.ts')
    const claudeSrc = readSrc('ai/models/cli/claudeCode/claudeCodeLanguageModel.ts')
    const codexSrc = readSrc('ai/models/cli/codex/codexAppServerLanguageModel.ts')

    // 共享模块应包含函数定义
    assert.ok(sharedSrc.includes('function buildEmptyUsage()'), '[FIXED] cliShared.ts 包含 buildEmptyUsage')
    assert.ok(sharedSrc.includes('function stripAnsiControlSequences('), '[FIXED] cliShared.ts 包含 stripAnsiControlSequences')

    // 原文件不应再有本地定义
    assert.ok(!claudeSrc.includes('function buildEmptyUsage()'), '[FIXED] claudeCode 已移除本地定义')
    assert.ok(!codexSrc.includes('function buildEmptyUsage()'), '[FIXED] codex 已移除本地定义')

    // 原文件应从 cliShared 导入
    assert.ok(claudeSrc.includes('from "../cliShared"') || claudeSrc.includes("from '../cliShared'"), '[FIXED] claudeCode 从 cliShared 导入')
    assert.ok(codexSrc.includes('from "../cliShared"') || codexSrc.includes("from '../cliShared'"), '[FIXED] codex 从 cliShared 导入')
  },
)

// ---------------------------------------------------------------------------
// TD-5: AsyncQueue 通用数据结构内联在 codexAppServerLanguageModel.ts
// ---------------------------------------------------------------------------

await test(
  'TD-5 [FIXED] AsyncQueue 已提取到 cliShared.ts',
  () => {
    const sharedSrc = readSrc('ai/models/cli/cliShared.ts')
    const codexSrc = readSrc('ai/models/cli/codex/codexAppServerLanguageModel.ts')

    assert.ok(sharedSrc.includes('class AsyncQueue<'), '[FIXED] cliShared.ts 包含 AsyncQueue')
    // codex 不应再有本地 class 定义，而是从 cliShared 引用
    assert.ok(!codexSrc.includes('class AsyncQueue<'), '[FIXED] codex 已移除本地 AsyncQueue 定义')
    assert.ok(codexSrc.includes('new AsyncQueue'), '[FIXED] codex 仍在使用 AsyncQueue（从 cliShared 导入）')
  },
)

// ---------------------------------------------------------------------------
// TD-6: cliAdapter.ts provider ID 硬编码魔法字符串
// ---------------------------------------------------------------------------

await test(
  'TD-6 [FIXED] cliAdapter.ts 使用命名常量替代魔法字符串',
  () => {
    const source = readSrc('ai/models/cli/cliAdapter.ts')
    const sharedSrc = readSrc('ai/models/cli/cliShared.ts')

    // 共享模块应定义常量
    assert.ok(sharedSrc.includes('CODEX_CLI_PROVIDER_ID'), '[FIXED] cliShared 定义了 CODEX_CLI_PROVIDER_ID')
    assert.ok(sharedSrc.includes('CLAUDE_CODE_CLI_PROVIDER_ID'), '[FIXED] cliShared 定义了 CLAUDE_CODE_CLI_PROVIDER_ID')

    // cliAdapter 不应再有硬编码字符串
    const lines = source.split('\n').filter((l) => !l.trim().startsWith('//'))
    const codeLines = lines.join('\n')
    assert.ok(!codeLines.includes('"codex-cli"'), '[FIXED] "codex-cli" 已替换为常量')
    assert.ok(!codeLines.includes('"claude-code-cli"'), '[FIXED] "claude-code-cli" 已替换为常量')

    // 应从 cliShared 导入
    assert.ok(source.includes('CODEX_CLI_PROVIDER_ID'), '[FIXED] 使用命名常量')
  },
)

// ---------------------------------------------------------------------------
// TD-7: [FIXED] AgentManager God Object 拆分
// ---------------------------------------------------------------------------

await test(
  'TD-7 [FIXED] AgentManager God Object 已拆分为独立模块',
  () => {
    const managerSrc = readSrc('ai/services/agentManager.ts')
    const managerLines = managerSrc.split('\n').length

    // agentManager.ts 已瘦身（原 1107 行 → ≤ 450 行）
    console.log(`    [TD-7 detail] agentManager.ts 行数: ${managerLines}`)
    assert.ok(
      managerLines <= 520,
      `agentManager.ts 应 ≤ 520 行（实际 ${managerLines} 行），God Object 拆分未完成`,
    )

    // executeAgent 已提取到 agentExecutor.ts
    assert.ok(
      !managerSrc.includes('private async executeAgent('),
      'executeAgent 方法应已从 agentManager.ts 中移除',
    )
    const executorSrc = readSrc('ai/services/agentExecutor.ts')
    assert.ok(
      executorSrc.includes('async function executeAgent('),
      'executeAgent 应存在于 agentExecutor.ts 中',
    )

    // 验证其他拆分模块存在
    const modules = [
      'ai/services/agentOutputUtils.ts',
      'ai/services/agentHistory.ts',
      'ai/services/agentApprovalLoop.ts',
      'ai/services/agentRegistry.ts',
    ]
    for (const mod of modules) {
      assert.ok(
        existsSrc(mod),
        `拆分模块 ${mod} 应存在`,
      )
    }
  },
)

// ---------------------------------------------------------------------------
// TD-8: ChatStreamUseCase 空壳类（已修复）
// ---------------------------------------------------------------------------

await test(
  'TD-8 [已修复] ChatStreamUseCase 空壳类已删除，AiExecuteService 直接调用 runChatStream()',
  () => {
    const useCasePath = path.join(SERVER_SRC, 'ai/services/chat/ChatStreamUseCase.ts')
    assert.ok(
      !fs.existsSync(useCasePath),
      'TD-8 resolved: ChatStreamUseCase.ts 文件应已删除',
    )

    const executeSource = readSrc('ai/services/chat/AiExecuteService.ts')
    assert.ok(
      executeSource.includes('runChatStream('),
      'TD-8 resolved: AiExecuteService 应直接调用 runChatStream()',
    )
    assert.ok(
      !executeSource.includes('ChatStreamUseCase'),
      'TD-8 resolved: AiExecuteService 不应再引用 ChatStreamUseCase',
    )
  },
)

// ---------------------------------------------------------------------------
// TD-9: ai.ts DEPRECATED_MESSAGE 含 "vedio" 拼写错误
// ---------------------------------------------------------------------------

await test(
  'TD-9 [拼写错误] ai.ts DEPRECATED_MESSAGE 包含 "vedio" 而非正确的 "video"',
  () => {
    const source = readSrc('routers/ai.ts')

    // 确认 DEPRECATED_MESSAGE 常量存在
    assert.ok(
      source.includes('DEPRECATED_MESSAGE'),
      '期望 ai.ts 中定义了 DEPRECATED_MESSAGE 常量',
    )

    // 提取 DEPRECATED_MESSAGE 的值
    const match = source.match(/DEPRECATED_MESSAGE\s*=\s*["'`]([^"'`]+)["'`]/)
    assert.ok(match, '期望能提取 DEPRECATED_MESSAGE 的字符串值')

    const message = match![1]!
    console.log(`    [TD-9 detail] DEPRECATED_MESSAGE = "${message}"`)

    // [FIXED] 确认包含正确拼写 "video"
    assert.ok(
      message.includes('video'),
      `[FIXED] DEPRECATED_MESSAGE 现在包含正确拼写 "video"。当前值: "${message}"`,
    )

    // [FIXED] 确认不再包含错误拼写 "vedio"
    assert.ok(
      !message.includes('vedio'),
      '[FIXED] DEPRECATED_MESSAGE 不再包含拼写错误 "vedio"',
    )
  },
)

// ---------------------------------------------------------------------------
// 汇总结果
// ---------------------------------------------------------------------------

console.log('')
console.log('='.repeat(60))
console.log(`技术债验证结果：${passed} passed, ${failed} failed`)
console.log('='.repeat(60))

if (failures.length > 0) {
  console.log('\n失败详情：')
  for (const f of failures) {
    console.log(`  - ${f}`)
  }
}

if (failed > 0) {
  console.log(
    '\n注意：测试失败意味着对应技术债「已被修复」或源码结构已变化，请核实。',
  )
  process.exit(1)
}
