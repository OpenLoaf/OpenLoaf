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

/** Chart render tool definition. */
export const chartRenderToolDef = {
  id: "chart-render",
  name: "图表渲染",
  description: `触发：当你需要生成并展示图表时调用。用途：提交 ECharts option 并在消息中渲染图表。
参数说明：
- option: 完整的 ECharts option（支持对象或 JSON 字符串）
- title: 图表标题（可选）
- height: 图表高度（可选，像素）
输出：渲染所需的 option 与元信息。`,
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .optional()
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的。"),
    title: z.string().optional().describe("图表标题。"),
    option: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .describe("ECharts option（对象或 JSON 字符串）。"),
    height: z.number().int().positive().optional().describe("图表高度（像素）。"),
  }),
  component: null,
} as const;
