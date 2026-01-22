import { z } from "zod";
import { RiskType } from "../toolResult";

export const timeNowToolDef = {
  id: "time-now",
  name: "当前时间",
  description:
    "获取当前服务器时间信息，包括格式化的时间字符串、Unix时间戳（毫秒）和时区。当需要了解当前时间或进行时间相关计算时调用此工具，可通过可选参数指定时区。",
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
