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
 * 异步 Agent 协作测试 — 共享 fixtures / 测试数据。
 *
 * 被 Layer 1-5 测试文件共同引用。
 */

// ---------------------------------------------------------------------------
// SubAgentEvent 类型定义（设计合约）
// ---------------------------------------------------------------------------

export type SubAgentEventType = 'sub-agent-complete' | 'sub-agent-failed'

export type SubAgentEvent = {
  type: SubAgentEventType
  agentId: string
  sessionId: string
  agentName: string
  result?: unknown
  error?: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// TaskReport 写入 JSONL 的消息格式
// ---------------------------------------------------------------------------

export type TaskReportMessage = {
  id: string
  parentMessageId: string | null
  role: 'task-report'
  messageKind: 'normal'
  parts: Array<{ type: 'text'; text: string }>
  metadata: {
    agentId: string
    agentName: string
    status: 'completed' | 'failed'
    reportType: 'sub-agent-result'
  }
  createdAt: string
}

// ---------------------------------------------------------------------------
// 测试场景 fixtures
// ---------------------------------------------------------------------------

/** 应触发 spawn 的复杂任务 prompts */
export const COMPLEX_TASK_PROMPTS = [
  '帮我分析 src/ai/services/ 目录下所有 TypeScript 文件的代码结构，总结每个模块的职责、依赖关系、以及潜在的重构点。',
  '帮我调研一下当前项目的测试覆盖情况，包括单元测试、集成测试、E2E 测试的分布，找出覆盖不足的模块。',
  '帮我重构 utils/dateHelper.ts，把所有 moment.js 调用替换为 dayjs。',
  '帮我设计一个新的通知模块，需要支持邮件、WebSocket、桌面弹窗三种渠道。',
  '帮我完成以下 3 个任务：1) 更新 package.json 的依赖 2) 修复 CI 配置 3) 添加 lint 规则。',
] as const

/** 不应触发 spawn 的简单任务 prompts */
export const SIMPLE_TASK_PROMPTS = [
  '现在几点了？',
  '读一下 README.md 的内容',
  '帮我创建一个任务：下午三点开会',
  '查看最近的邮件',
  '你好',
  '什么是 TypeScript？',
] as const

/** Master spawn 后的预期确认词 */
export const SPAWN_CONFIRMATION_PATTERNS = [
  /已安排/,
  /已分配/,
  /已派/,
  /已委托/,
  /已指派/,
  /子代理/,
  /子 ?[Aa]gent/,
  /后台.*执行/,
  /将为你/,
  /会为你/,
] as const

/** 模拟 task-report 数据 */
export const MOCK_TASK_REPORTS = {
  codeAnalysis: {
    agentId: 'agent_code_001',
    agentName: 'coder',
    status: 'completed' as const,
    summary: '代码分析完成：共 15 个文件，3 个需要重构，2 个有循环依赖。',
    detail: {
      files: 15,
      refactorNeeded: 3,
      circularDeps: 2,
    },
  },
  testCoverage: {
    agentId: 'agent_test_002',
    agentName: 'explore',
    status: 'completed' as const,
    summary: '测试覆盖调研完成：单元测试 72%，集成测试 45%，E2E 23%。建议优先补充集成测试。',
    detail: {
      unitCoverage: 72,
      integrationCoverage: 45,
      e2eCoverage: 23,
    },
  },
  shellError: {
    agentId: 'agent_shell_003',
    agentName: 'shell',
    status: 'failed' as const,
    error: 'Agent completed without producing any output or tool results after retry.',
  },
  permissionError: {
    agentId: 'agent_perm_004',
    agentName: 'shell',
    status: 'failed' as const,
    error: '文件权限不足，无法读取目标目录。',
  },
} as const

/** 不同 LLM 供应商的测试配置（用于 Promptfoo 多模型对比） */
export const MULTI_MODEL_CONFIGS = [
  {
    label: 'GPT-4o',
    provider: 'openai',
    modelId: 'gpt-4o',
    description: 'OpenAI 旗舰模型',
  },
  {
    label: 'Claude Sonnet',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    description: 'Anthropic 旗舰模型',
  },
  {
    label: 'DeepSeek V3',
    provider: 'deepseek',
    modelId: 'deepseek-chat',
    description: 'DeepSeek 对话模型',
  },
  {
    label: 'Qwen3.5',
    provider: 'qwen',
    modelId: 'qwen3.5-flash',
    description: '通义千问 3.5',
  },
] as const
