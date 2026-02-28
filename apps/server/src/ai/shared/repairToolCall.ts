/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { InvalidToolInputError, NoSuchToolError, parsePartialJson, type ToolCallRepairFunction } from "ai";
import { logger } from "@/common/logger";
import { suggestToolName } from "@/ai/tools/toolRegistry";

/**
 * Creates a repair function for tool calls.
 */
export function createToolCallRepair(): ToolCallRepairFunction<any> {
  return async ({ toolCall, tools, error, inputSchema }) => {
    // 逻辑：工具名不存在时，检查别名表并自动修正为正确名称。
    if (NoSuchToolError.isInstance(error)) {
      const suggestion = suggestToolName(toolCall.toolName);
      if (suggestion) {
        // 提取规范名称（从 "Did you mean 'xxx'?" 中）
        const match = suggestion.match(/'([^']+)'/)
        const canonical = match?.[1]
        if (canonical && tools[canonical]) {
          logger.info(
            { toolCallId: toolCall.toolCallId, from: toolCall.toolName, to: canonical },
            "[tool-repair] tool name alias resolved",
          );
          return { ...toolCall, toolName: canonical };
        }
      }
      return null;
    }

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
