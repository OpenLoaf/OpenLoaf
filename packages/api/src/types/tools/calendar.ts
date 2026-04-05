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

export const calendarQueryToolDef = {
  id: 'CalendarQuery',
  readonly: true,
  name: '日历查询',
  description:
    '触发：当用户**查询**日历日程（"今天/本周/这个月有什么日程/安排/会议"）时调用。仅用于读取/查询已有日程，不用于创建任务。不适用：用户说"帮我创建任务"/"创建一个任务"/"记一个任务"等创建意图时，改用 TaskManage；用户查询应用项目列表时，改用 ProjectQuery。用途：list-sources 返回所有日历源，list-items 返回指定时间范围内的日程事项。返回：{ ok: true, data: { mode, sources|items } }。',
  parameters: z.object({
    mode: z
      .enum(['list-sources', 'list-items'])
      .describe('查询模式：list-sources 返回日历源列表，list-items 返回日程/提醒列表'),
    rangeStart: z
      .string()
      .optional()
      .describe('时间范围起始（ISO 8601 字符串，list-items 时必填）'),
    rangeEnd: z
      .string()
      .optional()
      .describe('时间范围结束（ISO 8601 字符串，list-items 时必填）'),
    sourceIds: z
      .array(z.string())
      .optional()
      .describe('日历源 ID 列表（list-items 时可选，不传则查询所有源）'),
  }),
  component: null,
} as const

export const calendarMutateToolDef = {
  id: 'CalendarMutate',
  readonly: false,
  name: '日历变更',
  description:
    '触发：当你需要创建、更新、删除日程/任务/提醒事项/会议/约会，或切换任务/提醒完成状态时调用。用途：执行日历数据变更操作。返回：{ ok: true, data: { action, item|id } }。不适用：仅需读取时不要使用。action 选择：用户说"取消/撤销/删除"日程或提醒 → 使用 delete；用户说"完成/标记完成" → 使用 toggle-completed。',
  parameters: z.object({
    action: z
      .enum(['create', 'update', 'delete', 'toggle-completed'])
      .describe('变更类型：create/update/delete/toggle-completed'),
    itemId: z
      .string()
      .optional()
      .describe('日历项 ID（update/delete/toggle-completed 时必填）'),
    sourceId: z
      .string()
      .optional()
      .describe('日历源 ID（create 时必填，update 时可选）'),
    kind: z
      .enum(['event', 'reminder'])
      .optional()
      .describe('日历项类型：event（日程）或 reminder（提醒事项），create 时必填'),
    title: z.string().optional().describe('标题（create 时必填）'),
    description: z.string().nullable().optional().describe('描述（可选）'),
    location: z.string().nullable().optional().describe('地点（可选）'),
    startAt: z
      .string()
      .optional()
      .describe('开始时间（ISO 8601 字符串，create 时必填）'),
    endAt: z
      .string()
      .optional()
      .describe('结束时间（ISO 8601 字符串，create 时必填）'),
    allDay: z.boolean().optional().describe('是否全天事件（默认 false）'),
    completed: z
      .boolean()
      .optional()
      .describe('是否已完成（toggle-completed 时必填）'),
  }),
  needsApproval: true,
  component: null,
} as const

/**
 * Get calendar tools definitions in specified language.
 * Currently returns Chinese version. English translation can be added
 * by creating separate .en.ts variant in future iterations.
 */
export function getCalendarToolDefs(lang?: string) {
  // Currently all tools default to Chinese
  // Can be extended to support other languages: en-US, ja-JP, etc.
  return { calendarQueryToolDef, calendarMutateToolDef }
}
