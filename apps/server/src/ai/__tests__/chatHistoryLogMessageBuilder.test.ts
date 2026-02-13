/**
 * Chat history branch log message builder test.
 *
 * 用法：
 *   pnpm --filter server run test:chat:branch-log-builder
 */
import assert from "node:assert/strict";
import type { UIMessage } from "ai";
import { buildBranchLogMessages } from "@/ai/services/chat/chatHistoryLogMessageBuilder";

/** Run branch log message builder tests. */
function main() {
  const baseMessages: UIMessage[] = [
    {
      id: "__session_preface__",
      role: "user",
      parts: [{ type: "text", text: "preface" }],
    } as UIMessage,
    {
      id: "user_1",
      role: "user",
      parentMessageId: null,
      parts: [{ type: "text", text: "你好" }],
      messageKind: "normal",
    } as UIMessage,
  ];

  const result = buildBranchLogMessages({
    modelMessages: baseMessages,
    assistantResponseMessage: {
      id: "temp_assistant",
      role: "assistant",
      parentMessageId: "user_1",
      parts: [{ type: "text", text: "你好，有什么可以帮你？" }],
    } as UIMessage,
    assistantMessageId: "assistant_1",
    parentMessageId: "user_1",
    metadata: { finishReason: "stop" },
    assistantMessageKind: "compact_summary",
  });

  assert.equal(result.length, 3, "应在原上下文后追加 assistant 消息");
  const last = result[result.length - 1] as any;
  assert.equal(last.role, "assistant", "最后一条应为 assistant");
  assert.equal(last.id, "assistant_1", "assistant id 应使用最终持久化 id");
  assert.equal(last.parentMessageId, "user_1", "assistant parentMessageId 应保持正确");
  assert.equal(last.messageKind, "compact_summary", "assistant kind 应应用覆盖值");
  assert.equal(last.parts?.[0]?.text, "你好，有什么可以帮你？", "assistant 文本应完整保留");
  assert.equal(last.metadata?.finishReason, "stop", "assistant metadata 应写入最终值");

  console.log("PASS chatHistoryLogMessageBuilder");
}

main();
