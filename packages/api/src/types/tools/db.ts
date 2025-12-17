import { z } from "zod";

export const projectListToolDef = {
  description:
    "获取当前工作空间下的项目列表，仅返回项目维度的数据，忽略非项目类型的记录。当需要查看所有可用项目或选择特定项目进行操作时调用此工具。",
  parameters: z.object({}),
  component: null,
};

export const projectGetToolDef = {
  description:
    "根据项目ID获取单个项目的详细信息，包括项目的基本属性和关联资源。当需要查看特定项目的详细内容或修改项目前获取当前状态时调用此工具。",
  parameters: z.object({ id: z.string() }),
  component: null,
};

export const projectCreateToolDef = {
  description:
    "创建一个新的项目，允许设置项目的标题、图标、封面和展开状态。当需要添加新的项目时调用此工具。",
  parameters: z.object({
    title: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    cover: z.string().nullable().optional(),
    isExpanded: z.boolean().optional(),
  }),
  needsApproval: true,
  component: null,
};

export const projectUpdateToolDef = {
  description:
    "根据项目ID更新项目的属性，包括标题、图标、封面和展开状态。当需要修改现有项目的信息时调用此工具。",
  parameters: z.object({
    id: z.string(),
    title: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    cover: z.string().nullable().optional(),
    isExpanded: z.boolean().optional(),
  }),
  component: null,
};