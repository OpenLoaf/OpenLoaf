import type {
  ProviderDefinition,
  ModelDefinition,
  ModelTag,
} from "@tenas-ai/api/common";

type SaasProviderTemplate = {
  id: string;
  label?: string;
  name?: string;
  category?: string;
  apiUrl?: string;
  authType?: string;
  adapter?: string;
  models: Array<{
    id: string;
    displayName?: string | null;
    tags?: string[];
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

let cachedProviders: ProviderDefinition[] | null = null;

/** Fetch provider templates from SaaS and convert to local format. */
export async function fetchProviderTemplates(
  saasUrl: string,
): Promise<ProviderDefinition[]> {
  if (cachedProviders) return cachedProviders;
  // 直接调用公开接口，无需认证。
  const url = `${saasUrl}/api/public/ai/providers`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`获取供应商模板失败: ${res.status}`);
  }
  const json = await res.json();
  if (!json.success || !json.data?.providers) {
    throw new Error("获取供应商模板失败: 响应格式异常");
  }
  const templates = json.data.providers as SaasProviderTemplate[];
  cachedProviders = templates.map(toProviderDefinition);
  return cachedProviders;
}

/** Invalidate cached providers so next fetch reloads from SaaS. */
export function invalidateProviderCache() {
  cachedProviders = null;
}

/** Convert SaaS template to local ProviderDefinition. */
function toProviderDefinition(
  template: SaasProviderTemplate,
): ProviderDefinition {
  return {
    ...template,
    adapterId: String((template as Record<string, unknown>).adapter ?? template.id),
    authConfig:
      template.authType === "hmac"
        ? { accessKeyId: "", secretAccessKey: "" }
        : { apiKey: "" },
    models: template.models.map(
      (model): ModelDefinition => ({
        ...model,
        // 逻辑：SaaS 返回 displayName 为空时回退 model id，避免 name 出现 null。
        name: model.displayName ?? model.id,
        tags: model.tags as ModelTag[],
        providerId: template.id,
      }),
    ),
  };
}
