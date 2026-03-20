/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { resolveServerUrl } from "@/utils/server-url";
import type { SaasAudioSubmitPayload, SaasImageSubmitPayload, SaasVideoSubmitPayload } from "@openloaf/api/types/saasMedia";
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

/** Validate HTTP response and parse JSON. */
async function parseJsonResponse(response: Response): Promise<any> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
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
  return parseJsonResponse(response);
}

/** Submit an audio generation task to SaaS proxy. */
export async function submitAudioTask(payload: SaasAudioSubmitPayload) {
  const base = resolveServerUrl();
  const authHeaders = await buildAuthHeaders();
  const response = await fetch(`${base}/ai/audio`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
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
  return parseJsonResponse(response);
}

type PollTaskOptions = {
  /** Project id for server-side context recovery. */
  projectId?: string;
  /** Save directory for server-side context recovery. */
  saveDir?: string;
};

/** Poll task status from SaaS proxy. */
export async function pollTask(taskId: string, options?: PollTaskOptions) {
  const base = resolveServerUrl();
  const authHeaders = await buildAuthHeaders();
  const url = new URL(`${base}/ai/task/${taskId}`);
  if (options?.projectId) url.searchParams.set("projectId", options.projectId);
  if (options?.saveDir) url.searchParams.set("saveDir", options.saveDir);
  const response = await fetch(url.toString(), {
    credentials: "include",
    headers: authHeaders,
  });
  return parseJsonResponse(response);
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
  return parseJsonResponse(response);
}

/** Fetch image model list from SaaS proxy. */
export async function fetchImageModels(options?: FetchMediaModelsOptions) {
  const authHeaders = await buildAuthHeaders();
  const response = await fetch(buildModelRequestUrl("/ai/image/models", options), {
    credentials: "include",
    headers: authHeaders,
  });
  return parseJsonResponse(response);
}

/** Fetch video model list from SaaS proxy. */
export async function fetchVideoModels(options?: FetchMediaModelsOptions) {
  const authHeaders = await buildAuthHeaders();
  const response = await fetch(buildModelRequestUrl("/ai/vedio/models", options), {
    credentials: "include",
    headers: authHeaders,
  });
  return parseJsonResponse(response);
}

/** Fetch audio model list from SaaS proxy. */
export async function fetchAudioModels(options?: FetchMediaModelsOptions) {
  const authHeaders = await buildAuthHeaders();
  const response = await fetch(buildModelRequestUrl("/ai/audio/models", options), {
    credentials: "include",
    headers: authHeaders,
  });
  return parseJsonResponse(response);
}
