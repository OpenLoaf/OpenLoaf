/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * Tool schema validation tests.
 *
 * Ensures all tool definitions produce valid JSON Schema with `type: "object"`
 * when converted via the AI SDK's `zodSchema()`. OpenAI-compatible APIs
 * (including DeepSeek) reject schemas where the top-level type is not "object".
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/toolSchemaValidation.test.ts
 */
import assert from "node:assert/strict";
import { zodSchema } from "ai";

// --- Tool definitions ---
import { openUrlToolDef } from "@openloaf/api/types/tools/browser";
import {
  browserSnapshotToolDef,
  browserObserveToolDef,
  browserExtractToolDef,
  browserActToolDef,
  browserWaitToolDef,
  browserScreenshotToolDef,
  browserDownloadImageToolDef,
} from "@openloaf/api/types/tools/browserAutomation";
import { calendarQueryToolDef, calendarMutateToolDef } from "@openloaf/api/types/tools/calendar";
import { projectQueryToolDef, projectMutateToolDef } from "@openloaf/api/types/tools/db";
import { emailQueryToolDef, emailMutateToolDef } from "@openloaf/api/types/tools/email";
import { videoDownloadToolDef } from "@openloaf/api/types/tools/videoDownload";
import { excelQueryToolDef, excelMutateToolDef } from "@openloaf/api/types/tools/excel";
import { wordQueryToolDef, wordMutateToolDef } from "@openloaf/api/types/tools/word";
import {
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  abortAgentToolDef,
} from "@openloaf/api/types/tools/agent";
import {
  bashToolDef,
  readToolDef,
  editToolDef,
  writeToolDef,
  editDocumentToolDef,
  globToolDef,
  grepToolDef,
  updatePlanToolDef,
  jsReplToolDef,
  jsReplResetToolDef,
} from "@openloaf/api/types/tools/runtime";
import { requestUserInputToolDef } from "@openloaf/api/types/tools/userInput";
import { jsxCreateToolDef } from "@openloaf/api/types/tools/jsxCreate";
import { chartRenderToolDef } from "@openloaf/api/types/tools/chart";
import {
  widgetInitToolDef,
  widgetListToolDef,
  widgetGetToolDef,
  widgetCheckToolDef,
  generateWidgetToolDef,
} from "@openloaf/api/types/tools/widget";
import { subAgentToolDef } from "@openloaf/api/types/tools/subAgent";
import { createTaskToolDef, taskStatusToolDef } from "@openloaf/api/types/tools/task";

type ToolDefLike = { id: string; parameters: any };

const ALL_TOOL_DEFS: ToolDefLike[] = [
  openUrlToolDef,
  browserSnapshotToolDef,
  browserObserveToolDef,
  browserExtractToolDef,
  browserActToolDef,
  browserWaitToolDef,
  browserScreenshotToolDef,
  browserDownloadImageToolDef,
  readToolDef,
  globToolDef,
  grepToolDef,
  editToolDef,
  writeToolDef,
  editDocumentToolDef,
  bashToolDef,
  emailQueryToolDef,
  emailMutateToolDef,
  calendarQueryToolDef,
  calendarMutateToolDef,
  excelQueryToolDef,
  excelMutateToolDef,
  wordQueryToolDef,
  wordMutateToolDef,
  videoDownloadToolDef,
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
  updatePlanToolDef,
  requestUserInputToolDef,
  jsxCreateToolDef,
  subAgentToolDef,
  chartRenderToolDef,
  createTaskToolDef,
  taskStatusToolDef,
];

function main() {
  let passed = 0;
  let failed = 0;

  for (const def of ALL_TOOL_DEFS) {
    try {
      const converted = zodSchema(def.parameters);
      const jsonSchema = converted.jsonSchema as Record<string, unknown>;

      // Top-level type must be "object"
      assert.equal(
        jsonSchema.type,
        "object",
        `Tool "${def.id}": expected top-level type "object", got "${jsonSchema.type}"`,
      );

      // Must have properties field
      assert.ok(
        jsonSchema.properties !== undefined,
        `Tool "${def.id}": missing "properties" in JSON Schema`,
      );

      passed++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`FAIL [${def.id}] ${msg}`);
    }
  }

  console.log(`\nTool schema validation: ${passed} passed, ${failed} failed, ${ALL_TOOL_DEFS.length} total`);

  if (failed > 0) {
    process.exit(1);
  }

  console.log("PASS toolSchemaValidation");
}

main();
