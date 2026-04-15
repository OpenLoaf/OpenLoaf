/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { getSaasClient } from "../../client";
import { getSaasBaseUrl } from "../../core/config";

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

// v3 chat capabilities 响应最小形状 —— 只读取 variant 列表适配所需字段。
// SDK v0.1.46 没有 chatCapabilities 方法，通过 raw fetch 桥接；升到 v0.2.0 后
// 可替换为 `client.ai.chatCapabilities()`。
type V3ChatCapabilitiesResponse = {
  success: true;
  data: {
    category: "chat";
    features: Array<{
      id: string;
      variants: Array<{
        id: string;
        featureTabName: string;
        familyId?: string;
      }>;
    }>;
    updatedAt?: string;
  };
} | {
  success: false;
  message?: string;
};

/** Adapt v3 chat capabilities response to the legacy chatModels payload shape. */
function adaptV3ChatCapabilities(
  response: V3ChatCapabilitiesResponse,
): ModelListPayload {
  if (response.success !== true) {
    return {
      success: false,
      message: response.message ?? "saas_request_failed",
    };
  }
  const items: Array<{
    id: string;
    provider: string;
    displayName: string;
    tags: string[];
    capabilities?: Record<string, unknown>;
  }> = [];
  for (const feature of response.data.features) {
    for (const variant of feature.variants) {
      // 关键逻辑：v3 不再返回真实 provider id，统一按 familyId 做分组 key（小写），
      // 既能触发 PROVIDER_ICON_MAP 图标查找，也能让同家族的 variant 落入同一
      // ProviderSettingEntry。familyId 缺失时回退到 variant id。
      const family = variant.familyId?.trim() || variant.id;
      items.push({
        id: variant.id,
        provider: family.toLowerCase(),
        displayName: variant.featureTabName,
        // v3 已移除 tags / capabilities 字段 —— 依赖 reasoning 等 tag 的筛选器
        // 当前无数据源，后续接入新的 capability 标志位时在此处补齐。
        tags: [],
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
  const baseUrl = getSaasBaseUrl();
  const url = `${baseUrl}/api/ai/v3/capabilities/chat`;
  const headers = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : undefined;
  let payload: ModelListPayload;
  try {
    const resp = await fetch(url, { headers });
    const raw = (await resp.json().catch(() => null)) as
      | V3ChatCapabilitiesResponse
      | null;
    if (!resp.ok || !raw) {
      payload = {
        success: false,
        message: "saas_request_failed",
        code: String(resp.status || 502),
      };
    } else {
      payload = adaptV3ChatCapabilities(raw);
    }
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
