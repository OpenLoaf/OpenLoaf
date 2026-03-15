/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from "node:path";
import { isRecord } from "@/ai/shared/util";
import { resolveImageSaveDirectory, saveImageUrlsToDirectory } from "@/ai/services/image/imageStorage";
import {
  resolveVideoSaveDirectory,
  saveGeneratedVideoFromUrl,
} from "@/ai/services/video/videoStorage";
import { getOpenLoafRootDir } from "@openloaf/config";
import {
  cancelMediaTask,
  fetchImageModels,
  fetchVideoModels,
  pollMediaTask,
  submitMediaTask,
} from "./client";
import {
  clearMediaTask,
  getMediaTaskContext,
  loadBoardTasks,
  rememberMediaTask,
} from "./mediaTaskStore";

/** Convert an absolute file path to a global-root-relative path. */
function toGlobalRelativePath(filePath: string): string | null {
  const globalRoot = getOpenLoafRootDir();
  const rootResolved = path.resolve(globalRoot);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(rootResolved + path.sep)) return null;
  return path.relative(rootResolved, resolved).replace(/\\/g, "/");
}

export type MediaSubmitContext = {
  /** Project id for storage scoping. */
  projectId?: string;
  /** Save directory for generated assets. */
  saveDir?: string;
  /** Source node id for tracing. */
  sourceNodeId?: string;
};

