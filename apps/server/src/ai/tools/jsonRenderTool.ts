import { tool, zodSchema } from "ai";
import { jsonRenderToolDef } from "@tenas-ai/api/types/tools/jsonRender";

/**
 * Json render display tool (display-only, no approval).
 */
export const jsonRenderTool = tool({
  description: jsonRenderToolDef.description,
  inputSchema: zodSchema(jsonRenderToolDef.parameters),
  execute: async (): Promise<null> => {
    return null;
  },
});
