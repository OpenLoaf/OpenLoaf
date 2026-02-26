/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { z } from "zod";
import { RiskType } from "../toolResult";

export const timeNowToolDef = {
  id: "time-now",
  name: "当前时间",
  description:
    '触发：当你需要获取当前服务器时间以做时间计算/对齐时调用。用途：返回当前时间与时区信息，可选按指定时区解析。返回：{ ok: true, data: { iso, unixMs, timeZone, year, month, day, hour, minute, second, dayOfWeek, dayOfWeekZh, localFormatted } }；其中 dayOfWeek/dayOfWeekZh 为中英文星期，localFormatted 为中文完整日期时间字符串，直接使用即可无需自行推算。时区非法会报错。不适用：时间无关或可直接推断时不要使用。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：获取当前系统时间。"),
    timezone: z
      .string()
      .optional()
      .describe(
        "可选：时区名称（例如 Asia/Shanghai）。不传则使用当前系统时区。",
      ),
  }),
  component: null,
} as const;

/**
 * System Tool 风险分级（统一在 api 包内维护，供 server/web 共用）
 * - 说明：AI SDK v6 beta 的 Tool 类型没有 `metadata` 字段，因此用映射表维护。
 */
export const systemToolMeta = {
  [timeNowToolDef.id]: { riskType: RiskType.Read },
} as const;
