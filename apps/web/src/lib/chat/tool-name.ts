"use client";

import { testApprovalToolDef } from "@tenas-ai/api/types/tools/approvalTest";
import { openUrlToolDef } from "@tenas-ai/api/types/tools/browser";
import {
  browserActToolDef,
  browserExtractToolDef,
  browserObserveToolDef,
  browserSnapshotToolDef,
  browserWaitToolDef,
} from "@tenas-ai/api/types/tools/browserAutomation";
import {
  projectCreateToolDef,
  projectGetToolDef,
  projectListToolDef,
  projectUpdateToolDef,
} from "@tenas-ai/api/types/tools/db";
import {
  execCommandToolDefUnix,
  execCommandToolDefWin,
  grepFilesToolDef,
  listDirToolDef,
  readFileToolDef,
  shellCommandToolDefUnix,
  shellCommandToolDefWin,
  shellToolDefUnix,
  shellToolDefWin,
  updatePlanToolDef,
  writeStdinToolDefUnix,
  writeStdinToolDefWin,
} from "@tenas-ai/api/types/tools/runtime";
import { subAgentToolDef } from "@tenas-ai/api/types/tools/subAgent";
import { timeNowToolDef } from "@tenas-ai/api/types/tools/system";

type ToolNameTarget = {
  /** Tool title override. */
  title?: string;
  /** Tool name from message part. */
  toolName?: string;
  /** Tool part type. */
  type?: string;
};

type ToolNameSource = {
  /** Tool id. */
  id: string;
  /** Tool display name. */
  name?: string;
};

/** Tool definition list used to build display map. */
const TOOL_DEFS: ToolNameSource[] = [
  browserActToolDef,
  browserExtractToolDef,
  browserObserveToolDef,
  browserSnapshotToolDef,
  browserWaitToolDef,
  execCommandToolDefUnix,
  execCommandToolDefWin,
  grepFilesToolDef,
  listDirToolDef,
  openUrlToolDef,
  projectCreateToolDef,
  projectGetToolDef,
  projectListToolDef,
  projectUpdateToolDef,
  readFileToolDef,
  shellCommandToolDefUnix,
  shellCommandToolDefWin,
  shellToolDefUnix,
  shellToolDefWin,
  subAgentToolDef,
  testApprovalToolDef,
  timeNowToolDef,
  updatePlanToolDef,
  writeStdinToolDefUnix,
  writeStdinToolDefWin,
];

/** Tool id to display name map. */
export const TOOL_NAME_BY_ID = TOOL_DEFS.reduce<Record<string, string>>((acc, def) => {
  acc[def.id] = def.name ?? def.id;
  return acc;
}, {});

/** Resolve a display name for tool parts shown in the UI. */
export function resolveToolDisplayName(target: ToolNameTarget): string {
  // 中文注释：名称解析仅根据 tool 定义与消息字段，不涉及审批逻辑。
  if (target.title) return target.title;
  if (target.toolName) return TOOL_NAME_BY_ID[target.toolName] ?? target.toolName;
  if (target.type?.startsWith("tool-")) {
    const toolId = target.type.slice("tool-".length);
    return TOOL_NAME_BY_ID[toolId] ?? toolId;
  }
  if (target.type) return target.type;
  return "工具";
}
