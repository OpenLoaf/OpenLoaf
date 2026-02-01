import { getAccessToken } from "@/modules/auth/tokenStore";
import { getSaasClient } from "../../client";
import { getSaasBaseUrl } from "../../core/config";

type ModelListPayload = {
  /** Success flag from SaaS. */
  success: boolean;
  /** Cloud model list payload. */
  data: unknown[];
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cached: { updatedAt: number; payload: ModelListPayload | null } = {
  updatedAt: 0,
  payload: null,
};

/** Fetch LLM balance info via SaaS SDK. */
export async function fetchBalance() {
  // 逻辑：统一走 SDK 并复用缓存 client。
  const client = getSaasClient();
  return client.llm.balance();
}

/** Fetch SaaS model list with in-memory cache. */
export async function fetchModelList(): Promise<ModelListPayload> {
  const now = Date.now();
  if (cached.payload && now - cached.updatedAt < CACHE_TTL_MS) {
    return cached.payload;
  }
  const baseUrl = getSaasBaseUrl();
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  // 逻辑：允许匿名访问，存在 access token 时再附带鉴权头。
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${baseUrl}/api/llm/models`, { headers });
  const payload = (await response.json().catch(() => null)) as ModelListPayload | null;
  if (!response.ok || !payload) {
    return cached.payload ?? { success: false, data: [] };
  }
  cached = { updatedAt: now, payload };
  return payload;
}
