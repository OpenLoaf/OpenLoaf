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
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Loader2 } from "lucide-react";
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
  /** Workspace id for file operations. */
  workspaceId?: string;
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
  workspaceId: z.string().optional(),
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

/** Render the loading node. */
export function LoadingNodeView({ element }: CanvasNodeViewProps<LoadingNodeProps>) {
  const { t } = useTranslation('board');
  const { engine } = useBoardContext();
  const [isRunning, setIsRunning] = useState(false);
  const [errorText, setErrorText] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const taskId = element.props.taskId ?? "";
  const taskType = element.props.taskType ?? "video_generate";
  const promptText = (element.props.promptText ?? "").trim();
  const sourceNodeId = element.props.sourceNodeId ?? "";
  const workspaceId = element.props.workspaceId ?? "";
  const projectId = element.props.projectId ?? "";

  const promptLabel = promptText || t('loading.processing');

  const canRun = Boolean(
    taskId && (taskType === "video_generate" || taskType === "image_generate")
  );

  // 逻辑：在 hook 层捕获翻译字符串，供 async 函数闭包使用。
  const errCancelled = t('loading.cancelled');
  const errQueryFailed = t('loading.queryFailed');
  const errImageFailed = t('loading.imageGenerateFailed');
  const errVideoFailed = t('loading.videoGenerateFailed');
  const errVideoSave = t('loading.videoSaveFailed');
  const errTaskCancelled = t('loading.taskCancelled');
  const errGenFailed = t('loading.failed');
  const errImageTimeout = t('loading.imageTimeout');
  const errVideoTimeout = t('loading.videoTimeout');
  const errImageGenError = t('loading.imageGenerateError');
  const errVideoGenError = t('loading.videoGenerateError');

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
            throw new Error(errCancelled);
          }
          const status = await pollTask(taskId);
          if (!status || status.success !== true || !status.data) {
            throw new Error(errQueryFailed);
          }

          if (status.data.status === "succeeded") {
            const resultUrls = Array.isArray(status.data.resultUrls)
              ? status.data.resultUrls.filter(
                  (url: unknown): url is string =>
                    typeof url === "string" && url.trim().length > 0
                )
              : [];
            if (resultUrls.length === 0) {
              throw new Error(taskType === "image_generate" ? errImageFailed : errVideoFailed);
            }

            if (taskType === "image_generate") {
              if (sourceNodeId) {
                // 逻辑：输出成功后同步更新源节点状态。
                engine.doc.updateNodeProps(sourceNodeId, {
                  resultImages: resultUrls,
                  errorText: "",
                });
              }

              const selectionSnapshot = engine.selection.getSelectedIds();
              const [x, y, w] = element.xywh;
              const baseX = x + (w || LOADING_NODE_SIZE[0]) + 32;
              let cursorY = y;
              const imageNodeIds: string[] = [];

              for (const resultUrl of resultUrls) {
                const payload = await buildImageNodePayloadFromUri(resultUrl, {
                  projectId: projectId || undefined,
                  workspaceId: workspaceId || undefined,
                });
                const [nodeW, nodeH] = payload.size;
                const nodeId = engine.addNodeElement(
                  "image",
                  payload.props,
                  [baseX, cursorY, nodeW, nodeH]
                );
                if (nodeId) {
                  imageNodeIds.push(nodeId);
                  cursorY += nodeH + 24;
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
              throw new Error(errVideoSave);
            }

            if (sourceNodeId) {
              // 逻辑：输出成功后同步更新源节点状态。
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
                workspaceId,
                projectId,
                uri: scopedPath,
              }),
              workspaceId && projectId && relativePath
                ? trpcClient.fs.thumbnails.query({
                    workspaceId,
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
            const [x, y, w, h] = element.xywh;
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
              status.data.status === "canceled" ? errTaskCancelled : errGenFailed;
            throw new Error(status.data.error?.message || fallbackMessage);
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        throw new Error(taskType === "image_generate" ? errImageTimeout : errVideoTimeout);
      } catch (error) {
        if (!controller.signal.aborted) {
          const message =
            error instanceof Error
              ? error.message
              : taskType === "image_generate"
                ? errImageGenError
                : errVideoGenError;
          setErrorText(message);
          if (sourceNodeId) {
            engine.doc.updateNodeProps(sourceNodeId, { errorText: message });
          }
          finished = true;
          clearLoadingNode(engine, element.id);
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
  }, [
    canRun,
    engine,
    element.id,
    element.xywh,
    projectId,
    sourceNodeId,
    taskId,
    taskType,
    workspaceId,
    errCancelled,
    errQueryFailed,
    errImageFailed,
    errVideoFailed,
    errVideoSave,
    errTaskCancelled,
    errGenFailed,
    errImageTimeout,
    errVideoTimeout,
    errImageGenError,
    errVideoGenError,
  ]);

  const statusText = useMemo(() => {
    if (errorText) return t('loading.statusFailed');
    if (isRunning) return t('loading.statusGenerating');
    return t('loading.statusWaiting');
  }, [errorText, isRunning, t]);

  return (
    <NodeFrame>
      <div
        className={[
          "relative flex h-full w-full min-h-0 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-neutral-300/80 bg-white/90 p-3 text-center text-neutral-700 shadow-[0_10px_24px_rgba(15,23,42,0.12)]",
          "dark:border-neutral-700/90 dark:bg-neutral-900/80 dark:text-neutral-100",
          !errorText ? "openloaf-thinking-border openloaf-thinking-border-on border-transparent" : "",
          errorText
            ? "border-rose-400/80 bg-rose-50/60 dark:border-rose-400/70 dark:bg-rose-950/30"
            : "",
        ].join(" ")}
      >
        <div className="flex items-center justify-center gap-2 text-xs font-medium">
          <Loader2 className={isRunning ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          <span>{statusText}</span>
        </div>
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-3">
          {promptLabel}
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
    workspaceId: "",
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
