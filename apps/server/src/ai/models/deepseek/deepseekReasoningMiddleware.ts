/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { LanguageModelV3Middleware, LanguageModelV3Prompt } from "@ai-sdk/provider";

// 背景：
//   DeepSeek 思考模式（V3.1+ hybrid / V4，capability `reasoning='always'|'optional'`）
//   在多轮 + 工具调用场景下，服务端硬性要求把上一轮 assistant 的 reasoning_content
//   回传，否则 400：`The reasoning_content in the thinking mode must be passed back to the API`。
//
//   `@ai-sdk/deepseek` 的 `convertToDeepSeekChatMessages` 默认实现里，对早于
//   "最近一条 user 消息" 的 assistant turn 一律 `if (index <= lastUserMessageIndex) break`
//   把 reasoning 段剥光，且 SDK 没暴露 `reasoningHistory` 选项可调。Moonshot SDK
//   走原生 option，DeepSeek 这边只能在 fetch 层拦下出站 body，按"原始 prompt 第几个
//   assistant"对位回填 reasoning_content。
//
//   触发条件由 `providerAdapters.ts` 把控（仅 reasoning ∈ {always, optional}），
//   非思考 deepseek 模型完全不进这条路径。

/** 第 i 个 assistant 在原始 prompt 里的合并 reasoning 文本（无 reasoning 即空串）。 */
type AssistantReasoningSnapshot = string[];

const reasoningStore = new AsyncLocalStorage<AssistantReasoningSnapshot>();

/** 从 LanguageModelV3 prompt 里按 assistant 出现顺序抽取 reasoning 文本。 */
function extractAssistantReasoning(prompt: LanguageModelV3Prompt): AssistantReasoningSnapshot {
  const out: AssistantReasoningSnapshot = [];
  for (const msg of prompt) {
    if (msg.role !== "assistant") continue;
    const parts = Array.isArray(msg.content) ? msg.content : [];
    let text = "";
    for (const p of parts as Array<{ type?: string; text?: unknown }>) {
      if (p && p.type === "reasoning" && typeof p.text === "string") text += p.text;
    }
    out.push(text);
  }
  return out;
}

/**
 * Middleware：在 wrapStream / wrapGenerate 阶段把当前 prompt 的 assistant.reasoning
 * 快照存进 AsyncLocalStorage，作用域到这一次模型调用，避免并发请求串扰。
 */
export function createDeepseekReasoningMiddleware(): LanguageModelV3Middleware {
  return {
    specificationVersion: "v3",
    wrapGenerate: async ({ doGenerate, params }) => {
      const snapshot = extractAssistantReasoning(params.prompt);
      return reasoningStore.run(snapshot, async () => doGenerate());
    },
    wrapStream: async ({ doStream, params }) => {
      const snapshot = extractAssistantReasoning(params.prompt);
      return reasoningStore.run(snapshot, async () => doStream());
    },
  };
}

/**
 * Fetch 拦截器：在 SDK 已经把 prompt 转成 OpenAI 兼容 body 之后，按 messages 数组里
 * assistant 的位置回填 reasoning_content（仅在原始 prompt 该位次有非空 reasoning 时）。
 *
 * - 只覆盖 `reasoning_content == null || ""`，已有值（如未来 SDK 自己回填）不覆盖。
 * - 整条快照全空时直接放行，避免无谓 JSON.parse / stringify 开销。
 * - JSON 解析失败 / messages 形状异常 → 透传原始 body，不阻断请求。
 */
export function wrapDeepseekReasoningFetch(realFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const snapshot = reasoningStore.getStore();
    if (!snapshot || snapshot.length === 0 || !init?.body) {
      return realFetch(input, init);
    }
    const hasAnyReasoning = snapshot.some((r) => r.length > 0);
    if (!hasAnyReasoning) return realFetch(input, init);

    const bodyStr = typeof init.body === "string" ? init.body : String(init.body);
    let body: { messages?: Array<{ role?: string; reasoning_content?: string | null }> };
    try {
      body = JSON.parse(bodyStr);
    } catch {
      return realFetch(input, init);
    }
    if (!Array.isArray(body?.messages)) return realFetch(input, init);

    let assistantIdx = 0;
    let mutated = false;
    for (const m of body.messages) {
      if (!m || m.role !== "assistant") continue;
      const reasoning = snapshot[assistantIdx++];
      if (
        reasoning &&
        reasoning.length > 0 &&
        (m.reasoning_content == null || m.reasoning_content === "")
      ) {
        m.reasoning_content = reasoning;
        mutated = true;
      }
    }
    if (!mutated) return realFetch(input, init);
    return realFetch(input, { ...init, body: JSON.stringify(body) });
  };
}
