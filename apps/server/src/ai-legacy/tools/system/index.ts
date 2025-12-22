import { fileReadTool } from "./fileRead";
import { shellDestructiveTool, shellReadonlyTool, shellWriteTool } from "./shell";
import { timeNowTool } from "./timeNow";
import { webFetchTool } from "./webFetch";
import { webSearchTool } from "./webSearch";
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
  // [webFetchToolDef.id]: webFetchTool,
  // [webSearchToolDef.id]: webSearchTool,
  [fileReadToolDef.id]: fileReadTool,
  [shellReadonlyToolDef.id]: shellReadonlyTool,
  [shellWriteToolDef.id]: shellWriteTool,
  [shellDestructiveToolDef.id]: shellDestructiveTool,
} as const;
