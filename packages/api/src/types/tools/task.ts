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
import { RiskType } from '../toolResult'

export const createTaskToolDef = {
  id: 'create-task',
  name: '创建后台任务',
  description:
    '当用户请求涉及多步骤开发工作时使用。创建后台自主执行的任务，系统自动规划和执行。创建后用户可以继续聊其他事情。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的。'),
    title: z.string().min(1).describe('任务摘要（简洁描述做什么）'),
    description: z.string().optional().describe('任务详细描述（需求、背景、验收标准）'),
    priority: z
      .enum(['urgent', 'high', 'medium', 'low'])
      .optional()
      .default('medium')
      .describe('任务优先级'),
    autoExecute: z
      .boolean()
      .optional()
      .default(true)
      .describe('是否立即开始执行'),
    skipPlanConfirm: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否跳过计划确认直接执行'),
    agentName: z
      .string()
      .optional()
      .describe('指定执行的 Agent 名称，不传默认用主 Agent'),
  }),
  component: 'TaskTool',
} as const

export const taskStatusToolDef = {
  id: 'task-status',
  name: '查询任务状态',
  description:
    '查询后台任务的状态和进度。不传 taskId 返回所有活跃任务概览。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的。'),
    taskId: z
      .string()
      .optional()
      .describe('指定任务 ID，不传则返回所有活跃任务'),
  }),
  component: null,
} as const

export const taskToolMeta = {
  [createTaskToolDef.id]: { riskType: RiskType.Write },
  [taskStatusToolDef.id]: { riskType: RiskType.Read },
} as const
