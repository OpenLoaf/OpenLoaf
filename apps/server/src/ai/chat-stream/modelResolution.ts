import type { UIMessage } from "ai";
import type { ModelDefinition, ModelTag } from "@teatime-ai/api/common";
import { logger } from "@/common/logger";
import { getModelDefinition } from "@/ai/models/modelRegistry";
import { getProviderSettings } from "@/modules/settings/settingsService";

/** Resolve explicit model definition from chatModelId. */
export async function resolveExplicitModelDefinition(
  chatModelId?: string | null,
): Promise<ModelDefinition | null> {
  const normalized = typeof chatModelId === "string" ? chatModelId.trim() : "";
  if (!normalized) {
    logger.debug({ chatModelId }, "[chat] explicit model skipped");
    return null;
  }
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
    logger.debug({ chatModelId: normalized }, "[chat] explicit model id invalid");
    return null;
  }
  const profileId = normalized.slice(0, separatorIndex).trim();
  const modelId = normalized.slice(separatorIndex + 1).trim();
  if (!profileId || !modelId) {
    logger.debug({ chatModelId: normalized }, "[chat] explicit model id empty");
    return null;
  }

  const providers = await getProviderSettings();
  const providerEntry = providers.find((entry) => entry.id === profileId);
  if (!providerEntry) {
    const registryModel = getModelDefinition(profileId, modelId) ?? null;
    logger.debug(
      {
        profileId,
        modelId,
        registryProviderId: registryModel?.providerId,
        registryTags: registryModel?.tags,
      },
      "[chat] explicit model from registry",
    );
    return registryModel;
  }
  const fromConfig = providerEntry.models[modelId];
  logger.debug(
    {
      profileId,
      modelId,
      providerId: providerEntry.providerId,
      hasConfigModel: Boolean(fromConfig),
    },
    "[chat] explicit model from provider config",
  );
  if (!fromConfig) {
    const registryModel = getModelDefinition(providerEntry.providerId, modelId) ?? null;
    logger.debug(
      {
        profileId,
        modelId,
        registryProviderId: registryModel?.providerId,
        registryTags: registryModel?.tags,
      },
      "[chat] explicit model fallback to registry",
    );
    return registryModel;
  }
  if (Array.isArray(fromConfig.tags) && fromConfig.tags.length > 0) {
    logger.debug(
      {
        profileId,
        modelId,
        providerId: providerEntry.providerId,
        tags: fromConfig.tags,
      },
      "[chat] explicit model use config tags",
    );
    return fromConfig;
  }
  const registryModel = getModelDefinition(providerEntry.providerId, modelId) ?? fromConfig;
  logger.debug(
    {
      profileId,
      modelId,
      providerId: providerEntry.providerId,
      registryProviderId: registryModel?.providerId,
      registryTags: registryModel?.tags,
    },
    "[chat] explicit model merge registry",
  );
  return registryModel;
}

/** Resolve required input tags from message parts. */
export function resolveRequiredInputTags(messages: UIMessage[]): ModelTag[] {
  const required = new Set<ModelTag>();
  for (const message of messages) {
    const parts = Array.isArray((message as any).parts) ? (message as any).parts : [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      if ((part as any).type !== "file") continue;
      const url = typeof (part as any).url === "string" ? (part as any).url : "";
      if (!url) continue;
      const purpose = typeof (part as any).purpose === "string" ? (part as any).purpose : "";
      if (purpose === "mask") {
        required.add("image_edit");
        continue;
      }
      // 中文注释：存在图片输入时统一走图片编辑能力。
      required.add("image_edit");
    }
  }
  return Array.from(required);
}

/** Resolve last used chat model id from assistant metadata. */
export function resolvePreviousChatModelId(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as any;
    if (!message || message.role !== "assistant") continue;
    const metadata = message.metadata;
    if (!metadata || typeof metadata !== "object") continue;
    const agent = (metadata as any).agent;
    const chatModelId = typeof agent?.chatModelId === "string" ? agent.chatModelId : "";
    if (chatModelId) return chatModelId;
  }
  return null;
}
