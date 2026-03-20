/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../engine/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Loader2, X, RotateCw, Trash2 } from "lucide-react";
import { trpcClient } from "@/utils/trpc";
import { resolveServerUrl } from "@/utils/server-url";
import { fetchVideoMetadata } from "@/components/file/lib/video-metadata";
import { cancelTask, pollTask } from "@/lib/saas-media";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";
import {
  formatScopedProjectPath,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import { useBoardContext } from "../core/BoardProvider";
import { DEFAULT_NODE_SIZE } from "../engine/constants";
import { buildImageNodePayloadFromUri } from "../utils/image";
import { NodeFrame } from "./NodeFrame";

/** Loading node type identifier. */
export const LOADING_NODE_TYPE = "loading";

export type LoadingTaskType = "video_generate" | "image_generate" | "video_download" | "upscale" | "audio_generate";

export type LoadingNodeProps = {
  /** Loading task id. */
  taskId?: string;
  /** Loading task type. */
  taskType?: LoadingTaskType;
  /** Source node id. */
  sourceNodeId?: string;
  /** Prompt used for the task. */
  promptText?: string;
  /** Chat model id (profileId:modelId). */
  chatModelId?: string;
  /** Project id for file operations. */
  projectId?: string;
  /** Save directory for generated assets. */
  saveDir?: string;
};

const LoadingNodeSchema = z.object({
  taskId: z.string().optional(),
  taskType: z.enum(["video_generate", "image_generate", "video_download", "upscale", "audio_generate"]).optional(),
  sourceNodeId: z.string().optional(),
  promptText: z.string().optional(),
  chatModelId: z.string().optional(),
  projectId: z.string().optional(),
  saveDir: z.string().optional(),
});

/** Default loading container size. */
const LOADING_NODE_SIZE: [number, number] = DEFAULT_NODE_SIZE;

/** Remove the loading node and its connectors. */
function clearLoadingNode(engine: any, loadingNodeId: string) {
  const connectorIds = engine.doc
    .getElements()
    .filter((item: any) => item.kind === "connector")
    .filter((item: any) => {
      const sourceId = "elementId" in item.source ? item.source.elementId : null;
      const targetId = "elementId" in item.target ? item.target.elementId : null;
      return sourceId === loadingNodeId || targetId === loadingNodeId;
    })
    .map((item: any) => item.id);
  if (connectorIds.length > 0) {
    engine.doc.deleteElements(connectorIds);
  }
  engine.doc.deleteElement(loadingNodeId);
}

/** Compute poll delay with exponential backoff. */
function getPollDelay(attempt: number): number {
  // 前 30 次 2s，之后逐步增加到 5s、10s
  if (attempt < 30) return 2000;
  if (attempt < 60) return 5000;
  return 10000;
}

/** Compute a fitted size that preserves the original aspect ratio. */
function fitVideoSize(width: number, height: number, maxDimension: number): [number, number] {
  if (width <= 0 || height <= 0) return [maxDimension, Math.round(maxDimension * (9 / 16))];
  const scale = Math.min(maxDimension / width, maxDimension / height);
  return [Math.round(width * scale), Math.round(height * scale)];
}

/** Restart a video download task and return the new taskId. */
async function restartVideoDownload(ctx: {
  url: string;
  saveDir: string;
  projectId: string;
  boardId?: string;
}): Promise<string> {
  const baseUrl = resolveServerUrl();
  const prefix = baseUrl || "";

  // saveDir is boardFolderUri/asset — extract boardFolderUri
  const boardFolderUri = ctx.saveDir.replace(/\/asset\/?$/, "") || undefined;

  const res = await fetch(`${prefix}/media/video-download/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: ctx.url,
      boardFolderUri,
      projectId: ctx.projectId || undefined,
      boardId: ctx.boardId || undefined,
    }),
  });
  const json = await res.json();
  if (!json.success || !json.data?.taskId) {
    throw new Error(json.error || "Failed to restart download");
  }
  return json.data.taskId;
}

/** Poll video download progress from the server. */
async function pollVideoDownload(
  controller: AbortController,
  taskId: string,
  loadingNodeId: string,
  engine: any,
  ctx: {
    projectId: string;
    saveDir: string;
    downloadUrl: string;
    boardId?: string;
    xywhRef: React.RefObject<[number, number, number, number]>;
    tRef: React.RefObject<(key: string) => string>;
    onProgress: (percent: number, phase: string) => void;
  },
) {
  const baseUrl = resolveServerUrl();
  const prefix = baseUrl || "";
  const maxAttempts = 300;
  const maxRestarts = 3;
  let currentTaskId = taskId;
  let restartCount = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (controller.signal.aborted) {
      throw new Error(ctx.tRef.current('loading.cancelled'));
    }

    const res = await fetch(
      `${prefix}/media/video-download/progress?taskId=${encodeURIComponent(currentTaskId)}`,
    );
    if (!res.ok) {
      // 404 means server restarted and lost the task — restart the download
      if (res.status === 404 && ctx.downloadUrl && restartCount < maxRestarts) {
        restartCount += 1;
        currentTaskId = await restartVideoDownload({
          url: ctx.downloadUrl,
          saveDir: ctx.saveDir,
          projectId: ctx.projectId,
          boardId: ctx.boardId,
        });
        // Update the loading node props so the new taskId persists
        engine.doc.updateNodeProps(loadingNodeId, { taskId: currentTaskId });
        ctx.onProgress(0, 'extracting');
        attempt = 0; // 重置计数器，新任务重新开始
        continue;
      }
      throw new Error(ctx.tRef.current('loading.queryFailed'));
    }
    const json = await res.json();
    if (!json.success || !json.data) {
      throw new Error(ctx.tRef.current('loading.queryFailed'));
    }

    const { status, progress, result, error, phase } = json.data;

    if (typeof progress === "number") {
      ctx.onProgress(progress, phase || 'downloading');
    }

    if (status === "completed" && result) {
      ctx.onProgress(100, 'done');
      const fileName = result.fileName || "";
      const boardRelativePath = `${BOARD_ASSETS_DIR_NAME}/${fileName}`;

      // 逻辑：服务端已在下载完成后通过 ffprobe/ffmpeg 提取缩略图和尺寸，
      // 直接使用 result 中的数据，不再依赖客户端 tRPC 查询。
      const posterPath = result.posterDataUrl || "";
      const naturalWidth = result.width || 16;
      const naturalHeight = result.height || 9;

      const DEFAULT_VIDEO_NODE_MAX = 420;
      const [nodeW, nodeH] = fitVideoSize(naturalWidth, naturalHeight, DEFAULT_VIDEO_NODE_MAX);
      const [x, y] = ctx.xywhRef.current;

      engine.addNodeElement(
        "video",
        {
          sourcePath: boardRelativePath,
          fileName,
          posterPath: posterPath || undefined,
          naturalWidth,
          naturalHeight,
        },
        [x, y, nodeW, nodeH],
      );

      // 逻辑：HLS 预转码由服务端下载完成后自动触发，无需客户端处理。
      clearLoadingNode(engine, loadingNodeId);
      return;
    }

    if (status === "failed") {
      throw new Error(error || ctx.tRef.current('loading.failed'));
    }

    await new Promise((resolve) => setTimeout(resolve, getPollDelay(attempt)));
  }

  throw new Error(ctx.tRef.current('loading.videoTimeout'));
}

/** Render the loading node. */
export function LoadingNodeView({ element }: CanvasNodeViewProps<LoadingNodeProps>) {
  const { t } = useTranslation('board');
  const { engine } = useBoardContext();
  const [isRunning, setIsRunning] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(-1);
  const [downloadPhase, setDownloadPhase] = useState<string>("extracting");
  const abortControllerRef = useRef<AbortController | null>(null);

  // 逻辑：用 ref 持有可变值，避免它们出现在 useEffect 依赖中导致轮询被意外重启。
  const tRef = useRef(t);
  tRef.current = t;
  const xywhRef = useRef(element.xywh);
  xywhRef.current = element.xywh;

  const taskId = element.props.taskId ?? "";
  const taskType = element.props.taskType ?? "video_generate";
  const promptText = (element.props.promptText ?? "").trim();
  const sourceNodeId = element.props.sourceNodeId ?? "";
  const projectId = element.props.projectId ?? "";
  const saveDir = element.props.saveDir ?? "";

  const promptLabel = promptText || t('loading.processing');

  const canRun = Boolean(
    taskId && (taskType === "video_generate" || taskType === "image_generate" || taskType === "video_download" || taskType === "upscale" || taskType === "audio_generate")
  );

  useEffect(() => {
    if (!canRun) return;
    if (abortControllerRef.current) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsRunning(true);
    setErrorText("");
    let finished = false;

    const run = async () => {
      try {
        if (taskType === "video_download") {
          await pollVideoDownload(controller, taskId, element.id, engine, {
            projectId,
            saveDir,
            downloadUrl: promptText,
            xywhRef,
            tRef,
            onProgress: (pct, phase) => {
              setDownloadProgress(pct);
              setDownloadPhase(phase);
            },
          });
          return;
        }
        const maxAttempts = 300;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          if (controller.signal.aborted) {
            throw new Error(tRef.current('loading.cancelled'));
          }
          const status = await pollTask(taskId, {
            projectId: projectId || undefined,
            saveDir: saveDir || undefined,
          });

          // 逻辑：HTTP 错误或无效响应时直接失败，不盲等。
          if (!status || status.success !== true || !status.data) {
            throw new Error(tRef.current('loading.queryFailed'));
          }

          // 逻辑：任务不存在（404 语义），可能是服务端重启后丢失上下文。
          if (status.data.status === "not_found") {
            throw new Error(tRef.current('loading.queryFailed'));
          }

          if (status.data.status === "succeeded") {
            const resultUrls = Array.isArray(status.data.resultUrls)
              ? status.data.resultUrls.filter(
                  (url: unknown): url is string =>
                    typeof url === "string" && url.trim().length > 0
                )
              : [];
            if (resultUrls.length === 0) {
              throw new Error(
                taskType === "image_generate"
                  ? tRef.current('loading.imageGenerateFailed')
                  : taskType === "audio_generate"
                    ? tRef.current('loading.audioGenerateFailed')
                    : tRef.current('loading.videoGenerateFailed'),
              );
            }

            if (taskType === "image_generate") {
              if (sourceNodeId) {
                engine.doc.updateNodeProps(sourceNodeId, {
                  resultImages: resultUrls,
                  errorText: "",
                });
              }

              const selectionSnapshot = engine.selection.getSelectedIds();
              const [x, y] = xywhRef.current;
              const imageNodeIds: string[] = [];

              const payloads = await Promise.all(
                resultUrls.map((resultUrl: string) =>
                  buildImageNodePayloadFromUri(resultUrl, {
                    projectId: projectId || undefined,
                  })
                )
              );

              const gap = 24;
              const totalHeight =
                payloads.reduce((sum, p) => sum + p.size[1], 0) +
                gap * Math.max(payloads.length - 1, 0);

              const sourceEl = sourceNodeId
                ? engine.doc.getElementById(sourceNodeId)
                : null;
              let cursorY: number;
              if (sourceEl && sourceEl.kind === "node") {
                const [, srcY, , srcH] = sourceEl.xywh;
                cursorY = srcY + srcH / 2 - totalHeight / 2;
              } else {
                cursorY = y;
              }

              for (const payload of payloads) {
                const [nodeW, nodeH] = payload.size;
                const nodeId = engine.addNodeElement(
                  "image",
                  payload.props,
                  [x, cursorY, nodeW, nodeH]
                );
                if (nodeId) {
                  imageNodeIds.push(nodeId);
                  cursorY += nodeH + gap;
                  if (sourceNodeId) {
                    engine.addConnectorElement({
                      source: { elementId: sourceNodeId },
                      target: { elementId: nodeId },
                      style: engine.getConnectorStyle(),
                    });
                  }
                }
              }

              if (imageNodeIds.length > 1) {
                engine.selection.setSelection(imageNodeIds);
                engine.groupSelection();
                const [groupId] = engine.selection.getSelectedIds();
                if (groupId) {
                  engine.layoutGroup(groupId, "row");
                }
              }
              if (selectionSnapshot.length > 0) {
                engine.selection.setSelection(selectionSnapshot);
              }

              finished = true;
              clearLoadingNode(engine, element.id);
              return;
            }

            const savedPath = resultUrls[0]?.trim() || "";
            const scopedPath = (() => {
              if (!savedPath) return "";
              const parsed = parseScopedProjectPath(savedPath);
              if (parsed) return savedPath;
              if (!projectId) return savedPath;
              const relative = normalizeProjectRelativePath(savedPath);
              return formatScopedProjectPath({
                projectId,
                currentProjectId: projectId,
                relativePath: relative,
                includeAt: true,
              });
            })();
            if (!scopedPath) {
              throw new Error(tRef.current('loading.videoSaveFailed'));
            }

            if (sourceNodeId) {
              engine.doc.updateNodeProps(sourceNodeId, {
                resultVideo: scopedPath,
                errorText: "",
              });
            }

            const relativePath =
              parseScopedProjectPath(scopedPath)?.relativePath ??
              normalizeProjectRelativePath(savedPath);
            const [metadata, thumbnailResult] = await Promise.all([
              fetchVideoMetadata({
                projectId,
                uri: scopedPath,
              }),
              projectId && relativePath
                ? trpcClient.fs.thumbnails.query({
                    projectId,
                    uris: [relativePath],
                  })
                : Promise.resolve(null),
            ]);
            const posterPath =
              thumbnailResult?.items?.find((item) => item.uri === relativePath)?.dataUrl ?? "";
            const naturalWidth = metadata?.width ?? 16;
            const naturalHeight = metadata?.height ?? 9;
            const fileName = savedPath.split("/").pop() || "";

            const selectionSnapshot = engine.selection.getSelectedIds();
            const [x, y, w, h] = xywhRef.current;
            const videoNodeId = engine.addNodeElement(
              "video",
              {
                sourcePath: scopedPath,
                fileName: fileName || undefined,
                posterPath: posterPath || undefined,
                naturalWidth,
                naturalHeight,
                duration: metadata?.duration,
              },
              [x, y, w || LOADING_NODE_SIZE[0], h || LOADING_NODE_SIZE[1]]
            );
            if (videoNodeId && sourceNodeId) {
              engine.addConnectorElement({
                source: { elementId: sourceNodeId },
                target: { elementId: videoNodeId },
                style: engine.getConnectorStyle(),
              });
            }
            if (selectionSnapshot.length > 0) {
              engine.selection.setSelection(selectionSnapshot);
            }

            finished = true;
            clearLoadingNode(engine, element.id);
            return;
          }

          if (status.data.status === "failed" || status.data.status === "canceled") {
            const fallbackMessage =
              status.data.status === "canceled"
                ? tRef.current('loading.taskCancelled')
                : tRef.current('loading.failed');
            throw new Error(status.data.error?.message || fallbackMessage);
          }

          await new Promise((resolve) => setTimeout(resolve, getPollDelay(attempt)));
        }

        throw new Error(
          taskType === "image_generate"
            ? tRef.current('loading.imageTimeout')
            : taskType === "audio_generate"
              ? tRef.current('loading.audioTimeout')
              : tRef.current('loading.videoTimeout'),
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          const message =
            error instanceof Error
              ? error.message
              : taskType === "image_generate"
                ? tRef.current('loading.imageGenerateError')
                : taskType === "audio_generate"
                  ? tRef.current('loading.audioGenerateError')
                  : tRef.current('loading.videoGenerateError');
          setErrorText(message);
          if (sourceNodeId) {
            engine.doc.updateNodeProps(sourceNodeId, { errorText: message });
          }
          // 逻辑：错误时保留节点，不自动清理，让用户选择重试或删除。
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsRunning(false);
      }
    };

    run();

    return () => {
      controller.abort();
      // 逻辑：Strict Mode 下 cleanup 会先于第二次 mount 执行，
      // 重置 ref 以允许第二次 mount 正常启动轮询。
      // 不在 cleanup 中取消远端任务——仅在用户主动点击取消时才发 cancel 请求。
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    };
    // 逻辑：仅依赖关键业务字段 + retryCount，不包含 xywh/翻译字符串，避免拖动或切语言触发重新轮询。
  }, [canRun, engine, element.id, projectId, saveDir, sourceNodeId, taskId, taskType, retryCount]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (taskType === "video_download") {
      const baseUrl = resolveServerUrl();
      const prefix = baseUrl || "";
      void fetch(`${prefix}/media/video-download/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      }).catch(() => undefined);
    } else {
      void cancelTask(taskId).catch(() => undefined);
    }
    clearLoadingNode(engine, element.id);
  }, [engine, element.id, taskId, taskType]);

  const handleRetry = useCallback(() => {
    // 逻辑：递增 retryCount 触发 useEffect 重新执行轮询。
    setErrorText("");
    abortControllerRef.current = null;
    setRetryCount((c) => c + 1);
  }, []);

  const handleDelete = useCallback(() => {
    clearLoadingNode(engine, element.id);
  }, [engine, element.id]);

  const statusText = (() => {
    if (errorText) return t('loading.statusFailed');
    if (taskType === "video_download" && (isRunning || downloadProgress >= 0)) {
      if (downloadPhase === 'extracting' || downloadProgress < 0) {
        return t('loading.statusExtracting', { defaultValue: '解析视频信息...' });
      }
      if (downloadPhase === 'merging') {
        return t('loading.statusMerging', { defaultValue: '合并音视频...' });
      }
      const pct = Math.max(downloadProgress, 0);
      return `${t('loading.statusDownloading', { defaultValue: '下载中' })} ${pct}%`;
    }
    if (isRunning) return t('loading.statusGenerating');
    return t('loading.statusWaiting');
  })();

  return (
    <NodeFrame>
      <div
        className={[
          "relative flex h-full w-full min-h-0 min-w-0 flex-col items-center justify-center gap-1 rounded-md bg-card border border-border/60 p-3 text-center text-ol-text-primary",
          !errorText ? "openloaf-thinking-border openloaf-thinking-border-on border-transparent" : "",
          errorText
            ? "border-ol-red/80 bg-ol-red-bg/60"
            : "",
        ].join(" ")}
      >
        <div className="flex items-center justify-center gap-2 text-xs font-medium">
          <Loader2 className={isRunning ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          <span>{statusText}</span>
        </div>
        <div className="w-full text-[11px] text-ol-text-auxiliary line-clamp-1 truncate">
          {promptLabel}
        </div>
        {taskType === "video_download" && !errorText && (
          <div className="w-full mt-1 h-1.5 rounded-full bg-border/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-ol-blue transition-all duration-300"
              style={{ width: `${Math.max(Math.min(downloadProgress, 100), 0)}%` }}
            />
          </div>
        )}
        {errorText && (
          <div className="text-[10px] text-ol-red line-clamp-2 mt-0.5">
            {errorText}
          </div>
        )}
        <div className="flex items-center gap-1 mt-1">
          {errorText ? (
            <>
              <button
                type="button"
                onClick={handleRetry}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] bg-ol-blue-bg text-ol-blue hover:bg-ol-blue/20 transition-colors duration-150"
              >
                <RotateCw className="h-3 w-3" />
                {t('loading.retry')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] bg-ol-red-bg text-ol-red hover:bg-ol-red/20 transition-colors duration-150"
              >
                <Trash2 className="h-3 w-3" />
                {t('loading.delete')}
              </button>
            </>
          ) : isRunning ? (
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] bg-ol-red-bg text-ol-red hover:bg-ol-red/20 transition-colors duration-150"
            >
              <X className="h-3 w-3" />
              {t('loading.cancel')}
            </button>
          ) : null}
        </div>
      </div>
    </NodeFrame>
  );
}

/** Definition for the loading node. */
export const LoadingNodeDefinition: CanvasNodeDefinition<LoadingNodeProps> = {
  type: LOADING_NODE_TYPE,
  schema: LoadingNodeSchema,
  defaultProps: {
    taskId: "",
    taskType: "video_generate",
    sourceNodeId: "",
    promptText: "",
    chatModelId: "",
    projectId: "",
    saveDir: "",
  },
  view: LoadingNodeView,
  capabilities: {
    resizable: false,
    rotatable: false,
    connectable: "anchors",
    minSize: { w: LOADING_NODE_SIZE[0], h: LOADING_NODE_SIZE[1] },
    maxSize: { w: LOADING_NODE_SIZE[0], h: LOADING_NODE_SIZE[1] },
  },
};
