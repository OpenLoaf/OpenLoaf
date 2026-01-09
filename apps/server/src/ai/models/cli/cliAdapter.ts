import type { ProviderAdapter } from "@/ai/models/providerAdapters";
import { buildCodexSdkLanguageModel } from "@/ai/models/cli/codexSdkLanguageModel";

/** CLI provider adapter definition. */
export const cliAdapter: ProviderAdapter = {
  id: "cli",
  /** Build the Codex SDK backed model for CLI providers. */
  buildAiSdkModel: ({ provider, modelId, providerDefinition }) => {
    const resolvedProviderId = providerDefinition?.id ?? provider.providerId;
    if (resolvedProviderId !== "codex-cli") return null;
    const resolvedApiUrl =
      provider.apiUrl.trim() || providerDefinition?.apiUrl?.trim() || "";
    const rawApiKey = provider.authConfig?.apiKey;
    const rawForce = provider.authConfig?.forceCustomApiKey;
    // 逻辑：CLI 配置通过 authConfig 透传，避免额外读取设置文件。
    const apiKey = typeof rawApiKey === "string" ? rawApiKey : "";
    const forceCustomApiKey = typeof rawForce === "boolean" ? rawForce : false;
    return buildCodexSdkLanguageModel({
      providerId: resolvedProviderId,
      modelId,
      apiUrl: resolvedApiUrl,
      apiKey,
      forceCustomApiKey,
    });
  },
  /** CLI providers do not support image generation. */
  buildImageModel: () => null,
  /** CLI providers do not expose raw HTTP requests. */
  buildRequest: () => null,
};
