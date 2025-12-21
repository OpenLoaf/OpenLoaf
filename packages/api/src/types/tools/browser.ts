import { z } from "zod";

export const openUrlToolDef = {
  id: "open-url",
  description:
    "在应用内打开一个网页链接（浏览器面板）。适用于需要用户查看指定页面内容的场景。URL 可省略协议，服务端会做规范化处理（例如 example.com -> https://example.com）。",
  parameters: z.object({
    url: z.string().describe("要打开的 URL（允许不带协议）。"),
    title: z.string().optional().describe("可选：页面标题，用于 UI 展示。"),
  }),
  component: null,
} as const;

