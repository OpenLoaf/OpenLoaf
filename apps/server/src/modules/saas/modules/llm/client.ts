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
  const payload = await client.ai.chatModels();
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
