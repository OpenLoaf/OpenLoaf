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
 * ToolSearch Rehydrate — 回归测试。
 *
 * 复现问题：
 * 1. AI 调用 ToolSearch 加载了 MemorySave 和 MemorySearch
 * 2. AI 调用 MemorySave，触发 needsApproval，流中断等待用户审批
 * 3. 用户批准后，新请求创建了全新 ActivatedToolSet，之前激活的工具丢失
 * 4. Activation Guard 拦截 MemorySave，报错 "Tool has not been loaded"
 *
 * 修复方案：从消息历史中的 ToolSearch 结果回放激活状态。
 *
 * 用法：
 *   pnpm run test:tool:rehydrate
 */
import {
  printSection,
  printPass,
  printFail,
} from './helpers/printUtils'
import { ActivatedToolSet } from '@/ai/tools/toolSearchState'

// ---------------------------------------------------------------------------
// 辅助：构造包含 ToolSearch 结果的消息历史（模拟 UIMessage 格式）
// ---------------------------------------------------------------------------

function makeToolSearchResultPart(toolIds: string[]) {
  return {
    type: 'tool-tool-search',
    toolCallId: `call_${Date.now()}`,
    toolName: 'ToolSearch',
    state: 'output-available',
    output: {
      tools: toolIds.map((id) => ({
        id,
        name: id,
        description: `Mock tool ${id}`,
      })),
      notFound: [],
      message: `Loaded ${toolIds.length} tool(s): ${toolIds.join(', ')}. You can now call them directly.`,
    },
  }
}

function makeApprovalRequestedPart(toolId: string, toolCallId: string) {
  return {
    type: `tool-${toolId}`,
    toolCallId,
    toolName: toolId,
    state: 'approval-requested',
    input: { key: 'test', content: 'test content' },
  }
}

function makeFakeMessages(toolSearchToolIds: string[], approvalToolId?: string, approvalToolCallId?: string) {
  const parts: any[] = []

  // ToolSearch 结果
  parts.push(makeToolSearchResultPart(toolSearchToolIds))

  // MemorySearch 成功结果
  if (toolSearchToolIds.includes('MemorySearch')) {
    parts.push({
      type: 'tool-memory-search',
      toolCallId: `call_search_${Date.now()}`,
      toolName: 'MemorySearch',
      state: 'output-available',
      output: { ok: true, results: [] },
    })
  }

  // approval-requested 部分
  if (approvalToolId && approvalToolCallId) {
    parts.push(makeApprovalRequestedPart(approvalToolId, approvalToolCallId))
  }

  return [
    {
      id: 'msg-user',
      role: 'user',
      parts: [{ type: 'text', text: '我不爱吃生番茄' }],
    },
    {
      id: 'msg-assistant',
      role: 'assistant',
      parts,
    },
  ]
}

// ---------------------------------------------------------------------------
// 提取 ToolSearch 结果中已激活的工具 ID（与修复代码逻辑一致）
// ---------------------------------------------------------------------------

function extractActivatedToolIdsFromMessages(messages: any[]): string[] {
  const ids: string[] = []
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    const parts = Array.isArray(msg.parts) ? msg.parts : []
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue
      const toolName = (part as any).toolName
      const state = (part as any).state
      const output = (part as any).output
      if (toolName === 'ToolSearch' && state === 'output-available' && output?.tools) {
        for (const t of output.tools) {
          if (typeof t?.id === 'string') ids.push(t.id)
        }
      }
    }
  }
  return ids
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

