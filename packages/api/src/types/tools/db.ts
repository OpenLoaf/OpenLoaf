/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";

export const projectQueryToolDef = {
  id: "ProjectQuery",
  readonly: true,
  name: "项目查询",
  description:
    "Read-only queries on projects: `list` returns the project tree + flat list, `get` returns a single project summary. Errors if `get` is called without `projectId` and no current-project context.",
  parameters: z.object({
    mode: z
      .enum(["list", "get"])
      .optional()
      .describe("查询模式：list 返回项目树，get 返回指定项目"),
    projectId: z
      .string()
      .optional()
      .describe("项目 ID（get 模式可选，默认使用当前上下文项目）"),
  }),
  component: null,
} as const;

export const projectMutateToolDef = {
  id: "ProjectMutate",
  readonly: false,
  name: "项目变更",
  description:
    "Mutates the project tree: `create` / `update` / `move` / `remove`. Note: `remove` only unlinks from the list — it does NOT delete files on disk. For read-only queries, use ProjectQuery.",
  parameters: z.object({
    action: z
      .enum(["create", "update", "move", "remove"])
      .describe("变更类型：create/update/move/remove"),
    projectId: z
      .string()
      .optional()
      .describe("项目 ID（update/move/remove 可选，默认使用当前上下文项目）"),
    title: z.string().nullable().optional().describe("项目标题（可选）"),
    folderName: z.string().nullable().optional().describe("项目目录名称（可选）"),
    icon: z.string().nullable().optional().describe("项目图标（可选）"),
    rootUri: z
      .string()
      .optional()
      .describe("项目根目录 URI（file://...，创建时可指定）"),
    parentProjectId: z
      .string()
      .optional()
      .describe("父项目 ID（create 时可选，指定后创建为子项目）"),
    createAsChild: z
      .boolean()
      .optional()
      .describe("create 时未传 parentProjectId 且为 true，则使用当前上下文项目作为父项目"),
    enableVersionControl: z
      .boolean()
      .optional()
      .describe("是否启用项目版本控制（create 时生效，默认开启）"),
    targetParentProjectId: z
      .string()
      .nullable()
      .optional()
      .describe("move 时目标父项目 ID（null 表示移动到根项目）"),
    targetSiblingProjectId: z
      .string()
      .nullable()
      .optional()
      .describe("move 时目标兄弟项目 ID（用于在同一父项目内排序）"),
    targetPosition: z
      .enum(["before", "after"])
      .optional()
      .describe("move 时相对目标兄弟项目的插入位置"),
  }),
  needsApproval: true,
  component: null,
} as const;
