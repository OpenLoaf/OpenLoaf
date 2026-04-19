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
      tags: string[];
      /** Reasoning capability: "none" | "always" | "optional"；缺失视为 "none"。 */
      reasoning?: "none" | "always" | "optional";
      /** Model capabilities. */
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

// inputSlot role → ModelTag mapping. Only media inputs are tagged; text/prompt
// slots are omitted because every chat variant has them.
const SLOT_ROLE_TO_TAG: Record<string, string> = {
  image: "image_input",
  video: "video_analysis",
  audio: "audio_analysis",
};

/** Derive media capability tags from v3 inputSlots. */
function deriveTagsFromSlots(slots: readonly ChatInputSlot[] | undefined): string[] {
  if (!Array.isArray(slots) || slots.length === 0) return [];
  const seen = new Set<string>();
  for (const slot of slots) {
    const tag = slot.role ? SLOT_ROLE_TO_TAG[slot.role] : undefined;
    if (tag) seen.add(tag);
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
    tags: string[];
    reasoning?: "none" | "always" | "optional";
    capabilities?: Record<string, unknown>;
  }> = [];
  for (const feature of response.data.features) {
    for (const variant of feature.variants) {
      // v3 不再返回真实 provider id，统一按 familyId 做分组 key（小写），
      // 既能触发 PROVIDER_ICON_MAP 图标查找，也能让同家族的 variant 落入同一
      // ProviderSettingEntry。familyId 缺失时回退到 variant id。
      const family = variant.familyId?.trim() || variant.id;
      // `reasoning` was added to v3VariantSchema in SDK 0.2.3; the locally
      // resolved SDK typings may still be 0.2.2 (nested pnpm copy) where the
      // field is absent from the type. The runtime payload from SaaS carries
      // it regardless, so read through a narrow structural view to stay
      // forward-compatible without a blanket `any` cast.
      const reasoning = (variant as { reasoning?: "none" | "always" | "optional" })
        .reasoning;
      items.push({
        id: variant.id,
        provider: family.toLowerCase(),
        displayName: variant.featureTabName,
        tags: deriveTagsFromSlots(variant.inputSlots),
        reasoning,
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
