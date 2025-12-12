import { tool, zodSchema } from "ai";
import { z } from "zod";
import { notImplemented } from "./types";

/**
 * 获取当前时间（只读）
 * 说明：只先定义，不实现内部逻辑。
 */
export const timeNowTool = tool({
  description: "【system/read】获取当前服务器时间（ISO、unix 毫秒、时区）。",
  inputSchema: zodSchema(
    z.object({
      timezone: z.string().optional().describe("可选时区，例如 Asia/Shanghai"),
    }),
  ),
  execute: async (_input, _options) => notImplemented("read"),
});
