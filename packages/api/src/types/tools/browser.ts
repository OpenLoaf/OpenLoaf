import { z } from "zod";

export const openUrlToolDef = {
  id: "open-url",
  name: "打开网页",
  description:
    "在应用内打开一个网页链接（浏览器面板）。适用于需要用户查看指定页面内容的场景。URL 可省略协议，服务端会做规范化处理（例如 example.com -> https://example.com）。",
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：打开指定网页。"),
    url: z.string().describe("要打开的 URL（允许不带协议）。"),
    title: z.string().optional().describe("可选：页面标题，用于 UI 展示。"),
    timeoutSec: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("可选：等待前端执行完成的超时秒数，默认 60 秒。"),
  }),
  component: null,
} as const;
