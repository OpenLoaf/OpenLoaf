import { z } from "zod";

export const projectQueryToolDef = {
  id: "project-query",
  name: "项目查询",
  description:
    "触发：当你需要读取项目列表/树或某个项目摘要信息时调用。用途：list 返回项目树与扁平列表，get 返回项目摘要。返回：{ ok: true, data: { mode: 'list', projects, tree } | { mode: 'get', project } }；若缺少 projectId 且无上下文会报错。",
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：查看项目列表。"),
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
  id: "project-mutate",
  name: "项目变更",
  description:
    "触发：当你需要创建、更新、移动或移除项目时调用（会改变项目树/元信息）。用途：执行项目变更（remove 仅从列表移除，不删除磁盘）。返回：{ ok: true, data: { action: 'create'|'update'|'move'|'remove', ... } }，包含项目摘要或移动信息；权限/参数不合法会报错。不适用：仅需读取时不要使用。",
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：创建新项目。"),
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
