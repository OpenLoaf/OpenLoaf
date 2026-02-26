import {
  MODEL_TAG_LABELS,
  type ModelCapabilities,
  type ModelDefinition,
  type ModelTag,
} from "@openloaf/api/common";

const PROVIDER_ICON_MAP: Record<string, string> = {
  anthropic: "Claude",
  dashscope: "Qwen",
  deepseek: "DeepSeek",
  google: "Gemini",
  grok: "Grok",
  moonshot: "Moonshot",
  openai: "OpenAI",
  qwen: "Qwen",
  vercel: "V0",
  volcengine: "Volcengine",
  xai: "Grok",
};

/** Resolve icon-family id for cloud models. */
function resolveCloudFamilyId(item: CloudChatModelItem): string {
  const providerKey = typeof item.provider === "string" ? item.provider.trim().toLowerCase() : "";
  const providerIcon = providerKey ? PROVIDER_ICON_MAP[providerKey] : undefined;
  if (providerIcon) return providerIcon;
  // 中文注释：无法识别 provider 时回退到模型 id，至少保证唯一性。
  return typeof item.id === "string" && item.id.trim().length > 0 ? item.id : "LobeHub";
}

export type CloudChatModelItem = {
  /** Model id from SaaS. */
  id: string;
  /** Provider id from SaaS. */
  provider: string;
  /** Display name for UI. */
  displayName: string;
  /** Model family id from SaaS (e.g. "Qwen", "Claude"). */
  familyId?: string;
  /** Raw tags from SaaS. */
  tags: string[];
  /** Raw capabilities from SaaS. */
  capabilities?: ModelCapabilities;
};

export type CloudChatModelsResponse = {
  /** Success flag from SaaS. */
  success: false;
  /** Error message from SaaS. */
  message: string;
  /** Optional error code. */
  code?: string;
} | {
  /** Success flag from SaaS. */
  success: true;
  /** Cloud model list payload. */
  data: {
    data: CloudChatModelItem[];
    updatedAt?: string;
  };
};

/** Map SaaS chat models to local ModelDefinition. */
export function mapCloudChatModels(items: CloudChatModelItem[]): ModelDefinition[] {
  const tagSet = new Set(Object.keys(MODEL_TAG_LABELS) as ModelTag[]);
  const normalizeTags = (tags: string[]): ModelTag[] =>
    tags.filter((tag): tag is ModelTag => tagSet.has(tag as ModelTag));

  return (Array.isArray(items) ? items : [])
    // 中文注释：过滤缺少关键字段的记录，避免构建无效模型。
    .filter(
      (item) =>
        Boolean(item) &&
        typeof item.id === "string" &&
        item.id.trim().length > 0 &&
        typeof item.provider === "string" &&
        item.provider.trim().length > 0
    )
    .map((item) => ({
      id: item.id,
      name: item.displayName,
      familyId: item.familyId?.trim() || resolveCloudFamilyId(item),
      providerId: item.provider,
      // 中文注释：仅保留系统支持的标签，避免未知标签污染筛选。
      tags: normalizeTags(Array.isArray(item.tags) ? item.tags : []),
      // 中文注释：能力字段直接透传 SaaS 定义，避免本地推断。
      capabilities: item.capabilities,
    }));
}

/** Normalize SaaS chat model response into model list. */
export function normalizeCloudChatModels(
  payload?: CloudChatModelsResponse | null
): ModelDefinition[] {
  if (!payload || payload.success !== true || !Array.isArray(payload.data?.data)) {
    return [];
  }
  return mapCloudChatModels(payload.data.data);
}
