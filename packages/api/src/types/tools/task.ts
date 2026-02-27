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
    '创建后台任务。不传 schedule 则立即执行一次（适用于多步骤开发、重构等）；传 schedule 则按时间调度自动执行（定时/周期/cron）。',
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
    schedule: z
      .object({
        type: z
          .enum(['once', 'interval', 'cron'])
          .describe(
            '调度类型。once=在指定时间执行一次；interval=每隔固定毫秒重复；cron=按 cron 表达式周期执行',
          ),
        scheduleAt: z
          .string()
          .optional()
          .describe('once 类型必填，ISO 8601 时间字符串，如 "2025-03-01T09:00:00+08:00"'),
        intervalMs: z
          .number()
          .optional()
          .describe(
            'interval 类型必填，执行间隔毫秒数，最小 60000（1分钟）。例：300000=5分钟，3600000=1小时',
          ),
        cronExpr: z
          .string()
          .optional()
          .describe(
            'cron 类型必填，5 段 cron 表达式（分 时 日 月 周）。例："*/5 * * * *"=每5分钟，"0 9 * * 1-5"=工作日9点',
          ),
        timezone: z
          .string()
          .optional()
          .describe('时区，如 "Asia/Shanghai"，不传使用系统默认'),
      })
      .optional()
      .describe('定时/周期执行的调度配置。不传则任务立即执行一次'),
    skipPlanConfirm: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否跳过计划确认直接执行（仅一次性任务有效）'),
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
