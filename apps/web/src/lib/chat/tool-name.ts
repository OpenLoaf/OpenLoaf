/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import i18next from "i18next";
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
  grepFilesToolDef,
  listDirToolDef,
  readFileToolDef,
  applyPatchToolDef,
  shellCommandToolDef,
  updatePlanToolDef,
} from "@openloaf/api/types/tools/runtime";
import { jsxCreateToolDef } from "@openloaf/api/types/tools/jsxCreate";
import { chartRenderToolDef } from "@openloaf/api/types/tools/chart";
import { videoDownloadToolDef } from "@openloaf/api/types/tools/videoDownload";
import { webFetchToolDef } from "@openloaf/api/types/tools/webFetch";
import {
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  abortAgentToolDef,
} from "@openloaf/api/types/tools/agent";

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
  grepFilesToolDef,
  listDirToolDef,
  openUrlToolDef,
  projectQueryToolDef,
  projectMutateToolDef,
  readFileToolDef,
  applyPatchToolDef,
  shellCommandToolDef,
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  abortAgentToolDef,
  updatePlanToolDef,
  jsxCreateToolDef,
  chartRenderToolDef,
  videoDownloadToolDef,
  webFetchToolDef,
];

/** Tool id to display name map. */
export const TOOL_NAME_BY_ID = TOOL_DEFS.reduce<Record<string, string>>((acc, def) => {
  acc[def.id] = def.name ?? def.id;
  return acc;
}, {});

// 兼容旧工具 id，保持显示为 JSX 创建。
TOOL_NAME_BY_ID["jsx-preview"] = TOOL_NAME_BY_ID[jsxCreateToolDef.id] ?? "JSX 创建";

/** Resolve a translated display name for a tool id. */
function getTranslatedName(toolId: string): string {
  const translated = i18next.t(`toolNames.${toolId}`, { ns: "ai", defaultValue: "" });
  return translated || TOOL_NAME_BY_ID[toolId] || toolId;
}

/** Resolve a display name for tool parts shown in the UI. */
export function resolveToolDisplayName(target: ToolNameTarget): string {
  // 名称解析仅根据 tool 定义与消息字段，不涉及审批逻辑。
  if (target.title) return target.title;
  if (target.toolName) return getTranslatedName(target.toolName);
  if (target.type?.startsWith("tool-")) {
    const toolId = target.type.slice("tool-".length);
    return getTranslatedName(toolId);
  }
  if (target.type) return target.type;
  return i18next.t("tools.tool", { ns: "ai", defaultValue: "工具" });
}
