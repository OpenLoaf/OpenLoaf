import { z } from "zod";

// 定义工作空间基础类型
export const workspaceBase = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["local", "cloud"] as const),
  isActive: z.boolean(),
});

// 导出TypeScript类型
export type Workspace = z.infer<typeof workspaceBase>;
