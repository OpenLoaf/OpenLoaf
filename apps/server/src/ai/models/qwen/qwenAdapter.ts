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
import { buildAiDebugFetch, buildFinalUrlFetch, ensureOpenAiCompatibleBaseUrl, readApiKey, withUserAgentFetch } from "@/ai/shared/util";
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
    let debugFetch = buildAiDebugFetch();
    if (!apiKey || !resolvedApiUrl) return null;
    debugFetch = withUserAgentFetch(debugFetch, provider.options?.customUserAgent);
    const useFinalUrl = provider.options?.finalApiUrl === true;
    const baseURL = useFinalUrl ? resolvedApiUrl : ensureOpenAiCompatibleBaseUrl(resolvedApiUrl);
    const finalFetch = useFinalUrl
      ? wrapQwenMultimodalFetch(buildFinalUrlFetch(resolvedApiUrl, debugFetch))
      : wrapQwenMultimodalFetch(debugFetch);
    const openaiProvider = createOpenAI({
      baseURL,
      apiKey,
      fetch: finalFetch,
    });
    return wrapLanguageModel({
      model: openaiProvider.chat(modelId),
      middleware: createQwenMultimodalMiddleware(),
    });
  },
};
