/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { tool, zodSchema } from "ai";
import { chartRenderToolDef } from "@openloaf/api/types/tools/chart";

/** Chart tool output payload. */
type ChartToolOutput = { ok: true };

/** Chart render tool. */
export const chartRenderTool = tool({
  description: chartRenderToolDef.description,
  inputSchema: zodSchema(chartRenderToolDef.parameters),
  execute: async (input): Promise<ChartToolOutput> => {
    return { ok: true };
  },
});
