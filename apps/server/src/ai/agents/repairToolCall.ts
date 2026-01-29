import { InvalidToolInputError, parsePartialJson, type ToolCallRepairFunction } from "ai";
import { logger } from "@/common/logger";

/**
 * Creates a repair function for tool calls.
 */
export function createToolCallRepair(): ToolCallRepairFunction<any> {
  return async ({ toolCall, error, inputSchema }) => {
    if (!InvalidToolInputError.isInstance(error)) return null;
    await inputSchema({ toolName: toolCall.toolName });
    // 逻辑：尝试用内置 JSON 修复逻辑解析工具参数，避免再次调用模型。
    logger.warn(
      {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        inputLength: toolCall.input.length,
      },
      "[tool-repair] invalid tool input detected, attempting JSON repair",
    );
    const parsed = await parsePartialJson(toolCall.input);
    if (parsed.state === "successful-parse" || parsed.state === "repaired-parse") {
      const value = parsed.value;
      const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
      if (!isObject) {
        logger.warn(
          {
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            state: parsed.state,
            valueType: Array.isArray(value) ? "array" : typeof value,
          },
          "[tool-repair] repaired JSON is not an object; skipping",
        );
        return null;
      }
      logger.info(
        {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          state: parsed.state,
        },
        "[tool-repair] JSON repair success",
      );
      return {
        ...toolCall,
        input: JSON.stringify(value),
      };
    }
    logger.warn(
      {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        state: parsed.state,
      },
      "[tool-repair] JSON repair failed",
    );
    return null;
  };
}
