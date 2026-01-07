import { getAbortSignal } from "@/ai/chat-stream/requestContext";
import { getModelDefinition, getProviderDefinition } from "@/ai/models/modelRegistry";
import {
  PROVIDER_ADAPTERS,
  type ProviderRequestInput,
  type ProviderTaskResult,
} from "@/ai/models/providerAdapters";
import { getProviderSettings, type ProviderSettingEntry } from "@/modules/settings/settingsService";

type ProviderRequestParams = {
  /** Provider id. */
  providerId: string;
  /** Model id. */
  modelId: string;
  /** Provider request payload. */
  input: ProviderRequestInput;
};

/** Resolve provider entry that enables the target model. */
function resolveProviderEntry(
  entries: ProviderSettingEntry[],
  providerId: string,
  modelId: string,
) {
  return entries.find(
    (entry) => entry.providerId === providerId && Boolean(entry.models[modelId]),
  );
}

/** Run provider request through adapter buildRequest. */
export async function runProviderRequest(
  params: ProviderRequestParams,
): Promise<ProviderTaskResult> {
  const providers = await getProviderSettings();
  const providerEntry = resolveProviderEntry(providers, params.providerId, params.modelId);
  if (!providerEntry) {
    throw new Error("未找到可用的服务商模型配置");
  }
  const providerDefinition = getProviderDefinition(params.providerId);
  const adapterId = providerDefinition?.adapterId ?? params.providerId;

  const adapter = PROVIDER_ADAPTERS[adapterId];
  if (!adapter) throw new Error("不支持的模型服务商");

  const modelDefinition =
    providerEntry.models[params.modelId] ??
    getModelDefinition(params.providerId, params.modelId);
  const request = adapter.buildRequest({
    provider: providerEntry,
    modelId: params.modelId,
    modelDefinition,
    providerDefinition,
    input: params.input,
  });
  if (!request) throw new Error("模型不支持请求方式");

  // 中文注释：统一使用 requestContext 的 abortSignal，便于取消请求。
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: getAbortSignal(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`模型请求失败: ${response.status} ${text}`);
  }
  return request.parseResponse(response);
}
