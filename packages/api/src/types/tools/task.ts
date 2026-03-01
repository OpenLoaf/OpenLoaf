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

export const taskManageToolDef = {
  id: 'task-manage',
  name: '任务管理',
  description: `管理后台任务的全生命周期。通过 action 参数选择操作：

- create: 创建任务。不传 schedule 则立即执行；传 schedule 则按时间调度。
- cancel: 取消任务（todo/running/review → cancelled）。
- delete: 删除任务（仅允许 done/cancelled 状态）。活跃任务须先 cancel。
- run: 启动待办任务（todo → running）。
- resolve: 处理审批任务（review → done/todo/cancelled），需传 resolveAction。
- archive: 归档已完成任务（done → 归档）。
- cancelAll: 批量取消所有活跃任务（todo/running/review → cancelled）。
- deleteAll: 批量删除已终结任务（仅 done/cancelled），不会删除活跃任务。
- archiveAll: 批量归档所有已完成任务。

状态保护规则：delete/deleteAll 仅允许 done 和 cancelled 状态的任务。`,
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的。'),
    action: z
      .enum([
        'create',
        'cancel',
        'delete',
        'run',
        'resolve',
        'archive',
        'cancelAll',
        'deleteAll',
        'archiveAll',
      ])
      .describe('要执行的操作类型'),
    // create 参数
    title: z
      .string()
      .optional()
      .describe('任务摘要（create 时必填）'),
    description: z.string().optional().describe('任务详细描述'),
    priority: z
      .enum(['urgent', 'high', 'medium', 'low'])
      .optional()
      .default('medium')
      .describe('任务优先级'),
    schedule: z
      .object({
        type: z
          .enum(['once', 'interval', 'cron'])
          .describe('调度类型'),
        scheduleAt: z
          .string()
          .optional()
          .describe('once 类型必填，ISO 8601 时间字符串'),
        intervalMs: z
          .number()
          .optional()
          .describe('interval 类型必填，执行间隔毫秒数，最小 60000'),
        cronExpr: z
          .string()
          .optional()
          .describe('cron 类型必填，5 段 cron 表达式'),
        timezone: z
          .string()
          .optional()
          .describe('时区，不传使用系统默认'),
      })
      .optional()
      .describe('定时/周期执行的调度配置（仅 create 使用）'),
    skipPlanConfirm: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否跳过计划确认直接执行（仅 create 一次性任务有效）'),
    agentName: z
      .string()
      .optional()
      .describe('指定执行的 Agent 名称'),
    // 单任务操作参数
    taskId: z
      .string()
      .optional()
      .describe('任务 ID（cancel/delete/run/resolve/archive 时必填）'),
    // resolve 参数
    resolveAction: z
      .enum(['approve', 'reject', 'rework'])
      .optional()
      .describe('审批动作（resolve 时必填）'),
    reason: z
      .string()
      .optional()
      .describe('操作原因说明（cancel/resolve 可选）'),
    // batch 参数
    statusFilter: z
      .array(z.enum(['todo', 'running', 'review', 'done', 'cancelled']))
      .optional()
      .describe('批量操作的状态过滤（deleteAll 会强制限定为 done/cancelled）'),
  }),
  component: 'TaskTool',
} as const

/**
 * @deprecated 使用 taskManageToolDef 替代。保留用于向后兼容。
 */
export const createTaskToolDef = {
  ...taskManageToolDef,
  id: 'create-task',
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
  [taskManageToolDef.id]: { riskType: RiskType.Write },
  [createTaskToolDef.id]: { riskType: RiskType.Write },
  [taskStatusToolDef.id]: { riskType: RiskType.Read },
} as const
