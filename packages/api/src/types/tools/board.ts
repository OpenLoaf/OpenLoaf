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
  name: '画布查询',
  description:
    'Read-only queries on canvas boards: `list` returns boards (filterable by project), `get` returns a board detail. For create/update/delete, use BoardMutate.',
  parameters: z.object({
    mode: z
      .enum(['list', 'get'])
      .optional()
      .describe('查询模式：list 返回画布列表，get 返回指定画布详情（默认 list）'),
    boardId: z
      .string()
      .optional()
      .describe('画布 ID（get 模式时必填）'),
    projectId: z
      .string()
      .optional()
      .describe('项目 ID（list 模式可选，按项目筛选画布）'),
    search: z
      .string()
      .optional()
      .describe('搜索关键词（list 模式可选，按标题模糊搜索）'),
    unboundOnly: z
      .boolean()
      .optional()
      .describe('是否仅列出未关联项目的画布（list 模式可选）'),
  }),
  component: null,
} as const

export const boardMutateToolDef = {
  id: 'BoardMutate',
  readonly: false,
  name: '画布变更',
  description:
    'Mutates canvas boards: `create` / `update` (title/pin/project binding) / `delete` (soft, recoverable) / `hard-delete` (permanent, removes disk files) / `duplicate` / `clear-unbound` (remove all boards not linked to a project). For read-only queries, use BoardQuery.',
  parameters: z.object({
    action: z
      .enum(['create', 'update', 'delete', 'hard-delete', 'duplicate', 'clear-unbound'])
      .describe('变更类型：create/update/delete/hard-delete/duplicate/clear-unbound'),
    boardId: z
      .string()
      .optional()
      .describe('画布 ID（update/delete/hard-delete/duplicate 时必填）'),
    title: z
      .string()
      .optional()
      .describe('画布标题（create/update 时可选）'),
    projectId: z
      .string()
      .optional()
      .describe('关联项目 ID（create/update/duplicate 时可选）'),
    isPin: z
      .boolean()
      .optional()
      .describe('是否置顶（update 时可选）'),
  }),
  needsApproval: true,
  component: null,
} as const
