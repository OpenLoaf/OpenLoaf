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
import { loadProjectImageBuffer } from "@/ai/services/image/attachmentResolver";
import {
  resolveVideoSaveDirectory,
  saveGeneratedVideoFromUrl,
} from "@/ai/services/video/videoStorage";
import { getOpenLoafRootDir } from "@openloaf/config";
import { readBasicConf, readS3Providers } from "@/modules/settings/openloafConfStore";
import { createS3StorageService, resolveS3ProviderConfig } from "@/modules/storage/s3StorageService";
import { logger } from "@/common/logger";
import {
  cancelMediaTask,
  fetchAudioModels,
  fetchImageModels,
  fetchVideoModels,
  pollMediaTask,
  submitMediaTask,
  submitMediaGenerateV2,
  fetchMediaModelsV2,
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
class MediaProxyHttpError extends Error {
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

// ---------------------------------------------------------------------------
// Local URL → S3 public URL / base64 resolution
// ---------------------------------------------------------------------------

/** Resolve active S3 storage service, or null if not configured. */
function resolveActiveS3() {
  const basic = readBasicConf();
  const activeId = basic.activeS3Id;
  if (!activeId) return null;
  const provider = readS3Providers().find((entry) => entry.id === activeId);
  if (!provider) return null;
  return createS3StorageService(resolveS3ProviderConfig(provider));
}

/** Check whether a URL is a local server address that the SaaS backend cannot access. */
function isLocalMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local')
    );
  } catch {
    return false;
  }
}

/**
 * Extract the relative file path from a local preview URL.
 * e.g. `http://127.0.0.1:23334/chat/attachments/preview?path=boards/board_xxx/asset/foo.jpg`
 *      → `boards/board_xxx/asset/foo.jpg`
 */
function extractPathFromLocalUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('path');
  } catch {
    return null;
  }
}

type ResolvedMediaInput = { url: string } | { base64: string; mediaType: string };

/**
 * Resolve a local image URL to either:
 *   1. S3 public URL (if S3 configured) — preferred
 *   2. base64 encoded data (fallback)
 *   3. Original URL (if not local or resolution fails)
 */
async function resolveLocalMediaInput(
  input: Record<string, unknown>,
  context: MediaSubmitContext,
): Promise<ResolvedMediaInput> {
  const url = typeof input.url === 'string' ? input.url : '';
  if (!url || !isLocalMediaUrl(url)) {
    return input as ResolvedMediaInput;
  }

  const relativePath = extractPathFromLocalUrl(url);
  if (!relativePath) {
    logger.warn({ url }, 'Cannot extract path from local media URL, passing as-is');
    return input as ResolvedMediaInput;
  }

  // Read file from disk
  const loaded = await loadProjectImageBuffer({
    path: relativePath,
    projectId: context.projectId,
  });
  if (!loaded) {
    logger.warn({ relativePath }, 'Failed to load local media file, passing URL as-is');
    return input as ResolvedMediaInput;
  }

  // Strategy 1: Upload to S3 if configured
  const s3 = resolveActiveS3();
  if (s3) {
    try {
      const key = `temp/media-input/${Date.now()}_${path.basename(relativePath)}`;
      const ref = await s3.putObject({
        key,
        body: loaded.buffer,
        contentType: loaded.mediaType,
        contentLength: loaded.buffer.length,
      });
      logger.debug({ key, url: ref.url }, 'Uploaded local media to S3');
      return { url: ref.url };
    } catch (err) {
      logger.warn({ err, relativePath }, 'S3 upload failed, falling back to base64');
    }
  }

  // Strategy 2: Base64 fallback
  const base64 = loaded.buffer.toString('base64');
  return { base64, mediaType: loaded.mediaType };
}

/** Process all image inputs in a media payload, resolving local URLs. */
async function resolvePayloadMediaInputs(
  payload: Record<string, unknown>,
  context: MediaSubmitContext,
): Promise<Record<string, unknown>> {
  // v2: referenceAudio (tts voice cloning) — at payload level, not inside inputs
  let topLevelChanged = false;
  if (isRecord(payload.referenceAudio) && typeof (payload.referenceAudio as any).url === "string") {
    const resolved = await resolveLocalMediaInput(payload.referenceAudio as Record<string, unknown>, context);
    if (resolved !== payload.referenceAudio) {
      payload = { ...payload, referenceAudio: resolved };
      topLevelChanged = true;
    }
  }

  const inputs = isRecord(payload.inputs) ? { ...payload.inputs } : null;
  if (!inputs) return topLevelChanged ? payload : payload;

  let changed = false;

  // Handle inputs.images (array of { url, base64, mediaType })
  if (Array.isArray(inputs.images)) {
    const resolved = await Promise.all(
      inputs.images.map(async (img: unknown) => {
        if (!isRecord(img) || typeof img.url !== 'string') return img;
        const result = await resolveLocalMediaInput(img as Record<string, unknown>, context);
        if (result !== img) changed = true;
        return result;
      }),
    );
    inputs.images = resolved;
  }

  // Handle inputs.startImage (single { url, base64, mediaType })
  if (isRecord(inputs.startImage) && typeof inputs.startImage.url === 'string') {
    const result = await resolveLocalMediaInput(inputs.startImage as Record<string, unknown>, context);
    if (result !== inputs.startImage) { inputs.startImage = result; changed = true; }
  }

  // Handle inputs.endImage
  if (isRecord(inputs.endImage) && typeof inputs.endImage.url === 'string') {
    const result = await resolveLocalMediaInput(inputs.endImage as Record<string, unknown>, context);
    if (result !== inputs.endImage) { inputs.endImage = result; changed = true; }
  }

  // Handle inputs.referenceVideo
  if (isRecord(inputs.referenceVideo) && typeof inputs.referenceVideo.url === 'string') {
    const result = await resolveLocalMediaInput(inputs.referenceVideo as Record<string, unknown>, context);
    if (result !== inputs.referenceVideo) { inputs.referenceVideo = result; changed = true; }
  }

  // v2: single image input (imageEdit, upscale, outpaint)
  if (isRecord(inputs.image) && typeof inputs.image.url === "string") {
    const resolved = await resolveLocalMediaInput(inputs.image as Record<string, unknown>, context);
    if (resolved !== inputs.image) { inputs.image = resolved; changed = true; }
  }
  // v2: mask input (imageEdit inpaint/erase)
  if (isRecord(inputs.mask) && typeof inputs.mask.url === "string") {
    const resolved = await resolveLocalMediaInput(inputs.mask as Record<string, unknown>, context);
    if (resolved !== inputs.mask) { inputs.mask = resolved; changed = true; }
  }
  // v2: person input (digitalHuman)
  if (isRecord(inputs.person) && typeof inputs.person.url === "string") {
    const resolved = await resolveLocalMediaInput(inputs.person as Record<string, unknown>, context);
    if (resolved !== inputs.person) { inputs.person = resolved; changed = true; }
  }
  // v2: audio input (digitalHuman)
  if (isRecord(inputs.audio) && typeof inputs.audio.url === "string") {
    const resolved = await resolveLocalMediaInput(inputs.audio as Record<string, unknown>, context);
    if (resolved !== inputs.audio) { inputs.audio = resolved; changed = true; }
  }

  if (!changed) return topLevelChanged ? payload : payload;
  return { ...payload, inputs };
}

