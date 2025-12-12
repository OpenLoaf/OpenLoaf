import { tool, zodSchema } from "ai";
import { z } from "zod";
import { notImplemented } from "./types";

/**
 * 搜索（只读）
 * 说明：只先定义，不实现内部逻辑（后续可接入具体 provider）。
 */
export const webSearchTool = tool({
  description: "【system/read】在互联网上搜索内容并返回结果列表。",
  inputSchema: zodSchema(
    z.object({
      query: z.string().describe("搜索关键词"),
      limit: z.number().int().min(1).max(20).optional().describe("返回条数上限"),
    }),
  ),
  execute: async (_input, _options) => notImplemented("read"),
});
