/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { openUrlToolDef } from "./browser";
import {
  browserSnapshotToolDef,
  browserObserveToolDef,
  browserExtractToolDef,
  browserActToolDef,
  browserWaitToolDef,
} from "./browserAutomation";
import { calendarQueryToolDef, calendarMutateToolDef } from "./calendar";
import { projectQueryToolDef, projectMutateToolDef } from "./db";
import { emailQueryToolDef, emailMutateToolDef } from "./email";
import { imageGenerateToolDef, videoGenerateToolDef } from "./mediaGenerate";
import { officeExecuteToolDef } from "./office";
import { testApprovalToolDef } from "./approvalTest";
import {
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  abortAgentToolDef,
} from "./agent";
import {
  shellToolDef,
  shellCommandToolDef,
  execCommandToolDef,
  writeStdinToolDef,
  readFileToolDef,
  applyPatchToolDef,
  editDocumentToolDef,
  listDirToolDef,
  grepFilesToolDef,
  updatePlanToolDef,
  jsReplToolDef,
  jsReplResetToolDef,
} from "./runtime";
import { timeNowToolDef } from "./system";
import { requestUserInputToolDef } from "./userInput";
import { jsxCreateToolDef } from "./jsxCreate";
import { chartRenderToolDef } from "./chart";
import {
  widgetInitToolDef,
  widgetListToolDef,
  widgetGetToolDef,
  widgetCheckToolDef,
  generateWidgetToolDef,
} from "./widget";
import { subAgentToolDef } from "./subAgent";

export type ToolCatalogItem = {
  id: string;
  label: string;
  description: string;
};

type ToolDefLike = { id: string; name?: string; description?: string };

const TOOL_DEFS: ToolDefLike[] = [
  openUrlToolDef,
  browserSnapshotToolDef,
  browserObserveToolDef,
  browserExtractToolDef,
  browserActToolDef,
  browserWaitToolDef,
  readFileToolDef,
  listDirToolDef,
  grepFilesToolDef,
  applyPatchToolDef,
  editDocumentToolDef,
  shellToolDef,
  shellCommandToolDef,
  execCommandToolDef,
  writeStdinToolDef,
  emailQueryToolDef,
  emailMutateToolDef,
  calendarQueryToolDef,
  calendarMutateToolDef,
  officeExecuteToolDef,
  imageGenerateToolDef,
  videoGenerateToolDef,
  widgetInitToolDef,
  widgetListToolDef,
  widgetGetToolDef,
  widgetCheckToolDef,
  generateWidgetToolDef,
  projectQueryToolDef,
  projectMutateToolDef,
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  abortAgentToolDef,
  jsReplToolDef,
  jsReplResetToolDef,
  timeNowToolDef,
  updatePlanToolDef,
  testApprovalToolDef,
  requestUserInputToolDef,
  jsxCreateToolDef,
  subAgentToolDef,
  chartRenderToolDef,
];

// 逻辑：统一生成工具元数据，避免前端重复维护名称与描述。
export const TOOL_CATALOG: ToolCatalogItem[] = TOOL_DEFS.map((def) => ({
  id: def.id,
  label: def.name ?? def.id,
  description: def.description ?? "",
}));

export const TOOL_CATALOG_MAP = new Map(
  TOOL_CATALOG.map((item) => [item.id, item]),
);

/** Resolve tool metadata by id. */
export function resolveToolCatalogItem(id: string): ToolCatalogItem {
  return TOOL_CATALOG_MAP.get(id) ?? { id, label: id, description: "" };
}
