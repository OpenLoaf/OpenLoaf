import { resolveServerUrl } from "@/utils/server-url";
import type { SaasImageSubmitPayload, SaasVideoSubmitPayload } from "@tenas-ai/api/types/saasMedia";
import { getAccessToken } from "@/lib/saas-auth";

type FetchMediaModelsOptions = {
  /** Force bypass server cache. */
  force?: boolean;
};

/** Build auth headers for SaaS proxy. */
async function buildAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Build media model request URL with optional query. */
function buildModelRequestUrl(path: string, options?: FetchMediaModelsOptions): string {
  const base = resolveServerUrl();
  if (!base) {
    const query = options?.force ? "?force=1" : "";
    return `${path}${query}`;
  }
  const url = new URL(path, base);
  if (options?.force) {
    url.searchParams.set("force", "1");
  }
  return url.toString();
}

/** Submit an image generation task to SaaS proxy. */
export async function submitImageTask(payload: SaasImageSubmitPayload) {
  const base = resolveServerUrl();
  const authHeaders = await buildAuthHeaders();
  const response = await fetch(`${base}/ai/image`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(payload),
  });
  return response.json();
}

/** Submit a video generation task to SaaS proxy. */
export async function submitVideoTask(payload: SaasVideoSubmitPayload) {
  const base = resolveServerUrl();
  const authHeaders = await buildAuthHeaders();
  const response = await fetch(`${base}/ai/vedio`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(payload),
  });
  return response.json();
}

/** Poll task status from SaaS proxy. */
export async function pollTask(taskId: string) {
  const base = resolveServerUrl();
  const authHeaders = await buildAuthHeaders();
  const response = await fetch(`${base}/ai/task/${taskId}`, {
    credentials: "include",
    headers: authHeaders,
  });
  return response.json();
}

/** Cancel a task via SaaS proxy. */
export async function cancelTask(taskId: string) {
  const base = resolveServerUrl();
  const authHeaders = await buildAuthHeaders();
  const response = await fetch(`${base}/ai/task/${taskId}/cancel`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders,
  });
  return response.json();
}

/** Fetch image model list from SaaS proxy. */
export async function fetchImageModels(options?: FetchMediaModelsOptions) {
  const authHeaders = await buildAuthHeaders();
  const response = await fetch(buildModelRequestUrl("/ai/image/models", options), {
    credentials: "include",
    headers: authHeaders,
  });
  return response.json();
}

/** Fetch video model list from SaaS proxy. */
export async function fetchVideoModels(options?: FetchMediaModelsOptions) {
  const authHeaders = await buildAuthHeaders();
  const response = await fetch(buildModelRequestUrl("/ai/vedio/models", options), {
    credentials: "include",
    headers: authHeaders,
  });
  return response.json();
}
