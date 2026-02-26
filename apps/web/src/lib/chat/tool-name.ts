/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { testApprovalToolDef } from "@openloaf/api/types/tools/approvalTest";
import { openUrlToolDef } from "@openloaf/api/types/tools/browser";
import {
  browserActToolDef,
  browserExtractToolDef,
  browserObserveToolDef,
  browserSnapshotToolDef,
  browserWaitToolDef,
} from "@openloaf/api/types/tools/browserAutomation";
import { projectMutateToolDef, projectQueryToolDef } from "@openloaf/api/types/tools/db";
import {
  execCommandToolDef,
  grepFilesToolDef,
  listDirToolDef,
  readFileToolDef,
  applyPatchToolDef,
  shellCommandToolDef,
  shellToolDef,
  updatePlanToolDef,
  writeStdinToolDef,
} from "@openloaf/api/types/tools/runtime";
import { jsxCreateToolDef } from "@openloaf/api/types/tools/jsxCreate";
import { chartRenderToolDef } from "@openloaf/api/types/tools/chart";
import {
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  abortAgentToolDef,
} from "@openloaf/api/types/tools/agent";
import { timeNowToolDef } from "@openloaf/api/types/tools/system";

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
  execCommandToolDef,
  grepFilesToolDef,
  listDirToolDef,
  openUrlToolDef,
  projectQueryToolDef,
  projectMutateToolDef,
  readFileToolDef,
  applyPatchToolDef,
  shellCommandToolDef,
  shellToolDef,
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  abortAgentToolDef,
  testApprovalToolDef,
  timeNowToolDef,
  updatePlanToolDef,
  writeStdinToolDef,
  jsxCreateToolDef,
  chartRenderToolDef,
];

/** Tool id to display name map. */
export const TOOL_NAME_BY_ID = TOOL_DEFS.reduce<Record<string, string>>((acc, def) => {
  acc[def.id] = def.name ?? def.id;
  return acc;
}, {});

// 兼容旧工具 id，保持显示为 JSX 创建。
TOOL_NAME_BY_ID["jsx-preview"] = TOOL_NAME_BY_ID[jsxCreateToolDef.id] ?? "JSX 创建";

/** Resolve a display name for tool parts shown in the UI. */
export function resolveToolDisplayName(target: ToolNameTarget): string {
  // 名称解析仅根据 tool 定义与消息字段，不涉及审批逻辑。
  if (target.title) return target.title;
  if (target.toolName) return TOOL_NAME_BY_ID[target.toolName] ?? target.toolName;
  if (target.type?.startsWith("tool-")) {
    const toolId = target.type.slice("tool-".length);
    return TOOL_NAME_BY_ID[toolId] ?? toolId;
  }
  if (target.type) return target.type;
  return "工具";
}
