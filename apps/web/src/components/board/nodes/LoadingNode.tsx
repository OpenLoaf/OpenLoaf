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
import { fetchVideoMetadata } from "@/components/file/lib/video-metadata";
import { cancelTask, pollTask } from "@/lib/saas-media";
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

export type LoadingTaskType = "video_generate" | "image_generate";

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
  taskType: z.enum(["video_generate", "image_generate"]).optional(),
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

/** Render the loading node. */
export function LoadingNodeView({ element }: CanvasNodeViewProps<LoadingNodeProps>) {
  const { t } = useTranslation('board');
  const { engine } = useBoardContext();
  const [isRunning, setIsRunning] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [retryCount, setRetryCount] = useState(0);
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
    taskId && (taskType === "video_generate" || taskType === "image_generate")
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
            : tRef.current('loading.videoTimeout'),
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          const message =
            error instanceof Error
              ? error.message
              : taskType === "image_generate"
                ? tRef.current('loading.imageGenerateError')
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
      if (!finished) {
        void cancelTask(taskId).catch(() => undefined);
      }
    };
    // 逻辑：仅依赖关键业务字段 + retryCount，不包含 xywh/翻译字符串，避免拖动或切语言触发重新轮询。
  }, [canRun, engine, element.id, projectId, saveDir, sourceNodeId, taskId, taskType, retryCount]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    void cancelTask(taskId).catch(() => undefined);
    clearLoadingNode(engine, element.id);
  }, [engine, element.id, taskId]);

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
    if (isRunning) return t('loading.statusGenerating');
    return t('loading.statusWaiting');
  })();

  return (
    <NodeFrame>
      <div
        className={[
          "relative flex h-full w-full min-h-0 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-border/50 bg-background/95 p-3 text-center text-ol-text-primary shadow-sm",
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
        <div className="text-[11px] text-ol-text-auxiliary line-clamp-3">
          {promptLabel}
        </div>
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
