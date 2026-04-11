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

export const scheduledTaskManageToolDef = {
  id: 'ScheduledTaskManage',
  readonly: false,
  name: '周期任务管理',
  description: `管理周期/定时任务的全生命周期。通过 action 参数选择操作：

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
      .describe('定时/周期执行的调度配置（仅 create 使用）。当用户提及未来时间点或周期（"明天8点"、"3小时后"、"每天9点"）时必须传入此参数，不传则立即执行。'),
    skipPlanConfirm: z
      .boolean()
      .optional()
      .default(true)
      .describe('是否跳过计划确认直接执行（默认 true，设为 false 启用两阶段计划确认）'),
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
  component: 'ScheduledTaskTool',
} as const

/**
 * Get scheduled task manage tool definition in specified language.
 * For now, always returns Chinese version.
 */
export function getScheduledTaskManageToolDef(lang?: string) {
  return scheduledTaskManageToolDef
}

export const scheduledTaskStatusToolDef = {
  id: 'ScheduledTaskStatus',
  readonly: true,
  name: '查询周期任务状态',
  description:
    '查询周期/定时任务的状态和进度。不传 taskId 返回所有活跃任务概览。',
  parameters: z.object({
    taskId: z
      .string()
      .optional()
      .describe('指定任务 ID，不传则返回所有活跃任务'),
  }),
  component: null,
} as const

export function getScheduledTaskStatusToolDef(lang?: string) {
  return scheduledTaskStatusToolDef
}

export const scheduledTaskWaitToolDef = {
  id: 'ScheduledTaskWait',
  readonly: true,
  name: '等待周期任务完成',
  description: `阻塞等待指定周期任务到达终态（done/failed/cancelled）或超时返回。仅用于立即执行的短时任务。

使用规则（铁律）：

- 用户要"立刻做某事"（跑脚本 / 生成报告 / 检查状态） → ScheduledTaskManage(create) 启动 → **ScheduledTaskWait** 等完成 → 根据结果告知用户
- 用户要"定时/周期执行"（每天 8 点 / 5 分钟后 / 每周一） → ScheduledTaskManage(create, schedule=...) → 直接回复"已安排" → end_turn。**禁止对定时任务调 ScheduledTaskWait**（会卡 turn）
- 禁止用 Bash sleep + ScheduledTaskStatus 循环轮询（浪费 token，这是反模式）

超时处理：
- 超时返回 status='timeout' + currentStatus，task 仍在后台运行
- 可决策 (a) 再调一次 ScheduledTaskWait 继续等；或 (b) 告诉用户"任务在后台执行，可在任务中心查看"并 end_turn

返回字段：
- status: done | failed | cancelled | timeout
- summary: 任务执行摘要（done 时）
- error: 失败原因（failed 时）
- currentStatus: 仍在运行时的当前状态（timeout 时）`,
  parameters: z.object({
    taskId: z.string().describe('要等待的任务 ID（由 ScheduledTaskManage(create) 返回）'),
    timeoutSec: z
      .number()
      .int()
      .min(5)
      .max(300)
      .default(60)
      .describe('最长等待秒数，默认 60，最大 300'),
  }),
  component: null,
} as const

export function getScheduledTaskWaitToolDef(lang?: string) {
  return scheduledTaskWaitToolDef
}

export const scheduledTaskToolMeta = {
  [scheduledTaskManageToolDef.id]: { riskType: RiskType.Write },
  [scheduledTaskStatusToolDef.id]: { riskType: RiskType.Read },
  [scheduledTaskWaitToolDef.id]: { riskType: RiskType.Read },
} as const
