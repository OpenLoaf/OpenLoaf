import type { ProviderAdapter } from "@/ai/models/providerAdapters";
import type { CliToolId } from "@/ai/models/cli/cliToolService";
import { buildCliLanguageModel } from "@/ai/models/cli/cliLanguageModel";

type CliProviderBinding = {
  /** Provider id in registry. */
  providerId: string;
  /** CLI tool id. */
  toolId: CliToolId;
};

/** CLI provider bindings for tool routing. */
const CLI_PROVIDER_BINDINGS: CliProviderBinding[] = [
  { providerId: "codex-cli", toolId: "codex" },
];

/** Resolve CLI tool id by provider id. */
function resolveCliToolId(providerId: string): CliToolId | null {
  const entry = CLI_PROVIDER_BINDINGS.find((item) => item.providerId === providerId);
  return entry?.toolId ?? null;
}

/** CLI provider adapter definition. */
export const cliAdapter: ProviderAdapter = {
  id: "cli",
  buildAiSdkModel: ({ provider, modelId, providerDefinition }) => {
    const resolvedProviderId = providerDefinition?.id ?? provider.providerId;
    const toolId = resolveCliToolId(resolvedProviderId);
    if (!toolId) return null;
    const resolvedApiUrl =
      provider.apiUrl.trim() || providerDefinition?.apiUrl?.trim() || "";
    const rawApiKey = provider.authConfig?.apiKey;
    const rawForce = provider.authConfig?.forceCustomApiKey;
    // 逻辑：CLI 配置通过 authConfig 透传，避免额外读取设置文件。
    const apiKey = typeof rawApiKey === "string" ? rawApiKey : "";
    const forceCustomApiKey = typeof rawForce === "boolean" ? rawForce : false;
    return buildCliLanguageModel({
      providerId: resolvedProviderId,
      modelId,
      toolId,
      apiUrl: resolvedApiUrl,
      apiKey,
      forceCustomApiKey,
    });
  },
  buildImageModel: () => null,
  buildRequest: () => null,
};
