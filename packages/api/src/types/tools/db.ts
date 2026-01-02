import { z } from "zod";

export const projectListToolDef = {
  id: "project-list",
  description:
    "读取当前 workspace 配置中的 projects 映射，返回项目列表及 rootUri。当需要查看所有可用项目或选择特定项目进行操作时调用此工具。",
  parameters: z.object({}),
  component: null,
} as const;

export const projectGetToolDef = {
  id: "project-get",
  description:
    "根据 projectId 读取项目根目录下的 .teatime/project.json 配置。当需要查看特定项目的详细内容或修改项目前获取当前状态时调用此工具。",
  parameters: z.object({
    projectId: z.string().describe("项目 ID（用于定位 projects 映射）"),
  }),
  component: null,
} as const;

export const projectCreateToolDef = {
  id: "project-create",
  description:
    "在指定 rootUri（可选）创建 .teatime/project.json 并登记到 workspace 配置。当需要添加新的项目时调用此工具。",
  parameters: z.object({
    rootUri: z
      .string()
      .optional()
      .describe("项目根目录 URI（file://...，将写入 .teatime/project.json）"),
    title: z.string().nullable().optional().describe("项目标题（可选）"),
    icon: z.string().nullable().optional().describe("项目图标（可选）"),
  }),
  needsApproval: true,
  component: null,
} as const;

export const projectUpdateToolDef = {
  id: "project-update",
  description:
    "根据 projectId 更新 .teatime/project.json 的属性。当需要修改现有项目的信息时调用此工具。",
  parameters: z.object({
    projectId: z.string().describe("项目 ID（用于定位 projects 映射）"),
    title: z.string().nullable().optional().describe("项目标题（可选）"),
    icon: z.string().nullable().optional().describe("项目图标（可选）"),
  }),
  component: null,
} as const;
