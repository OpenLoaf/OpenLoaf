/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ProviderAdapter } from "@/ai/models/providerAdapters";
import { buildCodexAppServerLanguageModel } from "@/ai/models/cli/codex/codexAppServerLanguageModel";
import { buildClaudeCodeLanguageModel } from "@/ai/models/cli/claudeCode";

/** Resolve common CLI auth config. */
function resolveCliAuthConfig(provider: { apiUrl: string; authConfig?: Record<string, unknown> }, providerDefinition?: { apiUrl?: string }) {
  const resolvedApiUrl =
    provider.apiUrl.trim() || providerDefinition?.apiUrl?.trim() || "";
  const rawApiKey = provider.authConfig?.apiKey;
  const rawForce = provider.authConfig?.forceCustomApiKey;
  // 逻辑：CLI 配置通过 authConfig 透传，避免额外读取设置文件。
  const apiKey = typeof rawApiKey === "string" ? rawApiKey : "";
  const forceCustomApiKey = typeof rawForce === "boolean" ? rawForce : false;
  return { resolvedApiUrl, apiKey, forceCustomApiKey };
}

/** CLI provider adapter definition. */
export const cliAdapter: ProviderAdapter = {
  id: "cli",
  /** Build the CLI-backed model for the resolved provider. */
  buildAiSdkModel: ({ provider, modelId, providerDefinition }) => {
    const resolvedProviderId = providerDefinition?.id ?? provider.providerId;
    const { resolvedApiUrl, apiKey, forceCustomApiKey } = resolveCliAuthConfig(provider, providerDefinition);
    if (resolvedProviderId === "codex-cli") {
      return buildCodexAppServerLanguageModel({
        providerId: resolvedProviderId,
        modelId,
        apiUrl: resolvedApiUrl,
        apiKey,
        forceCustomApiKey,
      });
    }
    if (resolvedProviderId === "claude-code-cli") {
      return buildClaudeCodeLanguageModel({
        providerId: resolvedProviderId,
        modelId,
        apiUrl: resolvedApiUrl,
        apiKey,
        forceCustomApiKey,
      });
    }
    return null;
  },
};
