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
    'Read-only queries on calendar data: list-sources returns calendar sources, list-items returns events/reminders in a time range. Use when the user asks "what do I have today/this week/this month". For creating/updating/deleting events, use CalendarMutate. For creating TODO tasks, use ScheduledTaskManage.',
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
    'Creates, updates, deletes calendar events/reminders, or toggles completion state. Action mapping: user says "cancel/remove/delete" → `delete`; user says "done/complete/mark done" → `toggle-completed`. For read-only queries, use CalendarQuery.',
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
