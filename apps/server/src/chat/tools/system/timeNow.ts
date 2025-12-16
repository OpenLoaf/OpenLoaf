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
    "【system/read】获取当前服务器时间信息。返回 now(字符串时间)、unixMs、timezone。",
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
    SystemToolResult<{ now: string; unixMs: number; timezone: string }>
  > => {
    const now = new Date();
    // 默认使用当前系统时区（MVP：仅回显时区，不做时区换算）。
    const systemTimezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      process.env.TZ ??
      "UTC";
    const requestedTimezone = input?.timezone ?? systemTimezone;

    const formatNow = (timeZone: string) => {
      const parts = new Intl.DateTimeFormat("sv-SE", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(now);
      const pick = (type: string) =>
        parts.find((p) => p.type === type)?.value ?? "";
      return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}:${pick("second")}`;
    };

    let timezone = requestedTimezone;
    let nowString: string;
    try {
      nowString = formatNow(timezone);
    } catch {
      timezone = systemTimezone;
      nowString = formatNow(timezone);
    }

    return {
      ok: true,
      data: {
        now: nowString,
        unixMs: now.getTime(),
        timezone,
      },
    };
  },
});
