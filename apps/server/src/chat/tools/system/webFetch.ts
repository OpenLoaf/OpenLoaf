import { tool, zodSchema } from "ai";
import { z } from "zod";
import { notImplemented } from "./types";

/**
 * 抓取网页内容（只读）
 * 说明：只先定义，不实现内部逻辑（后续可补：仅 GET、大小/超时限制、SSRF 保护等）。
 */
export const webFetchTool = tool({
  description: "【system/read】通过 HTTP GET 抓取网页内容并返回纯文本。",
  inputSchema: zodSchema(
    z.object({
      url: z.string().describe("目标网页 URL（http/https）"),
    }),
  ),
  execute: async (_input, _options) => notImplemented("read"),
});
