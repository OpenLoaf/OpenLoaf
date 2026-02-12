import { tool, zodSchema } from "ai";
import { jsonRenderToolDef } from "@tenas-ai/api/types/tools/jsonRender";
import { consumeToolApprovalPayload } from "@/ai/shared/context/requestContext";

type JsonRenderToolOutput = Record<string, unknown> | null;

/**
 * Json render approval tool (MVP).
 */
export const jsonRenderTool = tool({
  description: jsonRenderToolDef.description,
  inputSchema: zodSchema(jsonRenderToolDef.parameters),
  needsApproval: ({ mode }) => mode !== "display",
  execute: async (input, options): Promise<JsonRenderToolOutput> => {
    const mode = input?.mode ?? "approve";
    if (mode === "display") return null;
    const toolCallId = options.toolCallId;
    if (!toolCallId) throw new Error("toolCallId is required.");
    const payload = consumeToolApprovalPayload(toolCallId);
    if (!payload) throw new Error("tool approval payload is missing.");
    return payload;
  },
});
