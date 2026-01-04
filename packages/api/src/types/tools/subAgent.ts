import { z } from "zod";

export const subAgentToolDef = {
  id: "sub-agent",
  description:
    "创建一个子Agent处理指定任务，并将执行过程与结果流式返回。适用于需要拆分任务、并行探索或执行长步骤的场景。",
  parameters: z.object({
    name: z.string().describe("子Agent名称（用于区分角色/任务）。"),
    task: z.string().describe("子Agent需要执行的任务描述。"),
  }),
  component: null,
} as const;
