import { tool, zodSchema } from "ai";
import { chartRenderToolDef } from "@tenas-ai/api/types/tools/chart";

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
