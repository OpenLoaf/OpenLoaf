/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { UIMessage } from "ai";
import type { ModelCapabilities, ModelDefinition, ModelTag } from "@openloaf/api/common";
import { getModelDefinition } from "@/ai/models/modelRegistry";
import { getProviderSettings } from "@/modules/settings/settingsService";

/** Resolve explicit model definition from chatModelId. */
export async function resolveExplicitModelDefinition(
  chatModelId?: string | null,
): Promise<ModelDefinition | null> {
  const normalized = typeof chatModelId === "string" ? chatModelId.trim() : "";
  if (!normalized) {
    return null;
  }
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
    return null;
  }
  const profileId = normalized.slice(0, separatorIndex).trim();
  const modelId = normalized.slice(separatorIndex + 1).trim();
  if (!profileId || !modelId) {
    return null;
  }

  const providers = await getProviderSettings();
  const providerEntry = providers.find((entry) => entry.id === profileId);
  if (!providerEntry) {
    const registryModel = await getModelDefinition(profileId, modelId) ?? null;
    return registryModel;
  }
  const fromConfig = providerEntry.models[modelId];
  if (!fromConfig) {
    const registryModel = await getModelDefinition(providerEntry.providerId, modelId) ?? null;
    return registryModel;
  }
  const hasTags = Array.isArray(fromConfig.tags) && fromConfig.tags.length > 0;
  const capabilities = fromConfig.capabilities as ModelCapabilities | undefined;
  // 中文注释：任一能力字段有值就视为配置包含能力信息。
  const hasCapabilities = Boolean(
    capabilities &&
      (Object.keys(capabilities.common ?? {}).length > 0 ||
        Object.keys(capabilities.params ?? {}).length > 0 ||
        Object.keys(capabilities.input ?? {}).length > 0 ||
        Object.keys(capabilities.output ?? {}).length > 0)
  );
  if (hasTags || hasCapabilities) {
    return fromConfig;
  }
  const registryModel = await getModelDefinition(providerEntry.providerId, modelId) ?? fromConfig;
  return registryModel;
}

/** Resolve required input tags from message parts. */
export function resolveRequiredInputTags(messages: UIMessage[]): ModelTag[] {
  const required = new Set<ModelTag>();
  // 中文注释：/chat/sse 默认走文本对话链路，因此至少需要对话能力。
  required.add("chat");
  for (const message of messages) {
    const parts = Array.isArray((message as any).parts) ? (message as any).parts : [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      if ((part as any).type !== "file") continue;
      const url = typeof (part as any).url === "string" ? (part as any).url : "";
      if (!url) continue;
      const purpose = typeof (part as any).purpose === "string" ? (part as any).purpose : "";
      if (purpose === "mask") {
        // 中文注释：mask 也按图片输入处理，能力判断交由媒体模型侧完成。
        required.add("image_input");
        continue;
      }
      // 中文注释：普通图片输入只要求 image_input，避免误判为图片编辑。
      required.add("image_input");
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
