/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { AiClient } from "@openloaf-saas/sdk";
import { getSaasClient } from "../../client";
import { getSaasBaseUrl } from "../../core/config";

// Types derived from the SDK so the local code stays aligned with upstream.
// SDK v0.2.2 narrowed chatCapabilities responses to v3MediaCapabilitiesResponseSchema,
// so features is a homogeneous array of v3FeatureSchema (always has `variants`).
type ChatCapabilitiesResponse = Awaited<ReturnType<AiClient["chatCapabilities"]>>;
type ChatCapabilitiesSuccess = Extract<ChatCapabilitiesResponse, { success: true }>;
type ChatVariant = ChatCapabilitiesSuccess["data"]["features"][number]["variants"][number];
type ChatInputSlot = ChatVariant["inputSlots"][number];

type ModelListPayload = {
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
    data: Array<{
      id: string;
      provider: string;
      displayName: string;
      /** Reasoning capability: "none" | "always" | "optional"；缺失视为 "none"。 */
      reasoning?: "none" | "always" | "optional";
      /** Fast model marker (SDK v0.2.4+ v3Variant.isFast)。标记低延迟 variant，供 channel
       * bridge 的 fast-ack / 超时 summarizer 选小模型，供首 token 延迟敏感场景。 */
      isFast?: boolean;
      /** Model capabilities (v3 capabilities + 本地扩展 inputAccepts)。 */
      capabilities?: Record<string, unknown>;
    }>;
    updatedAt?: string;
  };
};

type ModelsUpdatedAtPayload = {
  /** Success flag from SaaS. */
  success: false;
  /** Error message from SaaS. */
  message: string;
  /** Optional error code. */
  code?: string;
} | {
  /** Success flag from SaaS. */
  success: true;
  /** Updated-at payload. */
  data: {
    chatUpdatedAt: string;
    imageUpdatedAt: string;
    videoUpdatedAt: string;
    latestUpdatedAt: string;
  };
};

type FetchModelListOptions = {
  /** Force bypass in-memory cache. */
  force?: boolean;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cached = new Map<string, { updatedAt: number; payload: ModelListPayload }>();

/** Collect distinct accept types from v3 inputSlots, preserving v3 schema fidelity. */
function deriveInputAcceptsFromSlots(
  slots: readonly ChatInputSlot[] | undefined,
): string[] {
  if (!Array.isArray(slots) || slots.length === 0) return [];
  const seen = new Set<string>();
  for (const slot of slots) {
    if (slot.accept) seen.add(slot.accept);
  }
  return Array.from(seen);
}

/** Adapt v3 chat capabilities response to the legacy chatModels payload shape. */
function adaptV3ChatCapabilities(
  response: ChatCapabilitiesResponse,
): ModelListPayload {
  if (response.success !== true) {
    return {
      success: false,
      message: "saas_request_failed",
    };
  }
  const items: Array<{
    id: string;
    provider: string;
    displayName: string;
    reasoning?: "none" | "always" | "optional";
    isFast?: boolean;
    capabilities?: Record<string, unknown>;
  }> = [];
  for (const feature of response.data.features) {
    for (const variant of feature.variants) {
      // v3 不再返回真实 provider id，统一按 familyId 做分组 key（小写），
      // 既能触发 PROVIDER_ICON_MAP 图标查找，也能让同家族的 variant 落入同一
      // ProviderSettingEntry。familyId 缺失时回退到 variant id。
      const family = variant.familyId?.trim() || variant.id;
      // `reasoning` / `isFast` were added to v3VariantSchema across SDK 0.2.3–0.2.4;
      // the locally resolved SDK typings may still be older (nested pnpm copy) where
      // a field is absent from the type. The runtime payload carries them regardless,
      // so read through a narrow structural view to stay forward-compatible without a
      // blanket `any` cast.
      const reasoning = (variant as { reasoning?: "none" | "always" | "optional" })
        .reasoning;
      const isFast = (variant as { isFast?: boolean }).isFast;
      // v3 variant carries raw contextWindow (token count). Convert to
      // capabilities.common.maxContextK (thousand-token unit) so the frontend
      // model selector can render "128K" / "1M" badges like local providers do.
      const contextWindow = (variant as { contextWindow?: number }).contextWindow;
      const maxContextK =
        typeof contextWindow === "number" &&
        Number.isFinite(contextWindow) &&
        contextWindow > 0
          ? Math.round(contextWindow / 1000)
          : undefined;
      const inputAccepts = deriveInputAcceptsFromSlots(variant.inputSlots);
      const capabilities: Record<string, unknown> = {};
      if (maxContextK !== undefined) capabilities.common = { maxContextK };
      if (inputAccepts.length > 0) capabilities.inputAccepts = inputAccepts;
      items.push({
        id: variant.id,
        provider: family.toLowerCase(),
        displayName: variant.featureTabName,
        reasoning,
        isFast,
        capabilities: Object.keys(capabilities).length > 0 ? capabilities : undefined,
      });
    }
  }
  return {
    success: true,
    data: {
      data: items,
      updatedAt: response.data.updatedAt,
    },
  };
}

/** Fetch SaaS model list with in-memory cache. */
export async function fetchModelList(
  accessToken: string,
  options: FetchModelListOptions = {},
): Promise<ModelListPayload> {
  const force = options.force === true;
  const cachedEntry = cached.get(accessToken);
  if (!force && cachedEntry && Date.now() - cachedEntry.updatedAt < CACHE_TTL_MS) {
    return cachedEntry.payload;
  }
  const client = getSaasClient(accessToken);
  let payload: ModelListPayload;
  try {
    const raw = await client.ai.chatCapabilities();
    payload = adaptV3ChatCapabilities(raw);
  } catch {
    payload = { success: false, message: "saas_request_failed" };
  }
  cached.set(accessToken, { updatedAt: Date.now(), payload });
  // 逻辑：避免缓存无限增长，超过 20 条时清理最旧记录。
  if (cached.size > 20) {
    const entries = Array.from(cached.entries()).sort(
      (a, b) => a[1].updatedAt - b[1].updatedAt,
    );
    const overflow = cached.size - 20;
    for (let i = 0; i < overflow; i += 1) {
      cached.delete(entries[i]![0]);
    }
  }
  return payload;
}

/** Fetch SaaS models updated-at aggregate payload. */
export async function fetchModelsUpdatedAt(
  accessToken: string,
): Promise<ModelsUpdatedAtPayload> {
  const client = getSaasClient(accessToken);
  const aiClient = client.ai as {
    modelsUpdatedAt?: () => Promise<ModelsUpdatedAtPayload>;
  };
  if (typeof aiClient.modelsUpdatedAt === "function") {
    return aiClient.modelsUpdatedAt();
  }
  const baseUrl = getSaasBaseUrl();
  const requestUrl = new URL("/api/public/ai/models/updated-at", baseUrl).toString();
  const headers = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : undefined;
  const response = await fetch(requestUrl, { headers });
  const payload = (await response.json().catch(() => null)) as ModelsUpdatedAtPayload | null;
  if (!response.ok || !payload) {
    return {
      success: false,
      message: "saas_request_failed",
      code: String(response.status || 502),
    };
  }
  return payload;
}
