/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import assert from "node:assert/strict";

import { handleSubAgentToolParts } from "../sub-agent-tool-parts";

async function run() {
  const upsertCalls: Array<{ tabId: string; toolCallId: string; next: any }> = [];
  const executeCalls: Array<{ part: any; tabId?: string }> = [];

  handleSubAgentToolParts({
    parts: [
      { type: "text", text: "hello" },
      {
        type: "tool-open-url",
        toolCallId: "tool-1",
        toolName: "open-url",
        input: { url: "https://example.com" },
      },
      { type: "tool-open-url", toolName: "open-url" },
    ],
    tabId: "tab-1",
    subAgentToolCallId: "sub-1",
    upsertToolPart: (tabId, toolCallId, next) => {
      upsertCalls.push({ tabId, toolCallId, next });
    },
    executeToolPart: async (input) => {
      executeCalls.push(input);
      return true;
    },
  });

  assert.equal(upsertCalls.length, 1);
  assert.equal(executeCalls.length, 1);

  const [upsert] = upsertCalls;
  assert.equal(upsert.tabId, "tab-1");
  assert.equal(upsert.toolCallId, "tool-1");
  assert.equal(upsert.next.subAgentToolCallId, "sub-1");
  assert.equal(upsert.next.toolName, "open-url");

  const [execute] = executeCalls;
  assert.equal(execute.tabId, "tab-1");
  assert.equal(execute.part.toolCallId, "tool-1");
  assert.equal(execute.part.toolName, "open-url");

  console.log("sub-agent tool parts handling tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
