import { tool, zodSchema } from "ai";
import {
  updatePlanToolDef,
  type UpdatePlanArgs,
} from "@tenas-ai/api/types/tools/runtime";
import { setPlanUpdate } from "@/ai/chat-stream/requestContext";

type UpdatePlanToolOutput = {
  /** Whether the tool execution succeeded. */
  ok: true;
  data: {
    /** Whether the plan payload was accepted. */
    updated: true;
  };
};

/**
 * Update the assistant plan for the current turn.
 */
export const updatePlanTool = tool({
  description: updatePlanToolDef.description,
  inputSchema: zodSchema(updatePlanToolDef.parameters),
  execute: async (input: UpdatePlanArgs): Promise<UpdatePlanToolOutput> => {
    // 逻辑：将最新 plan 缓存到请求上下文，等待 onFinish 时落库。
    setPlanUpdate(input);
    return { ok: true, data: { updated: true } };
  },
});
