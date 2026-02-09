import { getSaasClient } from "../../client";

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

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cached = new Map<string, { updatedAt: number; payload: ModelListPayload }>();

/** Fetch SaaS model list with in-memory cache. */
export async function fetchModelList(accessToken: string): Promise<ModelListPayload> {
  const cachedEntry = cached.get(accessToken);
  if (cachedEntry && Date.now() - cachedEntry.updatedAt < CACHE_TTL_MS) {
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
