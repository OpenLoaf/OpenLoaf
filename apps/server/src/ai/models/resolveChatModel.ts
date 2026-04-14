/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { getProviderSettings, type ProviderSettingEntry } from "@/modules/settings/settingsService";
import { type ChatModelSource, type ModelDefinition } from "@openloaf/api/common";
import { getModelDefinition, getProviderDefinition } from "@/ai/models/modelRegistry";
import { PROVIDER_ADAPTERS } from "@/ai/models/providerAdapters";
import { buildCliProviderEntries } from "@/ai/models/cli/cliProviderEntry";
import { fetchModelList, getSaasBaseUrl } from "@/modules/saas";
import { ensureServerAccessToken } from "@/modules/auth/tokenStore";
import {
  mapCloudChatModels,
  type CloudChatModelsResponse,
} from "@/ai/models/cloudModelMapper";

type ResolvedChatModel = {
  model: LanguageModelV3;
  modelInfo: { provider: string; modelId: string };
  chatModelId: string;
  modelDefinition?: ModelDefinition;
};

/** Map provider settings before model construction. */
type ProviderEntryMapper = (entry: ProviderSettingEntry) => ProviderSettingEntry;

/** Resolve model definition from registry or settings. */
async function resolveModelDefinition(
  providerId: string,
  modelId: string,
  providerEntry?: ProviderSettingEntry,
) {
  const fromConfig = providerEntry?.models[modelId];
  return fromConfig ?? (await getModelDefinition(providerId, modelId));
}

/** Normalize chatModelId input. */
function normalizeChatModelId(raw?: string | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/** Parse chatModelId into provider key and model id. */
function parseChatModelId(chatModelId: string): { profileId: string; modelId: string } | null {
  const separatorIndex = chatModelId.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= chatModelId.length - 1) return null;
  const profileId = chatModelId.slice(0, separatorIndex).trim();
  const modelId = chatModelId.slice(separatorIndex + 1).trim();
  if (!profileId || !modelId) return null;
  return { profileId, modelId };
}

/** Normalize chat model source input. */
function normalizeChatModelSource(raw?: string | null): ChatModelSource {
  // 中文注释：只允许 local/cloud/saas，非法值默认回落到 local。
  if (raw === "cloud") return "cloud";
  if (raw === "saas") return "saas";
  return "local";
}

/** Normalize cloud models into provider settings entries. */
async function buildCloudProviderEntries(input: {
  models: ModelDefinition[];
  apiUrl: string;
  apiKey: string;
  adapterId: string;
}): Promise<ProviderSettingEntry[]> {
  const providerMap = new Map<string, ProviderSettingEntry>();
  const now = new Date();

  for (const model of input.models) {
    if (!model || typeof model.id !== "string" || !model.providerId) continue;
    const providerKey = model.providerId;
    let entry = providerMap.get(providerKey);
    if (!entry) {
      const providerDefinition = await getProviderDefinition(providerKey);
      entry = {
        id: providerKey,
        key: providerDefinition?.label ?? providerKey,
        // 中文注释：云端调用统一走 SaaS adapter，保留 providerKey 仅用于分组与 chatModelId。
        providerId: input.adapterId,
        apiUrl: input.apiUrl,
        authConfig: { apiKey: input.apiKey },
        models: {},
        updatedAt: now,
      };
      providerMap.set(providerKey, entry);
    }
    // 中文注释：确保模型列表中包含 providerId，避免 SaaS 返回空值。
    entry.models[model.id] = {
      ...model,
      // 中文注释：模型定义改写为 SaaS adapter，避免解析时回退到真实 provider。
      providerId: input.adapterId,
      tags: Array.isArray(model.tags) ? model.tags : [],
    };
  }

  return Array.from(providerMap.values());
}

