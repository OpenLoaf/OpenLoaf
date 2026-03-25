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

export type VideoDownloadPhase = "extracting" | "downloading" | "merging" | "done";

export type VideoDownloadProgressResult = {
  status: string;
  phase?: VideoDownloadPhase;
  progress?: number;
  info?: { title?: string };
  result?: {
    fileName: string;
    posterDataUrl?: string;
    width?: number;
    height?: number;
  };
  error?: string;
};

async function parseJsonResponse(response: Response) {
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.error || body?.message || "";
    } catch {
      // 逻辑：解析失败时回退到状态码描述，避免吞掉错误。
    }
    throw new Error(detail || `HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

/** 启动平台视频下载任务，返回 taskId。 */
export async function startVideoDownload(input: {
  url: string;
  boardFolderUri?: string;
  projectId?: string;
  boardId?: string;
}): Promise<string> {
  const baseUrl = resolveServerUrl() || "";
  const response = await fetch(`${baseUrl}/media/video-download/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await parseJsonResponse(response);
  if (!json.success || !json.data?.taskId) {
    throw new Error(json.error || "Failed to start download");
  }
  return json.data.taskId as string;
}

/** 轮询视频下载进度。 */
export async function pollVideoDownloadProgress(taskId: string): Promise<VideoDownloadProgressResult> {
  const baseUrl = resolveServerUrl() || "";
  const response = await fetch(
    `${baseUrl}/media/video-download/progress?taskId=${encodeURIComponent(taskId)}`,
  );
  const json = await parseJsonResponse(response);
  if (!json.success || !json.data) {
    throw new Error(json.error || "Failed to query download progress");
  }
  return json.data as VideoDownloadProgressResult;
}

/** 取消平台视频下载任务。 */
export async function cancelVideoDownload(taskId: string) {
  const baseUrl = resolveServerUrl() || "";
  await fetch(`${baseUrl}/media/video-download/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId }),
  });
}
