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
  name: "Render Chart",
  description:
    "Render an ECharts chart inline in the message. See visualization-ops skill for usage.",
  parameters: z.object({
    title: z.string().optional(),
    option: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .describe("Full ECharts option (object or JSON string)."),
    height: z.number().int().positive().optional().describe("Pixels."),
  }),
  component: null,
} as const;