/** Resolve chat model from provider settings. */
async function resolveChatModelFromProviders(input: {
  chatModelId?: string | null;
  providers: ProviderSettingEntry[];
  mapProviderEntry?: ProviderEntryMapper;
}): Promise<ResolvedChatModel> {
  const normalized = normalizeChatModelId(input.chatModelId);
  if (!normalized) {
    throw new Error("未指定 chatModelId — 前端必须显式传入当前选中的模型");
  }
  const mapProviderEntry = input.mapProviderEntry ?? ((entry) => entry);
  const providers = input.providers;
  const providerById = new Map(providers.map((entry) => [entry.id, entry]));

  // 解析一次，失败直接抛错 — 前端必须传正确的 chatModelId，不再做 fallback。
  const parsed = parseChatModelId(normalized);
  if (!parsed) throw new Error("chatModelId 格式无效");

  // 中文注释：chatModelId 前缀固定使用 settings.id，避免 key 重命名导致失效。
  const providerEntry = providerById.get(parsed.profileId);
  if (!providerEntry) throw new Error("模型服务商未配置");
  if (!providerEntry.models[parsed.modelId]) {
    throw new Error("模型未在服务商配置中启用");
  }

  const mappedProviderEntry = mapProviderEntry(providerEntry);
  const modelDefinition = await resolveModelDefinition(
    providerEntry.providerId,
    parsed.modelId,
    providerEntry,
  );
  // 适配器优先使用模型定义里的 providerId，保留 per-model override 的逃生通道；
  // 但聚合商（如 OpenRouter）模型的 providerId 往往是上游 vendor（stepfun / anthropic 等），
  // 无法对应任何本地 adapter，这种情况下必须回落到 providerEntry.providerId。
  const modelProviderId = modelDefinition?.providerId;
  const modelProviderDefinition = modelProviderId
    ? await getProviderDefinition(modelProviderId)
    : null;
  const modelProviderHasAdapter =
    !!modelProviderId &&
    (PROVIDER_ADAPTERS[modelProviderId] != null ||
      (modelProviderDefinition?.adapterId != null &&
        PROVIDER_ADAPTERS[modelProviderDefinition.adapterId] != null));
  const resolvedProviderId = modelProviderHasAdapter
    ? (modelProviderId as string)
    : providerEntry.providerId;
  const providerDefinition =
    modelProviderHasAdapter && modelProviderDefinition
      ? modelProviderDefinition
      : await getProviderDefinition(resolvedProviderId);
  const adapterId = providerDefinition?.adapterId ?? resolvedProviderId;
  const adapter = PROVIDER_ADAPTERS[adapterId];
  if (!adapter) throw new Error("不支持的模型服务商");
  const model = adapter.buildAiSdkModel({
    provider: mappedProviderEntry,
    modelId: parsed.modelId,
    modelDefinition,
    providerDefinition,
  });
  if (!model) {
    const resolvedApiUrl = (
      mappedProviderEntry.apiUrl.trim() || providerDefinition?.apiUrl?.trim() || ""
    ).trim();
    const rawApiKey = mappedProviderEntry.authConfig?.apiKey;
    const hasApiKey = typeof rawApiKey === "string" && rawApiKey.trim().length > 0;
    if (!hasApiKey || !resolvedApiUrl) {
      throw new Error("模型服务商配置不完整：缺少 apiKey 或 apiUrl");
    }
    throw new Error(`模型构建失败：适配器(${adapterId})未返回实例`);
  }

  return {
    model,
    modelInfo: { provider: resolvedProviderId, modelId: parsed.modelId },
    chatModelId: normalized,
    modelDefinition,
  };
}

/** Resolve chat model from local provider settings. */
async function resolveLocalChatModel(input: {
  chatModelId?: string | null;
}): Promise<ResolvedChatModel> {
  const providers = await getProviderSettings();
  const cliProviders = await buildCliProviderEntries();
  // 逻辑：CLI provider 仅在工具已安装时注入，避免 Auto 模式误选未安装的工具。
  const mergedProviders = [
    ...cliProviders.filter(
      (cliEntry) => !providers.some((entry) => entry.id === cliEntry.id),
    ),
    ...providers,
  ];
  return resolveChatModelFromProviders({
    providers: mergedProviders,
    chatModelId: input.chatModelId,
  });
}

/** Resolve chat model from cloud config. */
async function resolveCloudChatModel(input: {
  chatModelId?: string | null;
}): Promise<ResolvedChatModel> {
  const accessToken = (await ensureServerAccessToken()) ?? "";
  if (!accessToken) {
    throw new Error("未登录云端账号");
  }
  let saasBaseUrl: string;
  try {
    saasBaseUrl = getSaasBaseUrl();
  } catch {
    throw new Error("云端地址未配置");
  }
  const payload = (await fetchModelList(accessToken)) as CloudChatModelsResponse | null;
  if (!payload || payload.success !== true || !Array.isArray(payload.data?.data)) {
    throw new Error("云端模型列表获取失败");
  }
  const models = mapCloudChatModels(payload.data.data);
  const providers = await buildCloudProviderEntries({
    models,
    apiUrl: `${saasBaseUrl}/api`,
    apiKey: accessToken,
    adapterId: "openloaf-saas",
  });
  return resolveChatModelFromProviders({
    providers,
    chatModelId: input.chatModelId,
  });
}

/** Resolve chat model by selected source. */
export async function resolveChatModel(input: {
  chatModelId?: string | null;
  chatModelSource?: ChatModelSource | null;
}): Promise<ResolvedChatModel> {
  const source = normalizeChatModelSource(input.chatModelSource);
  if (source === "cloud") {
    return resolveCloudChatModel({ chatModelId: input.chatModelId });
  }
  return resolveLocalChatModel({ chatModelId: input.chatModelId });
}

/** Resolve chat model from an HTTP request body (picks chatModelId/chatModelSource). */
export async function resolveChatModelFromBody(
  body: Record<string, unknown>,
): Promise<ResolvedChatModel> {
  const chatModelId =
    typeof body.chatModelId === "string" ? body.chatModelId : undefined;
  const chatModelSource = (
    typeof body.chatModelSource === "string" ? body.chatModelSource : undefined
  ) as ChatModelSource | undefined;
  return resolveChatModel({ chatModelId, chatModelSource });
}
