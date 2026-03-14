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
  id: 'board-query',
  name: '画布查询',
  description:
    '触发：当用户查询画布列表或获取某个画布详情时调用（"有哪些画布"、"列出画布"、"查看画布信息"）。用途：list 返回画布列表（支持按项目筛选），get 返回指定画布详情。返回：{ ok: true, data: { mode: "list", boards } | { mode: "get", board } }。不适用：需要创建/修改/删除画布时不要使用，改用 board-mutate。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的，例如：查看画布列表。'),
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
  id: 'board-mutate',
  name: '画布变更',
  description:
    '触发：当你需要创建、更新、删除、复制画布，或清除所有空画布时调用。用途：执行画布数据变更操作。返回：{ ok: true, data: { action, ... } }。action 选择：create 创建新画布，update 更新标题/置顶/关联项目，delete 软删除（可恢复），hard-delete 永久删除（含磁盘文件），duplicate 复制画布，clear-unbound 清除所有未关联项目的画布。不适用：仅需读取时不要使用，改用 board-query。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的，例如：创建新画布。'),
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
