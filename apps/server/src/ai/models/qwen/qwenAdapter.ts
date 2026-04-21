/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { createOpenAI } from "@ai-sdk/openai";
import { wrapLanguageModel } from "ai";
import type { ProviderAdapter } from "@/ai/models/providerAdapters";
import { buildAiDebugFetch, ensureOpenAiCompatibleBaseUrl, readApiKey } from "@/ai/shared/util";
import {
  createQwenMultimodalMiddleware,
  wrapQwenMultimodalFetch,
} from "@/ai/models/qwen/qwenMultimodalMiddleware";

/** Qwen provider adapter (chat only). */
export const qwenAdapter: ProviderAdapter = {
  /** Adapter id. */
  id: "qwen",
  /** Build Qwen chat model via OpenAI-compatible endpoint. */
  buildAiSdkModel: ({ provider, modelId, providerDefinition }) => {
    const apiKey = readApiKey(provider.authConfig);
    const resolvedApiUrl = provider.apiUrl.trim() || providerDefinition?.apiUrl?.trim() || "";
    const debugFetch = buildAiDebugFetch();
    // 中文注释：仅支持聊天模型，缺少配置直接返回 null。
    if (!apiKey || !resolvedApiUrl) return null;
    const openaiProvider = createOpenAI({
      baseURL: ensureOpenAiCompatibleBaseUrl(resolvedApiUrl),
      apiKey,
      // 中文注释：Qwen /chat/completions 支持 video_url / input_audio，
      // 但 @ai-sdk/openai 的 messages 转换器不生成这两种 type；用 middleware +
      // fetch 后处理在 HTTP body 层补齐。
      fetch: wrapQwenMultimodalFetch(debugFetch),
    });
    return wrapLanguageModel({
      model: openaiProvider.chat(modelId),
      middleware: createQwenMultimodalMiddleware(),
    });
  },
};
