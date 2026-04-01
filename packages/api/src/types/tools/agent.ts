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
  name: '子代理',
  description:
    '启动一个新的子代理来处理复杂的多步骤任务。\n'
    + '\n'
    + '子代理在独立的 LLM 会话中运行，保护主对话的上下文窗口不被大量中间结果淹没。\n'
    + '默认同步等待子代理执行完成并返回结果（run_in_background=false），无需额外等待。\n'
    + '异步模式（run_in_background=true）下立即返回 agent_id，可通过 SendMessage 向子代理发送后续指令。\n'
    + '\n'
    + '可用子代理类型：\n'
    + '- general-purpose: 通用子代理（默认值，不传 subagent_type 时使用）。用于执行复杂多步骤任务，包括文件操作、Shell 命令、Web 浏览、代码开发等。拥有完整工具发现能力（tool-search）。当你需要搜索代码或执行多步操作且不确定能在几次尝试内完成时，使用此类型。（工具：全部）\n'
    + '- explore: 代码库探索专用（只读）。用于快速按模式查找文件、搜索关键词或回答关于代码库的问题。（工具：read-file, list-dir, grep-files, project-query）\n'
    + '- plan: 架构方案设计专用（只读）。用于设计实现策略、识别关键文件、评估架构权衡。（工具：read-file, list-dir, grep-files, project-query）\n'
    + '\n'
    + '你也可以传入项目中定义的自定义 Agent 名称作为 subagent_type。\n'
    + '\n'
    + '使用注意：\n'
    + '- 尽可能并行启动多个独立的子代理以提高效率；要做到这一点，在一次回复中同时调用多个 Agent\n'
    + '- 简单任务不需要子代理 — 1-2 个工具调用能完成的事情直接做\n'
    + '- 子代理不能再创建子代理（嵌套深度上限为 1），最大并发为 4\n'
    + '- 不要启动和自己同类型的子代理\n'
    + '- 同步模式返回：{status, output, error, agent_id}\n'
    + '- 异步模式返回：{agent_id, status: "async_launched"}',
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
  }),
  component: null,
} as const

export const sendMessageToolDef = {
  id: 'SendMessage',
  name: '发送消息',
  description:
    '向子代理发送消息或恢复已停止的代理。如果代理已停止或已完成，将自动恢复执行。返回：{submission_id: string}。',
  parameters: z.object({
    to: z.string().min(1).describe('目标子代理 ID。'),
    message: z.string().min(1).describe('要发送的消息内容。'),
  }),
  component: null,
} as const
