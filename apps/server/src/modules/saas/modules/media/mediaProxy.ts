/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import {
  buildBoardAssetRelativePath,
  resolveBoardDirFromDb,
  resolveBoardScopedRoot,
} from "@openloaf/api/common/boardPaths";
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
  fetchMediaModelsV2,
  uploadMediaFile,
  fetchCapabilitiesV3,
  submitV3Generate,
  pollV3Task,
  cancelV3Task,
  pollV3TaskGroup,
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
  /** Board id — used to resolve saveDir when saveDir is not provided. */
  boardId?: string;
  /** Source node id for tracing. */
  sourceNodeId?: string;
};

/** Extension → MIME type mapping for path-based media inputs. */
export const MEDIA_TYPE_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.flac': 'audio/flac',
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
    boardId,
    sourceNodeId,
    ...payload
  } = body as Record<string, unknown>;
  // 逻辑：优先使用 boardId 构建 saveDir，向后兼容直接传入 saveDir 的老客户端。
  let resolvedSaveDir = typeof saveDir === "string" ? saveDir : undefined;
  if (!resolvedSaveDir && typeof boardId === "string" && boardId) {
    const boardRoot = resolveBoardScopedRoot(typeof projectId === "string" ? projectId : undefined);
    resolvedSaveDir = buildBoardAssetRelativePath(boardRoot, boardId);
  }
  return {
    payload,
    context: {
      projectId: typeof projectId === "string" ? projectId : undefined,
      saveDir: resolvedSaveDir,
      boardId: typeof boardId === "string" ? boardId : undefined,
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
 * Upload a buffer via S3/SDK or fall back to base64 inline.
 *
 * Strategy (in order):
 *   1. Local S3 configured → upload to S3, return public URL
 *   2. No S3 → upload via SaaS SDK `sdk.ai.uploadFile()`, return CDN URL
 *   3. uploadFile not available/fails → base64 inline fallback
 */
export async function uploadOrInlineBuffer(
  buffer: Buffer,
  fileName: string,
  mediaType: string,
  context: MediaSubmitContext,
  accessToken?: string,
): Promise<ResolvedMediaInput> {
  // Strategy 1: Upload to local S3 if configured
  const s3 = resolveActiveS3();
  if (s3) {
    try {
      const key = `temp/media-input/${Date.now()}_${fileName}`;
      const ref = await s3.putObject({
        key,
        body: buffer,
        contentType: mediaType,
        contentLength: buffer.length,
      });
      logger.debug({ key, url: ref.url }, 'Uploaded local media to S3');
      return { url: ref.url };
    } catch (err) {
      logger.warn({ err, fileName }, 'S3 upload failed, trying SDK uploadFile');
    }
  }

  // Strategy 2: Upload via SaaS SDK uploadFile
  if (accessToken) {
    try {
      const cdnUrl = await uploadMediaFile(buffer, fileName, mediaType, accessToken);
      logger.debug({ fileName, url: cdnUrl }, 'Uploaded local media via SDK uploadFile');
      return { url: cdnUrl };
    } catch (err) {
      logger.warn({ err, fileName }, 'SDK uploadFile failed, falling back to base64');
    }
  }

  // Strategy 3: Base64 fallback
  return { base64: buffer.toString('base64'), mediaType };
}

/**
 * Resolve a local/relative media input to a publicly accessible format.
 *
 * Supports two input formats:
 *   - `{ path: "asset/xxx.jpg" }` — board-relative path, read directly from disk
 *   - `{ url: "http://127.0.0.1:..." }` — local URL, fetched via loadProjectImageBuffer
 *
 * Non-local URLs (http/https external) and data: URLs are passed through unchanged.
 */
async function resolveLocalMediaInput(
  input: Record<string, unknown>,
  context: MediaSubmitContext,
  accessToken?: string,
): Promise<ResolvedMediaInput> {
  // ── path-based input (board-relative path like "asset/xxx.jpg") ──
  const inputPath = typeof input.path === 'string' ? input.path.trim() : '';
  if (inputPath) {
    const boardId = context.boardId;
    if (!boardId) {
      logger.warn({ path: inputPath }, 'path input requires boardId in context');
      return input as ResolvedMediaInput;
    }
    const boardResult = await resolveBoardDirFromDb(boardId);
    if (!boardResult) {
      logger.warn({ boardId, path: inputPath }, 'Board not found for path input');
      return input as ResolvedMediaInput;
    }
    const absPath = path.resolve(boardResult.absDir, inputPath);
    if (!absPath.startsWith(path.resolve(boardResult.absDir) + path.sep)) {
      logger.warn({ absPath, boardDir: boardResult.absDir }, 'Path traversal rejected');
      return input as ResolvedMediaInput;
    }
    try {
      const buffer = await fsPromises.readFile(absPath);
      const ext = path.extname(absPath).toLowerCase();
      const mediaType = MEDIA_TYPE_MAP[ext] || 'application/octet-stream';
      return await uploadOrInlineBuffer(Buffer.from(buffer), path.basename(absPath), mediaType, context, accessToken);
    } catch (err) {
      logger.warn({ err, absPath }, 'Failed to read board asset file');
      return input as ResolvedMediaInput;
    }
  }

  // ── url-based input (existing logic) ──
  const url = typeof input.url === 'string' ? input.url : '';

  // data: URLs — already inline, pass through
  if (url.startsWith('data:')) return input as ResolvedMediaInput;

  // External URLs (not local) — pass through
  if (url && !isLocalMediaUrl(url) && (url.startsWith('http://') || url.startsWith('https://'))) {
    return input as ResolvedMediaInput;
  }

  // No URL or local URL — need to resolve
  if (!url) return input as ResolvedMediaInput;

  // Deprecated: localhost URL self-fetch — prefer path-based input
  logger.warn({ url }, 'Deprecated: localhost URL media input, use { path } instead');

  const relativePath = extractPathFromLocalUrl(url);
  if (!relativePath) {
    logger.warn({ url }, 'Cannot extract path from local media URL');
    return input as ResolvedMediaInput;
  }

  // Read file from disk
  const loaded = await loadProjectImageBuffer({
    path: relativePath,
    projectId: context.projectId,
  });
  if (!loaded) {
    logger.warn({ relativePath }, 'Failed to load local media file');
    return input as ResolvedMediaInput;
  }

  return await uploadOrInlineBuffer(loaded.buffer, path.basename(relativePath), loaded.mediaType, context, accessToken);
}

/** Infer resultType from v2 feature for storage routing. */
function inferResultType(feature: string): "image" | "video" | "audio" {
  switch (feature) {
    case "imageGenerate":
    case "poster":
    case "imageEdit":
    case "upscale":
    case "outpaint":
    case "matting":
      return "image";
    case "videoGenerate":
    case "videoEdit":
    case "digitalHuman":
    case "motionTransfer":
      return "video";
    case "tts":
    case "music":
    case "sfx":
      return "audio";
    default:
      return "image";
  }
}

/** Fetch v2 media models (unified, with optional feature filter). */
export async function fetchMediaModelsProxy(
  accessToken: string,
  feature?: string,
): Promise<unknown> {
  return fetchMediaModelsV2(accessToken, feature);
}

export type PollRecoveryHint = {
  /** Project id for lazy loading board tasks. */
  projectId?: string
  /** Save directory for lazy loading board tasks. */
  saveDir?: string
  /** Board id — used to resolve saveDir when saveDir is not provided. */
  boardId?: string
}

// ═══════════ Media v3 proxy functions ═══════════

/** Fetch v3 capabilities for a given media category. */
export async function fetchCapabilitiesProxy(
  category: 'image' | 'video' | 'audio',
  accessToken: string,
): Promise<unknown> {
  return fetchCapabilitiesV3(category, accessToken);
}

/** Submit v3 media generation task with local URL resolution. */
export async function submitV3GenerateProxy(
  body: unknown,
  accessToken: string,
): Promise<unknown> {
  const { payload, context } = splitMediaSubmitBody(body);
  if (!payload || typeof payload !== "object") {
    throw new MediaProxyHttpError(
      400,
      "invalid_payload",
      "请求参数无效",
    );
  }

  // 直接透传 payload，前端已通过 /ai/v3/media/upload 上传所有媒体为公网 URL
  const result = await submitV3Generate(payload, accessToken);

  // 逻辑：提交成功时记住任务上下文，便于后续 poll 时进行资产持久化。
  if (result?.data && 'taskId' in result.data) {
    const feature = (payload as Record<string, unknown>).feature as string | undefined;
    rememberMediaTask({
      taskId: result.data.taskId,
      feature: feature ?? undefined,
      resultType: feature ? inferResultType(feature) : undefined,
      projectId: context.projectId,
      saveDir: context.saveDir,
      sourceNodeId: context.sourceNodeId,
      createdAt: Date.now(),
    });
  }

  return result;
}

/** Poll v3 task and persist assets if needed. */
export async function pollV3TaskProxy(
  taskId: string,
  accessToken: string,
  recoveryHint?: PollRecoveryHint,
): Promise<unknown> {
  if (!taskId) {
    throw new MediaProxyHttpError(400, "invalid_payload", "任务编号无效");
  }

  let ctx = getMediaTaskContext(taskId);
  // 逻辑：内存未命中时尝试从画布目录的 tasks.json 恢复（服务重启场景）。
  const hintSaveDir = recoveryHint?.saveDir
    || (recoveryHint?.boardId
      ? buildBoardAssetRelativePath(
          resolveBoardScopedRoot(recoveryHint.projectId),
          recoveryHint.boardId,
        )
      : undefined);
  if (!ctx && recoveryHint?.projectId && hintSaveDir) {
    loadBoardTasks(recoveryHint.projectId, hintSaveDir);
    ctx = getMediaTaskContext(taskId);
  }

  const response = await pollV3Task(taskId, accessToken);
  if (!response?.data) {
    return {
      success: false,
      message: "任务查询失败",
    };
  }

  const data = response.data;
  const feature = ctx?.feature;
  const resultType = feature ? inferResultType(feature) : ctx?.resultType;
  let resultUrls: string[] | undefined = data.resultUrls;

  if (data.status === "succeeded" && resultUrls && resultUrls.length > 0) {
    const saveDir = (ctx?.saveDir ?? "").trim();
    if (!saveDir) {
      // 逻辑：未指定保存目录时直接返回 SaaS URL。
      clearMediaTask(taskId);
      return {
        success: true,
        data: {
          taskId: data.taskId ?? taskId,
          status: data.status,
          resultType,
          resultUrls,
          creditsConsumed: data.creditsConsumed,
          error: data.error,
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
        const normalizedSaveDir = saveDir.replace(/\\/g, "/").replace(/\/+$/, "");
        resultUrls = savedPaths.map((filePath) => {
          const fileName = path.basename(filePath);
          return normalizedSaveDir ? `${normalizedSaveDir}/${fileName}` : fileName;
        });
      } else {
        // 逻辑：无 projectId 时返回 board-relative 路径（如 "asset/xxx.png"），
        // 以便前端 isBoardRelativePath 识别并使用画布预览端点。
        const assetDirName = path.basename(saveDir.replace(/\/+$/, ""));
        resultUrls = savedPaths.map((filePath) => {
          const fileName = path.basename(filePath);
          return `${assetDirName}/${fileName}`;
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
        const assetDirName = path.basename(saveDir.replace(/\/+$/, ""));
        resultUrls = [`${assetDirName}/${saved.fileName}`];
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
        const normalizedSaveDir = saveDir.replace(/\\/g, "/").replace(/\/+$/, "");
        resultUrls = [
          normalizedSaveDir ? `${normalizedSaveDir}/${saved.fileName}` : saved.fileName,
        ];
      } else {
        const assetDirName = path.basename(saveDir.replace(/\/+$/, ""));
        resultUrls = [`${assetDirName}/${saved.fileName}`];
      }
    }

    // 逻辑：任务完成后清理上下文缓存。
    clearMediaTask(taskId);
  }

  if (data.status === "failed" || data.status === "canceled") {
    // 逻辑：失败/取消时清理上下文缓存。
    clearMediaTask(taskId);
  }

  return {
    success: true,
    data: {
      taskId: data.taskId ?? taskId,
      status: data.status,
      resultType,
      resultUrls,
      creditsConsumed: data.creditsConsumed,
      error: data.error,
    },
  };
}

/** Cancel v3 media task. */
export async function cancelV3TaskProxy(
  taskId: string,
  accessToken: string,
): Promise<unknown> {
  if (!taskId) {
    throw new MediaProxyHttpError(400, "invalid_payload", "任务编号无效");
  }
  return cancelV3Task(taskId, accessToken);
}

/** Poll v3 task group. */
export async function pollV3TaskGroupProxy(
  groupId: string,
  accessToken: string,
): Promise<unknown> {
  if (!groupId) {
    throw new MediaProxyHttpError(400, "invalid_payload", "任务组编号无效");
  }
  return pollV3TaskGroup(groupId, accessToken);
}

