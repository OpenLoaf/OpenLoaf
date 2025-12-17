import { fileReadTool } from "./fileRead";
import { shellDestructiveTool, shellReadonlyTool, shellWriteTool } from "./shell";
import { timeNowTool } from "./timeNow";
import { webFetchTool } from "./webFetch";
import { webSearchTool } from "./webSearch";
import type { RiskType } from "@teatime-ai/api/types/toolResult";

/**
 * System Tools（MVP）
 * 说明：只提供工具“定义”，内部逻辑暂不实现。
 */
export const systemTools = {
  time_now: timeNowTool,
  web_fetch: webFetchTool,
  web_search: webSearchTool,
  file_read: fileReadTool,
  shell_readonly: shellReadonlyTool,
  shell_write: shellWriteTool,
  shell_destructive: shellDestructiveTool,
};

/**
 * System Tool 元信息（MVP）
 * 说明：当前安装的 AI SDK v6 beta 的 Tool 类型没有 `metadata` 字段；
 * 因此将 riskType 以独立映射表形式维护（后续用于 UI 展示/审计/HITL）。
 */
export const systemToolMeta: Record<keyof typeof systemTools, { riskType: RiskType }> =
  {
    time_now: { riskType: "read" },
    web_fetch: { riskType: "read" },
    web_search: { riskType: "read" },
    file_read: { riskType: "read" },
    shell_readonly: { riskType: "read" },
    shell_write: { riskType: "write" },
    shell_destructive: { riskType: "destructive" },
  };