async function main() {
  const start = Date.now()
  let passed = 0
  let failed = 0

  const CORE_TOOL_IDS = ['ToolSearch', 'LoadSkill'] as const

  // ── Test 1: 复现 BUG — 新建 ActivatedToolSet 丢失动态激活状态 ──
  printSection('Test 1: 复现 BUG — 新 ActivatedToolSet 丢失动态工具')

  try {
    // 模拟第一次请求：ToolSearch 激活了 MemorySearch 和 MemorySave
    const set1 = new ActivatedToolSet(CORE_TOOL_IDS)
    set1.activate(['MemorySearch', 'MemorySave'])

    // 验证第一次请求中工具已激活
    if (!set1.isActive('MemorySave')) throw new Error('第一次请求中 MemorySave 应该已激活')
    if (!set1.isActive('MemorySearch')) throw new Error('第一次请求中 MemorySearch 应该已激活')
    console.log('  第一次请求 activeTools:', set1.getActiveToolIds())

    // 模拟审批流：创建全新的 ActivatedToolSet（这是 bug 的根源）
    const set2 = new ActivatedToolSet(CORE_TOOL_IDS)
    console.log('  第二次请求 activeTools:', set2.getActiveToolIds())

    // ★ 这就是 bug：MemorySave 在新 set 中不存在
    const lostMemorySave = !set2.isActive('MemorySave')
    const lostMemorySearch = !set2.isActive('MemorySearch')

    if (!lostMemorySave || !lostMemorySearch) {
      throw new Error('预期工具丢失，但它们意外存在 — bug 已被修复或测试有误')
    }

    console.log('  确认：MemorySave 已丢失 =', lostMemorySave)
    console.log('  确认：MemorySearch 已丢失 =', lostMemorySearch)
    printPass('成功复现 BUG — 新 ActivatedToolSet 丢失了动态工具')
    passed++
  } catch (err) {
    printFail('复现 BUG', err)
    failed++
  }

  // ── Test 2: 从消息历史提取已激活工具 ID ──
  printSection('Test 2: 从消息历史提取 ToolSearch 结果中的工具 ID')

  try {
    const messages = makeFakeMessages(
      ['MemorySearch', 'MemorySave'],
      'MemorySave',
      'call_YCgnxT7bVh7NIdyWFSD4AXUW',
    )

    const extracted = extractActivatedToolIdsFromMessages(messages)
    console.log('  提取到的工具 ID:', extracted)

    if (extracted.length !== 2) {
      throw new Error(`预期提取 2 个工具 ID，实际 ${extracted.length}`)
    }
    if (!extracted.includes('MemorySearch')) {
      throw new Error('缺少 MemorySearch')
    }
    if (!extracted.includes('MemorySave')) {
      throw new Error('缺少 MemorySave')
    }

    printPass('从消息历史成功提取工具 ID')
    passed++
  } catch (err) {
    printFail('提取工具 ID', err)
    failed++
  }

  // ── Test 3: rehydrateFromMessages 修复验证 ──
  printSection('Test 3: rehydrateFromMessages 恢复动态工具激活状态')

  try {
    const messages = makeFakeMessages(
      ['MemorySearch', 'MemorySave'],
      'MemorySave',
      'call_YCgnxT7bVh7NIdyWFSD4AXUW',
    )

    // 模拟修复后的流程：新建 ActivatedToolSet + rehydrate
    const set = new ActivatedToolSet(CORE_TOOL_IDS)

    // ★ 这是修复的核心：从消息历史回放激活状态
    const rehydratedIds = extractActivatedToolIdsFromMessages(messages)
    set.activate(rehydratedIds)

    console.log('  rehydrate 后 activeTools:', set.getActiveToolIds())

    if (!set.isActive('MemorySave')) {
      throw new Error('rehydrate 后 MemorySave 应该已激活')
    }
    if (!set.isActive('MemorySearch')) {
      throw new Error('rehydrate 后 MemorySearch 应该已激活')
    }
    if (!set.isActive('ToolSearch')) {
      throw new Error('core tool ToolSearch 应始终激活')
    }
    if (!set.isActive('LoadSkill')) {
      throw new Error('core tool LoadSkill 应始终激活')
    }

    printPass('rehydrateFromMessages 成功恢复工具激活状态')
    passed++
  } catch (err) {
    printFail('rehydrateFromMessages', err)
    failed++
  }

  // ── Test 4: 多轮 ToolSearch 调用的累积恢复 ──
  printSection('Test 4: 多轮 ToolSearch 调用的累积恢复')

  try {
    // 模拟：第一轮加载 memory 工具，第二轮加载 file 工具
    const messages = [
      {
        id: 'msg-user-1',
        role: 'user',
        parts: [{ type: 'text', text: '第一轮' }],
      },
      {
        id: 'msg-assistant-1',
        role: 'assistant',
        parts: [
          makeToolSearchResultPart(['MemorySearch', 'MemorySave']),
        ],
      },
      {
        id: 'msg-user-2',
        role: 'user',
        parts: [{ type: 'text', text: '第二轮' }],
      },
      {
        id: 'msg-assistant-2',
        role: 'assistant',
        parts: [
          makeToolSearchResultPart(['read-file', 'list-dir']),
        ],
      },
    ]

    const extracted = extractActivatedToolIdsFromMessages(messages)
    console.log('  多轮提取到的工具 ID:', extracted)

    const set = new ActivatedToolSet(CORE_TOOL_IDS)
    set.activate(extracted)

    const expected = ['MemorySearch', 'MemorySave', 'read-file', 'list-dir']
    for (const id of expected) {
      if (!set.isActive(id)) {
        throw new Error(`多轮累积后 ${id} 应该已激活`)
      }
    }

    console.log('  activeTools:', set.getActiveToolIds())
    printPass('多轮 ToolSearch 累积恢复正确')
    passed++
  } catch (err) {
    printFail('多轮累积恢复', err)
    failed++
  }

  // ── Test 5: 验证 ActivatedToolSet.rehydrateFromMessages 方法（修复后应存在） ──
  printSection('Test 5: ActivatedToolSet.rehydrateFromMessages 静态方法')

  try {
    const messages = makeFakeMessages(['MemorySearch', 'MemorySave'])

    // 检查是否存在 rehydrateFromMessages 静态方法
    if (typeof (ActivatedToolSet as any).rehydrateFromMessages !== 'function') {
      throw new Error(
        'ActivatedToolSet.rehydrateFromMessages 方法不存在 — 需要实现修复'
      )
    }

    const set = new ActivatedToolSet(CORE_TOOL_IDS)
    ;(ActivatedToolSet as any).rehydrateFromMessages(set, messages)

    if (!set.isActive('MemorySave')) {
      throw new Error('rehydrateFromMessages 后 MemorySave 应已激活')
    }
    if (!set.isActive('MemorySearch')) {
      throw new Error('rehydrateFromMessages 后 MemorySearch 应已激活')
    }

    printPass('ActivatedToolSet.rehydrateFromMessages 方法正常工作')
    passed++
  } catch (err) {
    printFail('ActivatedToolSet.rehydrateFromMessages', err)
    failed++
  }

  // ── Test 6: 存储格式（无 toolName，仅有 type 字段）的 rehydration ──
  printSection('Test 6: 存储格式（无 toolName）rehydration')

  try {
    // 模拟真实 JSONL 存储格式：type="tool-tool-search"，无 toolName 字段
    const storedFormatMessages = [
      {
        id: 'msg-user',
        role: 'user',
        parts: [{ type: 'text', text: '测试' }],
      },
      {
        id: 'msg-assistant',
        role: 'assistant',
        parts: [
          {
            type: 'tool-tool-search',
            toolCallId: `call_stored_${Date.now()}`,
            // 注意：故意不包含 toolName 字段，模拟真实存储格式
            state: 'output-available',
            output: {
              tools: [
                { id: 'shell-command', name: 'Shell 命令', description: 'mock' },
                { id: 'read-file', name: '读取文件', description: 'mock' },
              ],
              notFound: [],
              message: 'Loaded 2 tool(s): shell-command, read-file.',
            },
          },
        ],
      },
    ]

    const set = new ActivatedToolSet(CORE_TOOL_IDS)
    ActivatedToolSet.rehydrateFromMessages(set, storedFormatMessages)

    if (!set.isActive('shell-command')) {
      throw new Error('存储格式 rehydrate 后 shell-command 应已激活')
    }
    if (!set.isActive('read-file')) {
      throw new Error('存储格式 rehydrate 后 read-file 应已激活')
    }

    console.log('  activeTools:', set.getActiveToolIds())
    printPass('存储格式（无 toolName）rehydration 正确')
    passed++
  } catch (err) {
    printFail('存储格式 rehydration', err)
    failed++
  }

  // ── 汇总 ──
  printSection('Summary')
  const ms = Date.now() - start
  console.log(`  duration: ${ms}ms`)
  console.log(`  ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
