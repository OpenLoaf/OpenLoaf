import { z } from "zod";

/** Project intro payload used in project.json. */
const projectIntroSchema = z
  .object({
    kind: z.string(),
    targetId: z.string(),
    component: z.string().optional(),
    pageType: z.string().optional(),
  })
  .passthrough()
  .optional();

export const projectListToolDef = {
  id: "project-list",
  description:
    "扫描 workspaceRootUri 下的 .teatime/project.json，返回项目列表及 rootUri。当需要查看所有可用项目或选择特定项目进行操作时调用此工具。",
  parameters: z.object({}),
  component: null,
} as const;

export const projectGetToolDef = {
  id: "project-get",
  description:
    "根据项目 rootUri 读取 .teatime/project.json 的配置。当需要查看特定项目的详细内容或修改项目前获取当前状态时调用此工具。",
  parameters: z.object({
    rootUri: z
      .string()
      .describe("项目根目录 URI（file://...，目录内含 .teatime/project.json）"),
  }),
  component: null,
} as const;

export const projectCreateToolDef = {
  id: "project-create",
  description:
    "在指定 rootUri 创建 .teatime/project.json（文件系统为真）。当需要添加新的项目时调用此工具。",
  parameters: z.object({
    rootUri: z
      .string()
      .describe("项目根目录 URI（file://...，将写入 .teatime/project.json）"),
    projectId: z.string().describe("项目 ID（写入 project.json）"),
    title: z.string().nullable().optional().describe("项目标题（可选）"),
    icon: z.string().nullable().optional().describe("项目图标（可选）"),
    intro: projectIntroSchema,
  }),
  needsApproval: true,
  component: null,
} as const;

export const projectUpdateToolDef = {
  id: "project-update",
  description:
    "根据项目 rootUri 更新 .teatime/project.json 的属性。当需要修改现有项目的信息时调用此工具。",
  parameters: z.object({
    rootUri: z
      .string()
      .describe("项目根目录 URI（file://...，目录内含 .teatime/project.json）"),
    title: z.string().nullable().optional().describe("项目标题（可选）"),
    icon: z.string().nullable().optional().describe("项目图标（可选）"),
    intro: projectIntroSchema,
  }),
  component: null,
} as const;
