import { MODEL_TAG_LABELS, type ModelDefinition, type ModelTag } from "@tenas-ai/api/common";

export type CloudChatModelItem = {
  /** Model id from SaaS. */
  id: string;
  /** Provider id from SaaS. */
  provider: string;
  /** Display name for UI. */
  displayName: string;
  /** Raw tags from SaaS. */
  tags: string[];
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
      familyId: item.id,
      providerId: item.provider,
      // 中文注释：仅保留系统支持的标签，避免未知标签污染筛选。
      tags: normalizeTags(Array.isArray(item.tags) ? item.tags : []),
      maxContextK: 0,
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
