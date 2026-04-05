/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";

/** Chart render tool definition. */
export const chartRenderToolDef = {
  id: "ChartRender",
  readonly: true,
  name: "图表渲染",
  description: `Renders an ECharts chart inline in the message. Pass a complete ECharts \`option\` (object or JSON string); optional \`title\` and \`height\` control the display.`,
  parameters: z.object({
    title: z.string().optional().describe("图表标题。"),
    option: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .describe("ECharts option（对象或 JSON 字符串）。"),
    height: z.number().int().positive().optional().describe("图表高度（像素）。"),
  }),
  component: null,
} as const;
