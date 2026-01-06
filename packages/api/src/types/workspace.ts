import { z } from "zod";

// 定义工作空间基础类型
export const workspaceBase = z.object({
  id: z.string().describe("Workspace id."),
  name: z.string().describe("Workspace display name."),
  type: z.enum(["local", "cloud"] as const).describe("Workspace type."),
  isActive: z.boolean().describe("Whether the workspace is active."),
  rootUri: z.string().describe("Workspace root URI (file://...)."),
  projects: z
    .record(z.string(), z.string())
    .optional()
    .describe("Workspace project map: { projectId: rootUri }."),
});

// 导出TypeScript类型
export type Workspace = z.infer<typeof workspaceBase>;