/** Infer resultType from v2 feature for storage routing. */
function inferResultType(feature: string): "image" | "video" | "audio" {
  switch (feature) {
    case "imageGenerate":
    case "poster":
    case "imageEdit":
    case "upscale":
    case "outpaint":
      return "image";
    case "videoGenerate":
    case "digitalHuman":
      return "video";
    case "tts":
      return "audio";
    default:
      return "image";
  }
}

/** Submit media generate via v2 unified endpoint. */
export async function submitMediaGenerateProxy(
  body: unknown,
  accessToken: string,
): Promise<unknown> {
  const { payload, context } = splitMediaSubmitBody(body);
  if (!payload || typeof payload !== "object" || !("feature" in payload)) {
    throw new MediaProxyHttpError(
      400,
      "invalid_payload",
      "请求参数无效，缺少 feature 字段",
    );
  }

  const feature = (payload as Record<string, unknown>).feature as string;
  const resolvedPayload = await resolvePayloadMediaInputs(payload, context);
  const result = await submitMediaGenerateV2(
    resolvedPayload as any,
    accessToken,
  );

  if (result?.success === true && result.data?.taskId) {
    rememberMediaTask({
      taskId: result.data.taskId,
      feature,
      resultType: inferResultType(feature),
      projectId: context.projectId,
      saveDir: context.saveDir,
      sourceNodeId: context.sourceNodeId,
      createdAt: Date.now(),
    });
  }

  return result;
}

/** Fetch v2 media models (unified, with optional feature filter). */
export async function fetchMediaModelsProxy(
  accessToken: string,
  feature?: string,
): Promise<unknown> {
  return fetchMediaModelsV2(accessToken, feature);
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
  // 逻辑：本地 URL（localhost/127.0.0.1）SaaS 后端无法下载，
  // 有 S3 → 上传后用公开 URL 替换；无 S3 → 转 base64 兜底。
  const resolvedPayload = await resolvePayloadMediaInputs(payload, context);
  const result = await submitMediaTask({ kind: "image", payload: resolvedPayload }, accessToken);
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
  // 逻辑：同图片生成，解析本地 URL。
  const resolvedPayload = await resolvePayloadMediaInputs(payload, context);
  const result = await submitMediaTask({ kind: "video", payload: resolvedPayload }, accessToken);
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

/** Submit audio generation via SaaS SDK. */
export async function submitAudioProxy(
  body: unknown,
  accessToken: string,
): Promise<unknown> {
  const { payload, context } = splitMediaSubmitBody(body);
  if (!payload) {
    throw new MediaProxyHttpError(400, "invalid_payload", "请求参数无效");
  }
  const result = await submitMediaTask({ kind: "audio", payload }, accessToken);
  if (result?.success === true && result.data?.taskId) {
    rememberMediaTask({
      taskId: result.data.taskId,
      resultType: "audio",
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

    if (resultType === "audio") {
      const resolvedDir = await resolveVideoSaveDirectory({
        saveDir,
        projectId: ctx?.projectId ?? null,
      });
      if (!resolvedDir) {
        throw new Error("保存目录无效");
      }
      // 逻辑：音频仅保存首个结果，复用视频下载逻辑。
      const saved = await saveGeneratedVideoFromUrl({
        url: resultUrls[0]!,
        directory: resolvedDir,
        fileNameBase: taskId,
      });
      if (ctx?.projectId) {
        const normalizedSaveDir = saveDir.replace(/\\/g, "/").replace(/\/+$/, "");
        resultUrls = [
          normalizedSaveDir ? `${normalizedSaveDir}/${saved.fileName}` : saved.fileName,
        ];
      } else {
        const savedFilePath = path.join(resolvedDir, saved.fileName);
        const relativePath = toGlobalRelativePath(savedFilePath);
        resultUrls = [relativePath ?? saved.fileName];
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

/** Fetch audio model list. */
export async function fetchAudioModelsProxy(
  accessToken: string,
  options?: { force?: boolean },
): Promise<unknown> {
  return fetchAudioModels(accessToken, options);
}
