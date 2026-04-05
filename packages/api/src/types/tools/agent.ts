/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from 'zod'

export const agentToolDef = {
  id: 'Agent',
  readonly: false,
  name: '子代理',
  description:
    'Launches a sub-agent to handle complex multi-step tasks in an isolated LLM session, protecting the main conversation\'s context window from intermediate results. Defaults to synchronous (`run_in_background=false`) and returns the full result. Async mode returns the agent_id immediately — use SendMessage to push further instructions.\n'
    + '\n'
    + 'Built-in subagent types: `general-purpose` (default, full toolset), `explore` (read-only codebase exploration), `plan` (read-only implementation design). You may also pass custom agent names defined in the project.\n'
    + '\n'
    + 'Rules:\n'
    + '- Launch multiple independent sub-agents IN PARALLEL (multiple Agent calls in one reply) for efficiency.\n'
    + '- Do NOT spawn a sub-agent for 1-2 tool-call tasks you can do directly.\n'
    + '- Sub-agents cannot spawn further sub-agents (nesting depth = 1), max concurrency = 4.\n'
    + '- Do NOT launch a sub-agent of the same type as yourself.',
  parameters: z.object({
    description: z
      .string()
      .min(1)
      .describe('简短描述（3-5 个词），概括子代理将做什么。'),
    prompt: z
      .string()
      .min(1)
      .describe('子代理要执行的任务描述。提供清晰、详细的提示以便子代理能自主工作并返回你所需的信息。'),
    subagent_type: z
      .string()
      .optional()
      .describe('子代理类型。不指定时默认为 general-purpose。'),
    model: z
      .string()
      .optional()
      .describe('模型覆盖。指定子代理使用的模型标识符。'),
    run_in_background: z
      .boolean()
      .optional()
      .describe('是否异步运行。默认 false（同步等待结果）。设为 true 时立即返回 agent_id。'),
    task_id: z
      .string()
      .optional()
      .describe('可选的 Runtime Task ID。传入后，此子代理执行期间将自动关联该 task，task 状态随子代理生命周期自动更新（in_progress → completed/failed），owner 自动设为子代理。'),
  }),
  component: null,
} as const

export const sendMessageToolDef = {
  id: 'SendMessage',
  readonly: false,
  name: '发送消息',
  description:
    '向子代理发送消息或恢复已停止的代理。如果代理已停止或已完成，将自动恢复执行。返回：{submission_id: string}。',
  parameters: z.object({
    to: z.string().min(1).describe('目标子代理 ID。'),
    message: z.string().min(1).describe('要发送的消息内容。'),
  }),
  component: null,
} as const
