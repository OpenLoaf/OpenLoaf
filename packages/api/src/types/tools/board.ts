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

export const boardQueryToolDef = {
  id: 'BoardQuery',
  readonly: true,
  name: 'Query Board',
  description:
    'Read-only queries on canvas boards: list or get. See canvas-ops skill for usage.',
  parameters: z.object({
    mode: z.enum(['list', 'get']).optional().describe('Default list.'),
    boardId: z.string().optional().describe('Required for get.'),
    projectId: z.string().optional().describe('Filter by project (list).'),
    search: z.string().optional().describe('Fuzzy-match board title (list).'),
    unboundOnly: z
      .boolean()
      .optional()
      .describe('Only boards not linked to any project (list).'),
  }),
  component: null,
} as const

export const boardMutateToolDef = {
  id: 'BoardMutate',
  readonly: false,
  name: 'Mutate Board',
  description:
    'Create / update / delete / duplicate canvas boards. See canvas-ops skill for usage.',
  parameters: z.object({
    action: z.enum(['create', 'update', 'delete', 'hard-delete', 'duplicate', 'clear-unbound']),
    boardId: z
      .string()
      .optional()
      .describe('Required for update/delete/hard-delete/duplicate.'),
    title: z.string().optional().describe('For create/update.'),
    projectId: z.string().optional().describe('For create/update/duplicate.'),
    isPin: z.boolean().optional().describe('For update.'),
  }),
  needsApproval: true,
  component: null,
} as const