/** HTTP error used by media proxy. */
export class MediaProxyHttpError extends Error {
  /** HTTP status code. */
  readonly status: number;
  /** Error code. */
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Check if error is a media proxy HTTP error. */
export function isMediaProxyHttpError(error: unknown): error is MediaProxyHttpError {
  return error instanceof MediaProxyHttpError;
}

/** Normalize input body into payload + context. */
function splitMediaSubmitBody(body: unknown): {
  payload: Record<string, unknown> | null;
  context: MediaSubmitContext;
} {
  if (!isRecord(body)) return { payload: null, context: {} };
  const {
    projectId,
    saveDir,
    sourceNodeId,
    ...payload
  } = body as Record<string, unknown>;
  return {
    payload,
    context: {
      projectId: typeof projectId === "string" ? projectId : undefined,
      saveDir: typeof saveDir === "string" ? saveDir : undefined,
      sourceNodeId: typeof sourceNodeId === "string" ? sourceNodeId : undefined,
    },
  };
}

/** Submit image generation via SaaS SDK. */
export async function submitImageProxy(
  body: unknown,
  accessToken: string,
): Promise<unknown> {
  const { payload, context } = splitMediaSubmitBody(body);
  if (!payload) {
    throw new MediaProxyHttpError(400, "invalid_payload", "请求参数无效");
  }
  const result = await submitMediaTask({ kind: "image", payload }, accessToken);
  // 逻辑：提交成功后记录上下文，供轮询阶段落库使用。
  if (result?.success === true && result.data?.taskId) {
    rememberMediaTask({
      taskId: result.data.taskId,
      resultType: "image",
      projectId: context.projectId,
      saveDir: context.saveDir,
      sourceNodeId: context.sourceNodeId,
      createdAt: Date.now(),
    });
  }
  return result;
}

/** Submit video generation via SaaS SDK. */
export async function submitVideoProxy(
  body: unknown,
  accessToken: string,
): Promise<unknown> {
  const { payload, context } = splitMediaSubmitBody(body);
  if (!payload) {
    throw new MediaProxyHttpError(400, "invalid_payload", "请求参数无效");
  }
  const result = await submitMediaTask({ kind: "video", payload }, accessToken);
  // 逻辑：提交成功后记录上下文，供轮询阶段落库使用。
  if (result?.success === true && result.data?.taskId) {
    rememberMediaTask({
      taskId: result.data.taskId,
      resultType: "video",
      projectId: context.projectId,
      saveDir: context.saveDir,
      sourceNodeId: context.sourceNodeId,
      createdAt: Date.now(),
    });
  }
  return result;
}

export type PollRecoveryHint = {
  /** Project id for lazy loading board tasks. */
  projectId?: string;
  /** Save directory for lazy loading board tasks. */
  saveDir?: string;
};

/** Poll SaaS task and persist assets if needed. */
export async function pollMediaProxy(
  taskId: string,
  accessToken: string,
  recoveryHint?: PollRecoveryHint,
): Promise<unknown> {
  if (!taskId) {
    throw new MediaProxyHttpError(400, "invalid_payload", "任务编号无效");
  }
  let ctx = getMediaTaskContext(taskId);
  // 逻辑：内存未命中时尝试从画布目录的 tasks.json 恢复（服务重启场景）。
  if (!ctx && recoveryHint?.projectId && recoveryHint?.saveDir) {
    loadBoardTasks(recoveryHint.projectId, recoveryHint.saveDir);
    ctx = getMediaTaskContext(taskId);
  }
  const result = await pollMediaTask(taskId, accessToken);
  const resultType = result.resultType ?? ctx?.resultType;
  let resultUrls = result.resultUrls;

  if (result.status === "succeeded" && resultUrls && resultUrls.length > 0) {
    const saveDir = (ctx?.saveDir ?? "").trim();
    if (!saveDir) {
      // 逻辑：未指定保存目录时直接返回 SaaS URL。
      clearMediaTask(taskId);
      return {
        success: true,
        data: {
          status: result.status,
          progress: result.progress,
          resultType: resultType,
          resultUrls,
          error: result.error,
        },
      };
    }

    if (resultType === "image") {
      const resolvedDir = await resolveImageSaveDirectory({
        imageSaveDir: saveDir,
        projectId: ctx?.projectId ?? null,
      });
      if (!resolvedDir) {
        throw new Error("保存目录无效");
      }
      // 逻辑：图片结果需要下载并落库到画布资产目录。
      const savedPaths = await saveImageUrlsToDirectory({
        urls: resultUrls,
        directory: resolvedDir,
      });
      if (ctx?.projectId) {
        // 逻辑：有 projectId 时返回 saveDir 相对路径，前端通过 projectId 加载。
        const normalizedSaveDir = saveDir.replace(/\\/g, "/").replace(/\/+$/, "");
        resultUrls = savedPaths.map((filePath) => {
          const fileName = path.basename(filePath);
          return normalizedSaveDir ? `${normalizedSaveDir}/${fileName}` : fileName;
        });
      } else {
        // 逻辑：无 projectId 时返回全局相对路径，前端通过 preview endpoint 全局加载。
        resultUrls = savedPaths.map((filePath) => {
          const relativePath = toGlobalRelativePath(filePath);
          return relativePath ?? path.basename(filePath);
        });
      }
    }

    if (resultType === "video") {
      const resolvedDir = await resolveVideoSaveDirectory({
        saveDir,
        projectId: ctx?.projectId ?? null,
      });
      if (!resolvedDir) {
        throw new Error("保存目录无效");
      }
      // 逻辑：视频仅保存首个结果，保持与现有前端流程一致。
      const saved = await saveGeneratedVideoFromUrl({
        url: resultUrls[0]!,
        directory: resolvedDir,
        fileNameBase: taskId,
      });
      if (ctx?.projectId) {
        // 逻辑：有 projectId 时返回 saveDir 相对路径。
        const normalizedSaveDir = saveDir.replace(/\\/g, "/").replace(/\/+$/, "");
        resultUrls = [
          normalizedSaveDir ? `${normalizedSaveDir}/${saved.fileName}` : saved.fileName,
        ];
      } else {
        // 逻辑：无 projectId 时返回全局相对路径。
        const savedFilePath = path.join(resolvedDir, saved.fileName);
        const relativePath = toGlobalRelativePath(savedFilePath);
        resultUrls = [relativePath ?? saved.fileName];
      }
    }

    // 逻辑：任务完成后清理上下文缓存。
    clearMediaTask(taskId);
  }

  if (result.status === "failed" || result.status === "canceled") {
    // 逻辑：失败/取消时清理上下文缓存。
    clearMediaTask(taskId);
  }

  return {
    success: true,
    data: {
      status: result.status,
      progress: result.progress,
      resultType: resultType,
      resultUrls,
      error: result.error,
    },
  };
}

/** Cancel SaaS media task. */
export async function cancelMediaProxy(
  taskId: string,
  accessToken: string,
): Promise<unknown> {
  if (!taskId) {
    throw new MediaProxyHttpError(400, "invalid_payload", "任务编号无效");
  }
  return cancelMediaTask(taskId, accessToken);
}

/** Fetch image model list. */
export async function fetchImageModelsProxy(
  accessToken: string,
  options?: { force?: boolean },
): Promise<unknown> {
  return fetchImageModels(accessToken, options);
}

/** Fetch video model list. */
export async function fetchVideoModelsProxy(
  accessToken: string,
  options?: { force?: boolean },
): Promise<unknown> {
  return fetchVideoModels(accessToken, options);
}
