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
 * messageOptionResolver tests.
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/messageOptionResolver.test.ts
 */
import assert from "node:assert/strict";
import type { UIMessage } from "ai";
import { resolveCodexRequestOptions } from "@/ai/services/chat/messageOptionResolver";

/** Build a user message helper for tests. */
function userMessage(input: {
  text: string;
  metadata?: Record<string, unknown>;
}): UIMessage {
  return {
    id: `m_${Math.random().toString(36).slice(2)}`,
    role: "user",
    parts: [{ type: "text", text: input.text }],
    ...(input.metadata ? { metadata: input.metadata } : {}),
  } as UIMessage;
}

/** Run messageOptionResolver test cases. */
function main() {
  const noMetadata = resolveCodexRequestOptions([userMessage({ text: "hello" })]);
  assert.equal(noMetadata, undefined, "no metadata should not resolve codex options");

  const withReasoningModeFast = resolveCodexRequestOptions([
    userMessage({
      text: "hello",
      metadata: { reasoning: { mode: "fast" } },
    }),
  ]);
  assert.deepEqual(
    withReasoningModeFast,
    { reasoningEffort: "low" },
    "reasoning.mode=fast should map to codex reasoningEffort=low",
  );

  const withReasoningModeDeep = resolveCodexRequestOptions([
    userMessage({
      text: "hello",
      metadata: { reasoning: { mode: "deep" } },
    }),
  ]);
  assert.deepEqual(
    withReasoningModeDeep,
    { reasoningEffort: "high" },
    "reasoning.mode=deep should map to codex reasoningEffort=high",
  );

  const withExplicitCodexOverridesMode = resolveCodexRequestOptions([
    userMessage({
      text: "hello",
      metadata: {
        reasoning: { mode: "deep" },
        codexOptions: { mode: "agent", reasoningEffort: "xhigh" },
      },
    }),
  ]);
  assert.deepEqual(
    withExplicitCodexOverridesMode,
    { mode: "agent", reasoningEffort: "xhigh" },
    "explicit codexOptions.reasoningEffort should override reasoning mode mapping",
  );

  const withCodexModeAndReasoningFallback = resolveCodexRequestOptions([
    userMessage({
      text: "hello",
      metadata: {
        reasoning: { mode: "deep" },
        codexOptions: { mode: "chat" },
      },
    }),
  ]);
  assert.deepEqual(
    withCodexModeAndReasoningFallback,
    { mode: "chat", reasoningEffort: "high" },
    "codex mode should be kept while reasoning effort falls back to reasoning mode",
  );

  console.log("PASS messageOptionResolver");
}

main();
