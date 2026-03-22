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
import { getAccessToken } from "@/lib/saas-auth";

type FetchMediaModelsOptions = {
  /** Force bypass server cache. */
  force?: boolean;
};

/** Build auth headers for SaaS proxy. */
export async function buildAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Validate HTTP response and parse JSON. */
async function parseJsonResponse(response: Response): Promise<any> {
  if (!response.ok) {
    // 尝试从 response body 提取更详细的错误消息
    let detail = ''
    try {
      const body = await response.json()
      detail = body?.message || body?.error?.message || ''
    } catch { /* ignore parse failures */ }
    throw new Error(detail || `HTTP ${response.status}: ${response.statusText}`)
  }
  return response.json();
}

/** Fetch media models via unified endpoint (kept for AI chat model preferences). */
export async function fetchMediaModels(feature?: string, options?: FetchMediaModelsOptions) {
  const authHeaders = await buildAuthHeaders();
  const base = resolveServerUrl();
  const url = new URL(`${base}/ai/media/models`);
  if (feature) url.searchParams.set("feature", feature);
  if (options?.force) url.searchParams.set("force", "1");
  const response = await fetch(url.toString(), {
    credentials: "include",
    headers: authHeaders,
  });
  return parseJsonResponse(response);
}

type PollTaskOptions = {
  /** Project id for server-side context recovery. */
  projectId?: string;
  /** @deprecated Use boardId instead. */
  saveDir?: string;
  /** Board id — server resolves save path automatically. */
  boardId?: string;
};

/** Poll task status via v3 endpoint. */
export async function pollTask(taskId: string, options?: PollTaskOptions) {
  const base = resolveServerUrl();
  const authHeaders = await buildAuthHeaders();
  const url = new URL(`${base}/ai/v3/task/${taskId}`);
  if (options?.projectId) url.searchParams.set("projectId", options.projectId);
  if (options?.saveDir) url.searchParams.set("saveDir", options.saveDir);
  if (options?.boardId) url.searchParams.set("boardId", options.boardId);
  const response = await fetch(url.toString(), {
    credentials: "include",
    headers: authHeaders,
  });
  return parseJsonResponse(response);
}

/** Cancel a task via v3 endpoint. */
export async function cancelTask(taskId: string) {
  const base = resolveServerUrl();
  const authHeaders = await buildAuthHeaders();
  const response = await fetch(`${base}/ai/v3/task/${taskId}/cancel`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders,
  });
  return parseJsonResponse(response);
}

// ═══════════ v3 API functions ═══════════

/** v3 capability feature. */
export type V3Feature = {
  id: string
  displayName: string
  variants: V3Variant[]
}

/** v3 capability variant. */
export type V3Variant = {
  id: string
  displayName: string
  creditsPerCall: number
  minMembershipLevel: 'free' | 'lite' | 'pro' | 'premium' | 'infinity'
  capabilities?: Record<string, unknown>
}

/** v3 capabilities response. */
export type V3CapabilitiesData = {
  category: 'image' | 'video' | 'audio'
  features: V3Feature[]
  updatedAt: string
}

/** Fetch v3 capabilities for a media category. */
export async function fetchCapabilities(
  category: 'image' | 'video' | 'audio',
): Promise<V3CapabilitiesData> {
  const base = resolveServerUrl()
  const authHeaders = await buildAuthHeaders()
  const response = await fetch(`${base}/ai/v3/capabilities/${category}`, {
    credentials: 'include',
    headers: authHeaders,
  })
  const json = await parseJsonResponse(response)
  return json?.data ?? json
}

/** v3 generate request. */
export type V3GenerateRequest = {
  feature: string
  variant: string
  inputs?: Record<string, unknown>
  params?: Record<string, unknown>
  count?: number
  seed?: number
}

/** Submit a v3 generation task. */
export async function submitV3Generate(
  payload: V3GenerateRequest & {
    projectId?: string
    boardId?: string
    sourceNodeId?: string
  },
) {
  const base = resolveServerUrl()
  const authHeaders = await buildAuthHeaders()
  const response = await fetch(`${base}/ai/v3/generate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(payload),
  })
  return parseJsonResponse(response)
}

/** Cancel a v3 task. */
export async function cancelV3Task(taskId: string) {
  const base = resolveServerUrl()
  const authHeaders = await buildAuthHeaders()
  const response = await fetch(`${base}/ai/v3/task/${taskId}/cancel`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders,
  })
  return parseJsonResponse(response)
}

/** Poll a v3 task group. */
export async function pollV3TaskGroup(groupId: string) {
  const base = resolveServerUrl()
  const authHeaders = await buildAuthHeaders()
  const response = await fetch(`${base}/ai/v3/task-group/${groupId}`, {
    credentials: 'include',
    headers: authHeaders,
  })
  return parseJsonResponse(response)
}
