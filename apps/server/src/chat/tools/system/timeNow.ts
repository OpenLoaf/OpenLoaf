import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { SystemToolResult } from "./types";

/**
 * 获取当前时间（只读）
 * - 用途：让模型在不猜测时间的情况下生成更贴近真实世界的回答/日志。
 * - 风险：read（无副作用）。
 */
export const timeNowTool = tool({
  description:
    "【system/read】获取当前服务器时间信息。返回 nowIso(UTC ISO)、unixMs、timezone。",
  inputSchema: zodSchema(
    z.object({
      timezone: z
        .string()
        .optional()
        .describe(
          "可选：时区名称（例如 Asia/Shanghai）。不传则使用当前系统时区。",
        ),
    }),
  ),
  execute: async (input, _options): Promise<
    SystemToolResult<{ nowIso: string; unixMs: number; timezone: string }>
  > => {
    const now = new Date();
    // 默认使用当前系统时区（MVP：仅回显时区，不做时区换算）。
    const systemTimezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      process.env.TZ ??
      "UTC";
    const timezone = input?.timezone ?? systemTimezone;

    return {
      ok: true,
      data: {
        nowIso: now.toISOString(),
        unixMs: now.getTime(),
        timezone,
      },
    };
  },
});
