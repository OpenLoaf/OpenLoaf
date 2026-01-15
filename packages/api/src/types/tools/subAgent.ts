import { z } from "zod";

/** Browser sub-agent display name. */
export const browserSubAgentName = "BrowserSubAgent" as const;
/** Allowed sub-agent names. */
export const subAgentNames = [browserSubAgentName] as const;

/** Sub-agent tool definition. */
export const subAgentToolDef = {
  id: "sub-agent",
  description:
    "创建一个子Agent处理指定任务，并将执行过程与结果流式返回。适用于需要拆分任务、并行探索或执行长步骤的场景。当前仅支持 BrowserSubAgent。",
  parameters: z.object({
    name: z.enum(subAgentNames).describe("子Agent名称（当前仅支持 BrowserSubAgent）。"),
    task: z.string().describe("子Agent需要执行的任务描述。"),
  }),
  component: null,
} as const;
