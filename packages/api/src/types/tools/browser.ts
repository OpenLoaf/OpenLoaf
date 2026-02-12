import { z } from "zod";

export const openUrlToolDef = {
  id: "open-url",
  name: "打开网页",
  description:
    "触发：当你需要在应用内浏览器打开页面，让用户查看或继续操作（如登录、确认页面内容）时调用。用途：打开指定 URL（可省略协议）并等待前端回执。返回：前端回执对象 { toolCallId, status: success|failed|timeout, output?, errorText?, requestedAt }。不适用：不要用它抓取网页内容或自动化操作；要提取/操作页面请用 browser-* 工具。",
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
