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
  name: 'Query Calendar',
  description:
    'Read-only queries on calendar sources and events/reminders in a time range. See calendar-ops skill for usage.',
  parameters: z.object({
    mode: z.enum(['list-sources', 'list-items']),
    rangeStart: z
      .string()
      .optional()
      .describe('ISO 8601, required for list-items.'),
    rangeEnd: z
      .string()
      .optional()
      .describe('ISO 8601, required for list-items.'),
    sourceIds: z
      .array(z.string())
      .optional()
      .describe('Omit for all (list-items).'),
  }),
  component: null,
} as const

export const calendarMutateToolDef = {
  id: 'CalendarMutate',
  readonly: false,
  name: 'Mutate Calendar',
  description:
    'Create / update / delete calendar events/reminders or toggle completion. See calendar-ops skill for usage.',
  parameters: z.object({
    action: z.enum(['create', 'update', 'delete', 'toggle-completed']),
    itemId: z
      .string()
      .optional()
      .describe('Required for update/delete/toggle-completed.'),
    sourceId: z.string().optional().describe('Required for create.'),
    kind: z
      .enum(['event', 'reminder'])
      .optional()
      .describe('Required for create.'),
    title: z.string().optional().describe('Required for create.'),
    description: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    startAt: z
      .string()
      .optional()
      .describe('ISO 8601, required for create.'),
    endAt: z
      .string()
      .optional()
      .describe('ISO 8601, required for create.'),
    allDay: z.boolean().optional().describe('Default false.'),
    completed: z
      .boolean()
      .optional()
      .describe('Required for toggle-completed.'),
  }),
  needsApproval: true,
  component: null,
} as const

