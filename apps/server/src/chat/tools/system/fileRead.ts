import { tool, zodSchema } from "ai";
import { z } from "zod";
import { notImplemented } from "./types";

/**
 * 读取文件（只读）
 * 说明：只先定义，不实现内部逻辑（后续可加：目录白名单、大小限制等）。
 */
export const fileReadTool = tool({
  description: "【system/read】读取服务器允许范围内的文件内容。",
  inputSchema: zodSchema(
    z.object({
      path: z.string().describe("文件路径（受允许范围限制）"),
    }),
  ),
  execute: async (_input, _options) => notImplemented("read"),
});
