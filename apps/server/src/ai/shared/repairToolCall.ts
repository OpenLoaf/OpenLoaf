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
import {
  TOOL_CATALOG_EXTENDED,
  getMcpCatalogEntries,
} from "@openloaf/api/types/tools/toolCatalog";
import { toolSearchToolDef } from "@openloaf/api/types/tools/toolSearch";

/** Check if a tool name exists in the combined (static + MCP) tool catalog. */
function isKnownDeferredTool(toolName: string): boolean {
  if (TOOL_CATALOG_EXTENDED.some((e) => e.id === toolName)) return true;
  return getMcpCatalogEntries().some((e) => e.id === toolName);
}

// ─── Circuit Breaker ─────────────────────────────────────────────────────────
// 防止同一工具+同一类错误反复触发修复（例如模型持续传入 timeoutMs: -1）。

const repairAttempts = new Map<string, { count: number; lastAt: number }>();
const MAX_REPAIR_ATTEMPTS = 3;
const REPAIR_WINDOW_MS = 60_000;

function trackRepairAttempt(toolName: string, errorMsg: string): number {
  // 将数字替换为占位符，合并同类错误消息。
  const key = `${toolName}:${errorMsg.replace(/\d+/g, "<n>").slice(0, 120)}`;
  const now = Date.now();
  const entry = repairAttempts.get(key);
  if (entry && now - entry.lastAt < REPAIR_WINDOW_MS) {
    entry.count++;
    entry.lastAt = now;
    return entry.count;
  }
  repairAttempts.set(key, { count: 1, lastAt: now });
  return 1;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** 从 Zod 验证错误中提取无效的顶层字段名。 */
function extractInvalidPaths(cause: unknown): string[] {
  if (!cause || typeof cause !== "object") return [];
  const issues = (cause as any).issues ?? (cause as any).errors;
  if (!Array.isArray(issues)) return [];
  const fields = new Set<string>();
  for (const issue of issues) {
    if (Array.isArray(issue.path) && typeof issue.path[0] === "string") {
      fields.add(issue.path[0]);
    }
  }
  return [...fields];
}

/**
 * Creates a repair function for tool calls.
 */
export function createToolCallRepair(): ToolCallRepairFunction<any> {
  return async ({ toolCall, tools, error, inputSchema }) => {
    if (NoSuchToolError.isInstance(error)) {
      // 如果目标工具是 deferred catalog 里的已知工具（只是还没通过 ToolSearch
      // 激活 schema），改写为 ToolSearch(names: "select:X") 让模型这一步先加载。
      // 熔断器在 tool-loop 层外兜底，避免死循环。
      if (
        isKnownDeferredTool(toolCall.toolName) &&
        tools &&
        toolSearchToolDef.id in tools
      ) {
        const attempts = trackRepairAttempt(
          toolCall.toolName,
          "deferred-not-loaded",
        );
        if (attempts >= MAX_REPAIR_ATTEMPTS) {
          logger.warn(
            { toolName: toolCall.toolName, attempts },
            "[tool-repair] circuit breaker: deferred tool repair exhausted, returning null",
          );
          return null;
        }
        logger.info(
          { toolCallId: toolCall.toolCallId, toolName: toolCall.toolName },
          "[tool-repair] rewriting deferred tool call to ToolSearch(select:...)",
        );
        return {
          ...toolCall,
          toolName: toolSearchToolDef.id,
          input: JSON.stringify({ names: `select:${toolCall.toolName}` }),
        };
      }
      logger.info(
        { toolCallId: toolCall.toolCallId, toolName: toolCall.toolName },
        "[tool-repair] tool not active and not in catalog; letting SDK report error to model",
      );
      return null;
    }

    if (!InvalidToolInputError.isInstance(error)) return null;

    // ── 熔断器检查 ──────────────────────────────────────────────────────
    const attempts = trackRepairAttempt(toolCall.toolName, error.message);
    if (attempts >= MAX_REPAIR_ATTEMPTS) {
      logger.warn(
        { toolName: toolCall.toolName, attempts },
        "[tool-repair] circuit breaker: too many repair attempts, returning null to let SDK report error to model",
      );
      return null;
    }

    // ── 尝试语义修复（剥离无效的可选字段）──────────────────────────────
    let inputObj: Record<string, unknown> | null = null;
    try {
      const raw = JSON.parse(toolCall.input);
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        inputObj = raw;
      }
    } catch {
      // JSON 损坏，走下面的 parsePartialJson 逻辑。
    }

    if (inputObj) {
      const schema = await inputSchema({ toolName: toolCall.toolName });
      const requiredFields = new Set<string>();
      if (schema && typeof schema === "object") {
        const req = (schema as any).required;
        if (Array.isArray(req)) {
          for (const r of req) {
            if (typeof r === "string") requiredFields.add(r);
          }
        }
      }

      const invalidPaths = extractInvalidPaths(error.cause);
      let modified = false;
      for (const fieldName of invalidPaths) {
        if (!requiredFields.has(fieldName) && fieldName in inputObj) {
          delete inputObj[fieldName];
          modified = true;
          logger.info(
            { toolName: toolCall.toolName, field: fieldName },
            "[tool-repair] stripped invalid optional field",
          );
        }
      }

      if (modified) {
        return { ...toolCall, input: JSON.stringify(inputObj) };
      }
    }

    // ── 回退：JSON 语法修复 ─────────────────────────────────────────────
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
