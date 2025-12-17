import { fileReadTool } from "./fileRead";
import { shellDestructiveTool, shellReadonlyTool, shellWriteTool } from "./shell";
import { timeNowTool } from "./timeNow";
import { webFetchTool } from "./webFetch";
import { webSearchTool } from "./webSearch";
import type { RiskType } from "@teatime-ai/api/types/toolResult";
import {
  fileReadToolDef,
  shellDestructiveToolDef,
  shellReadonlyToolDef,
  shellWriteToolDef,
  timeNowToolDef,
  webFetchToolDef,
  webSearchToolDef,
} from "@teatime-ai/api/types/tools/system";

/**
 * System Tools（MVP）
 * 说明：只提供工具“定义”，内部逻辑暂不实现。
 */
export const systemTools = {
  [timeNowToolDef.id]: timeNowTool,
  [webFetchToolDef.id]: webFetchTool,
  [webSearchToolDef.id]: webSearchTool,
  [fileReadToolDef.id]: fileReadTool,
  [shellReadonlyToolDef.id]: shellReadonlyTool,
  [shellWriteToolDef.id]: shellWriteTool,
  [shellDestructiveToolDef.id]: shellDestructiveTool,
} as const;

/**
 * System Tool 元信息（MVP）
 * 说明：当前安装的 AI SDK v6 beta 的 Tool 类型没有 `metadata` 字段；
 * 因此将 riskType 以独立映射表形式维护（后续用于 UI 展示/审计/HITL）。
 */
export const systemToolMeta = {
  [timeNowToolDef.id]: { riskType: "read" },
  [webFetchToolDef.id]: { riskType: "read" },
  [webSearchToolDef.id]: { riskType: "read" },
  [fileReadToolDef.id]: { riskType: "read" },
  [shellReadonlyToolDef.id]: { riskType: "read" },
  [shellWriteToolDef.id]: { riskType: "write" },
  [shellDestructiveToolDef.id]: { riskType: "destructive" },
} satisfies Record<keyof typeof systemTools, { riskType: RiskType }>;
