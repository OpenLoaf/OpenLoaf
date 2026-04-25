/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import {
  type ModelCapabilities,
  type ModelDefinition,
  type ModelReasoningCapability,
} from "@openloaf/api/common";

const REASONING_VALUES: ReadonlySet<ModelReasoningCapability> = new Set([
  "none",
  "always",
  "optional",
]);

const PROVIDER_ICON_MAP: Record<string, string> = {
  anthropic: "Claude",
  dashscope: "Qwen",
  deepseek: "DeepSeek",
  google: "Gemini",
  grok: "Grok",
  moonshot: "Moonshot",
  moonshotai: "Moonshot",
  "moonshotai-cn": "Moonshot",
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
  /** Reasoning capability state from SaaS (v3)。缺失视为 "none"。 */
  reasoning?: ModelReasoningCapability;
  /** Fast-variant marker from SaaS (v3Variant.isFast, SDK v0.2.4+)。标记低延迟
   * variant，供 channel bridge 的 fast-ack / 超时 summarizer 选小模型。 */
  isFast?: boolean;
  /** Raw capabilities from SaaS (含 inputAccepts 派生自 v3 inputSlots[].accept)。 */
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
      // 中文注释：reasoning 字段由 v3 capabilities 独立声明，未知取值时退为 "none"。
      reasoning: REASONING_VALUES.has(item.reasoning as ModelReasoningCapability)
        ? item.reasoning
        : undefined,
      // 中文注释：isFast 直接透传（SDK v0.2.4+），供 channel bridge 筛快速 variant。
      isFast: typeof item.isFast === "boolean" ? item.isFast : undefined,
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
