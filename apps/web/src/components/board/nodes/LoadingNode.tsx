import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../engine/types";
import { useEffect, useMemo, useRef, useState } from "react";
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

/** Default loading prompt. */
const LOADING_FALLBACK_TEXT = "任务处理中";
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

  const promptLabel = promptText || LOADING_FALLBACK_TEXT;

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
            throw new Error("请求已取消");
          }
          const status = await pollTask(taskId);
          if (!status || status.success !== true || !status.data) {
            throw new Error("任务查询失败");
          }

          if (status.data.status === "succeeded") {
            const resultUrls = Array.isArray(status.data.resultUrls)
              ? status.data.resultUrls.filter(
                  (url): url is string => typeof url === "string" && url.trim().length > 0
                )
              : [];
            if (resultUrls.length === 0) {
              throw new Error(taskType === "image_generate" ? "图片生成失败" : "视频生成失败");
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
              throw new Error("视频保存失败");
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
              status.data.status === "canceled" ? "任务已取消" : "生成失败";
            throw new Error(status.data.error?.message || fallbackMessage);
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        throw new Error(taskType === "image_generate" ? "图片生成超时" : "视频生成超时");
      } catch (error) {
        if (!controller.signal.aborted) {
          const message =
            error instanceof Error
              ? error.message
              : taskType === "image_generate"
                ? "生成图片失败"
                : "生成视频失败";
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
  ]);

  const statusText = useMemo(() => {
    if (errorText) return "失败";
    if (isRunning) return "生成中…";
    return "等待任务";
  }, [errorText, isRunning]);

  return (
    <NodeFrame>
      <div
        className={[
          "relative flex h-full w-full min-h-0 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-slate-300/80 bg-white/90 p-3 text-center text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.12)]",
          "dark:border-slate-700/90 dark:bg-slate-900/80 dark:text-slate-100",
          !errorText ? "tenas-thinking-border tenas-thinking-border-on border-transparent" : "",
          errorText
            ? "border-rose-400/80 bg-rose-50/60 dark:border-rose-400/70 dark:bg-rose-950/30"
            : "",
        ].join(" ")}
      >
        <div className="flex items-center justify-center gap-2 text-xs font-medium">
          <Loader2 className={isRunning ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          <span>{statusText}</span>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-3">
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
