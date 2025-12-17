import { z } from "zod";

const MAX_TASK_CHARS = 6000;

export const subAgentToolDef = {
  id: "sub-agent",
  description:
    "调用一个子 Agent 来完成特定任务，并把子 Agent 的流式输出合并到当前对话中。适合需要专业化处理的场景（例如浏览器检索与网页总结）。",
  parameters: z.object({
    name: z.string().describe("子 Agent 名称，例如：browser"),
    task: z
      .string()
      .min(1)
      .max(MAX_TASK_CHARS)
      .describe("交给子 Agent 执行的任务描述（尽量包含必要上下文）"),
  }),
  component: null,
} as const;
