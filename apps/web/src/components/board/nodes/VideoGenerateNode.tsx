import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../engine/types";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { z } from "zod";
import { Copy, Play, RotateCcw, Square } from "lucide-react";
import type { ModelTag } from "@tenas-ai/api/common";
import { toast } from "sonner";

import { useBoardContext } from "../core/BoardProvider";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useSettingsValues } from "@/hooks/use-settings";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { filterModelOptionsByTags } from "./lib/image-generation";
import { Input } from "@tenas-ai/ui/input";
import { Textarea } from "@tenas-ai/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tenas-ai/ui/select";
import { trpcClient } from "@/utils/trpc";
import { getWorkspaceIdFromCookie } from "../core/boardSession";
import type { ImageNodeProps } from "./ImageNode";
import { fetchVideoMetadata } from "@/components/file/lib/video-metadata";
import {
  formatScopedProjectPath,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import {
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from "../core/boardFilePath";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";

/** Node type identifier for video generation. */
export const VIDEO_GENERATE_NODE_TYPE = "video_generate";
/** Default duration in seconds. */
const VIDEO_GENERATE_DEFAULT_DURATION = 4;
/** Minimum duration in seconds. */
const VIDEO_GENERATE_MIN_DURATION = 1;
/** Maximum duration in seconds. */
const VIDEO_GENERATE_MAX_DURATION = 10;
/** Preset aspect ratios for video generation. */
const VIDEO_GENERATE_RATIO_OPTIONS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"];
/** Default aspect ratio preset. */
const VIDEO_GENERATE_DEFAULT_RATIO = "16:9";
/** Maximum number of input images supported by video generation. */
const VIDEO_GENERATE_MAX_INPUT_IMAGES = 1;
/** Default width for video nodes when metadata is missing. */
const DEFAULT_VIDEO_WIDTH = 16;
/** Default height for video nodes when metadata is missing. */
const DEFAULT_VIDEO_HEIGHT = 9;
/** Max dimension for generated video node size. */
const VIDEO_NODE_MAX_DIMENSION = 360;

/** Compute a fitted size that preserves aspect ratio. */
const fitSize = (width: number, height: number, maxDimension: number): [number, number] => {
  const maxSide = Math.max(width, height);
  if (maxSide <= maxDimension) {
    return [Math.max(1, Math.round(width)), Math.max(1, Math.round(height))];
  }
  const scale = maxDimension / maxSide;
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
};

export type VideoGenerateNodeProps = {
  /** Selected chat model id (profileId:modelId). */
  chatModelId?: string;
  /** Prompt text entered in the node. */
  promptText?: string;
  /** Duration in seconds. */
  durationSeconds?: number;
  /** Aspect ratio preset value. */
  aspectRatio?: string;
  /** Generated video path. */
  resultVideo?: string;
  /** Error text for failed runs. */
  errorText?: string;
};

/** Schema for video generation node props. */
const VideoGenerateNodeSchema = z.object({
  chatModelId: z.string().optional(),
  promptText: z.string().optional(),
  durationSeconds: z.number().optional(),
  aspectRatio: z.string().optional(),
  resultVideo: z.string().optional(),
  errorText: z.string().optional(),
});

/** Required tags for video generation models. */
const REQUIRED_TAGS: ModelTag[] = ["video_generation"];

/** Normalize the stored value to a plain text string. */
function normalizeTextValue(value?: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Normalize the duration within supported bounds. */
function normalizeDurationSeconds(value: number | undefined) {
  if (!Number.isFinite(value)) return VIDEO_GENERATE_DEFAULT_DURATION;
  const rounded = Math.round(value as number);
  // 逻辑：限制在允许范围内，避免无效时长。
  return Math.min(Math.max(rounded, VIDEO_GENERATE_MIN_DURATION), VIDEO_GENERATE_MAX_DURATION);
}

/** Normalize aspect ratio preset. */
function normalizeAspectRatio(value: string | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return VIDEO_GENERATE_RATIO_OPTIONS.includes(trimmed)
    ? trimmed
    : VIDEO_GENERATE_DEFAULT_RATIO;
}

/** Resolve frames count from duration seconds. */
function resolveFrameCount(durationSeconds: number) {
  // 逻辑：即梦视频仅支持 5s(121) 与 10s(241)，按时长向上归一。
  return durationSeconds <= 5 ? 121 : 241;
}

/** Render the video generation node. */
export function VideoGenerateNodeView({
  element,
  selected,
  onSelect,
  onUpdate,
}: CanvasNodeViewProps<VideoGenerateNodeProps>) {
  /** Board engine used for lock checks. */
  const { engine, fileContext } = useBoardContext();
  /** Basic config for default model selection. */
  const { basic } = useBasicConfig();
  /** Provider settings for local model list. */
  const { providerItems } = useSettingsValues();
  /** Cloud model registry for cloud source. */
  const { models: cloudModels } = useCloudModels();
  /** Chat model source derived from settings. */
  const chatSource = normalizeChatModelSource(basic.chatSource);
  /** All available chat model options. */
  const modelOptions = useMemo(
    () => buildChatModelOptions(chatSource, providerItems, cloudModels),
    [chatSource, providerItems, cloudModels]
  );
  const candidates = useMemo(() => {
    return filterModelOptionsByTags(modelOptions, { required: REQUIRED_TAGS });
  }, [modelOptions]);
  /** Board folder scope used for resolving relative asset uris. */
  const boardFolderScope = useMemo(
    () => resolveBoardFolderScope(fileContext),
    [fileContext?.boardFolderUri, fileContext?.projectId, fileContext?.rootUri]
  );
  const currentProjectId = boardFolderScope?.projectId ?? fileContext?.projectId;
  const videoSaveDir = useMemo(() => {
    if (boardFolderScope) {
      // 逻辑：默认写入画布资产目录，避免视频散落在画布根目录。
      return normalizeProjectRelativePath(
        `${boardFolderScope.relativeFolderPath}/${BOARD_ASSETS_DIR_NAME}`
      );
    }
    return "";
  }, [boardFolderScope]);
  const selectedModelId = (element.props.chatModelId ?? "").trim();
  const defaultModelId =
    typeof basic.modelDefaultChatModelId === "string"
      ? basic.modelDefaultChatModelId.trim()
      : "";

  const effectiveModelId = useMemo(() => {
    if (selectedModelId) return selectedModelId;
    if (defaultModelId && candidates.some((item) => item.id === defaultModelId)) {
      return defaultModelId;
    }
    return candidates[0]?.id ?? "";
  }, [candidates, defaultModelId, selectedModelId]);

  useEffect(() => {
    // 逻辑：当默认模型可用时自动写入节点，避免用户每次重复选择。
    if (!effectiveModelId) return;
    if (selectedModelId) return;
    onUpdate({ chatModelId: effectiveModelId });
  }, [effectiveModelId, onUpdate, selectedModelId]);

  const errorText = element.props.errorText ?? "";
  const localPromptText = normalizeTextValue(element.props.promptText);
  const durationSeconds = normalizeDurationSeconds(element.props.durationSeconds);
  const selectedAspectRatio =
    typeof element.props.aspectRatio === "string" ? element.props.aspectRatio.trim() : "";
  const aspectRatio = normalizeAspectRatio(element.props.aspectRatio);

  useEffect(() => {
    // 逻辑：未设置比例时写入默认值，避免发送空参数。
    if (!aspectRatio || selectedAspectRatio) return;
    onUpdate({ aspectRatio });
  }, [aspectRatio, onUpdate, selectedAspectRatio]);

  /** Throttle timestamp for focus-driven viewport moves. */
  const focusThrottleRef = useRef(0);
  /** Abort controller for the active request. */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Runtime running flag for this node. */
  const [isRunning, setIsRunning] = useState(false);
  /** Workspace id used for requests. */
  const resolvedWorkspaceId = useMemo(() => getWorkspaceIdFromCookie(), []);

  // 逻辑：输入以“连线关系”为准，避免节点 props 与画布连接状态不一致。
  const inputImageNodes: ImageNodeProps[] = [];
  const inputTextSegments: string[] = [];
  const seenSourceIds = new Set<string>();
  for (const item of engine.doc.getElements()) {
    if (item.kind !== "connector") continue;
    if (!item.target || !("elementId" in item.target)) continue;
    if (item.target.elementId !== element.id) continue;
    if (!item.source || !("elementId" in item.source)) continue;
    const sourceElementId = item.source.elementId;
    if (!sourceElementId || seenSourceIds.has(sourceElementId)) continue;
    const source = engine.doc.getElementById(sourceElementId);
    if (!source || source.kind !== "node") continue;
    seenSourceIds.add(sourceElementId);
    if (source.type === "image") {
      inputImageNodes.push(source.props as ImageNodeProps);
      continue;
    }
    if (source.type === "text") {
      const rawText = normalizeTextValue((source.props as any)?.value);
      if (rawText.trim()) inputTextSegments.push(rawText.trim());
      continue;
    }
    if (source.type === "image_prompt_generate") {
      const rawText =
        typeof (source.props as any)?.resultText === "string"
          ? ((source.props as any).resultText as string)
          : "";
      if (rawText.trim()) inputTextSegments.push(rawText.trim());
    }
  }

  const upstreamPromptText = inputTextSegments.join("\n").trim();
  const sanitizedLocalPrompt = localPromptText.trim();
  // 逻辑：合并上游与本地提示词，保证两者都参与生成。
  const promptText = [upstreamPromptText, sanitizedLocalPrompt]
    .filter(Boolean)
    .join("\n");
  const hasPrompt = Boolean(promptText);
  const overflowCount = Math.max(0, inputImageNodes.length - VIDEO_GENERATE_MAX_INPUT_IMAGES);
  const limitedInputImages = inputImageNodes.slice(0, VIDEO_GENERATE_MAX_INPUT_IMAGES);
  const resolvedImages: Array<{ url: string; mediaType: string }> = [];
  let invalidImageCount = 0;

  for (const imageProps of limitedInputImages) {
    const rawUri = imageProps?.originalSrc ?? "";
    const resolvedUri = resolveProjectPathFromBoardUri({
      uri: rawUri,
      boardFolderScope,
      currentProjectId,
      rootUri: fileContext?.rootUri,
    });
    if (!resolvedUri) {
      invalidImageCount += 1;
      continue;
    }
    resolvedImages.push({
      url: resolvedUri,
      mediaType: imageProps?.mimeType || "application/octet-stream",
    });
  }

  const hasAnyImageInput = inputImageNodes.length > 0;
  const hasInvalidImages = invalidImageCount > 0;
  const hasTooManyImages = overflowCount > 0;
  const resultVideo = typeof element.props.resultVideo === "string" ? element.props.resultVideo : "";

  const viewStatus = useMemo(() => {
    if (isRunning) return "running";
    if (errorText) return "error";
    if (!effectiveModelId || candidates.length === 0) return "needs_model";
    if (!hasPrompt && !hasAnyImageInput) return "needs_prompt";
    if (hasTooManyImages) return "too_many_images";
    if (hasInvalidImages) return "invalid_image";
    if (resultVideo) return "done";
    return "idle";
  }, [
    candidates.length,
    effectiveModelId,
    errorText,
    hasAnyImageInput,
    hasInvalidImages,
    hasPrompt,
    hasTooManyImages,
    isRunning,
    resultVideo,
  ]);

  const canRun =
    !isRunning &&
    (hasPrompt || hasAnyImageInput) &&
    !hasTooManyImages &&
    !hasInvalidImages &&
    candidates.length > 0 &&
    Boolean(effectiveModelId) &&
    !engine.isLocked() &&
    !element.locked;

  /** Handle duration edits. */
  const handleDurationChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = normalizeDurationSeconds(Number(event.target.value));
      onUpdate({ durationSeconds: next });
    },
    [onUpdate]
  );

  const handleCopyError = useCallback(async () => {
    const copyText = errorText.trim() || "生成视频失败，请重试。";
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
      } else {
        // 逻辑：兼容不支持 Clipboard API 的环境。
        const textarea = document.createElement("textarea");
        textarea.value = copyText;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      toast.success("已复制错误信息");
    } catch {
      toast.error("复制失败");
    }
  }, [errorText]);

  /** Stop the current video generation request. */
  const stopVideoGenerate = useCallback(() => {
    // 逻辑：先结束运行态再中止请求，避免 UI 卡死。
    setIsRunning(false);
    if (!abortControllerRef.current) return;
    abortControllerRef.current.abort();
    abortControllerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (!abortControllerRef.current) return;
      // 逻辑：节点卸载时中止请求，避免泄露连接。
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    };
  }, []);

  /** Run a video generation request and poll result. */
  const runVideoGenerate = useCallback(
    async (input: { chatModelId?: string; chatModelSource?: "local" | "cloud" }) => {
      const nodeId = element.id;
      const node = engine.doc.getElementById(nodeId);
      if (!node || node.kind !== "node" || node.type !== VIDEO_GENERATE_NODE_TYPE) {
        return;
      }

      const chatModelId = (input.chatModelId ?? (node.props as any)?.chatModelId ?? "").trim();
      if (!chatModelId) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: "请选择支持「视频生成」的模型",
        });
        return;
      }

      if (!hasPrompt && !hasAnyImageInput) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: "请先输入提示词或连接图片",
        });
        return;
      }

      if (hasTooManyImages) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: `最多支持 ${VIDEO_GENERATE_MAX_INPUT_IMAGES} 张图片输入`,
        });
        return;
      }

      if (hasInvalidImages) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: "存在无法访问的图片地址，请检查输入",
        });
        return;
      }

      if (!videoSaveDir) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: "无法确定视频保存目录",
        });
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsRunning(true);
      engine.doc.updateNodeProps(nodeId, {
        errorText: "",
        resultVideo: "",
        chatModelId,
        aspectRatio,
      });

      try {
        const frames = resolveFrameCount(durationSeconds);
        const imageUrls = resolvedImages.map((image) => image.url);
        const result = await trpcClient.ai.videoGenerate.mutate({
          prompt: hasPrompt ? promptText : undefined,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          frames,
          aspectRatio: hasAnyImageInput ? undefined : aspectRatio,
          workspaceId: resolvedWorkspaceId || undefined,
          projectId: currentProjectId || undefined,
        });
        if (!result?.taskId) {
          throw new Error("视频任务提交失败");
        }

        const maxAttempts = 40;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          if (controller.signal.aborted) {
            throw new Error("请求已取消");
          }
          const status = await trpcClient.ai.videoGenerateResult.mutate({
            taskId: result.taskId,
            workspaceId: resolvedWorkspaceId || undefined,
            projectId: currentProjectId || undefined,
            saveDir: videoSaveDir || undefined,
          });

          if (status.status === "done") {
            const savedPath = status.savedPath?.trim() || "";
            const scopedPath = (() => {
              if (!savedPath) return "";
              const parsed = parseScopedProjectPath(savedPath);
              if (parsed) return savedPath;
              if (!currentProjectId) return savedPath;
              const relative = normalizeProjectRelativePath(savedPath);
              return formatScopedProjectPath({
                projectId: currentProjectId,
                currentProjectId,
                relativePath: relative,
                includeAt: true,
              });
            })();
            if (!scopedPath) {
              throw new Error("视频保存失败");
            }

            engine.doc.updateNodeProps(nodeId, { resultVideo: scopedPath });

            const sourceNode = engine.doc.getElementById(nodeId);
            if (sourceNode && sourceNode.kind === "node") {
              const [nodeX, nodeY, nodeW] = sourceNode.xywh;
              const existingOutputs = engine.doc.getElements().reduce((nodes, item) => {
                if (item.kind !== "connector") return nodes;
                if (!("elementId" in item.source)) return nodes;
                if (item.source.elementId !== nodeId) return nodes;
                if (!("elementId" in item.target)) return nodes;
                const target = engine.doc.getElementById(item.target.elementId);
                if (!target || target.kind !== "node" || target.type !== "video") {
                  return nodes;
                }
                return [...nodes, target];
              }, [] as Array<typeof sourceNode>);
              const firstOutput = existingOutputs.reduce((current, target) => {
                if (!current) return target;
                const [currentX, currentY] = current.xywh;
                const [targetX, targetY] = target.xywh;
                if (targetY < currentY) return target;
                if (targetY === currentY && targetX < currentX) return target;
                return current;
              }, null as typeof sourceNode | null);
              const baseX = firstOutput
                ? firstOutput.xywh[0]
                : nodeX + nodeW + 64;
              const startY =
                existingOutputs.length > 0
                  ? existingOutputs.reduce((maxY, target) => {
                      const bottom = target.xywh[1] + target.xywh[3];
                      return Math.max(maxY, bottom);
                    }, firstOutput ? firstOutput.xywh[1] + firstOutput.xywh[3] : nodeY) + 32
                  : nodeY;
              const selectionSnapshot = engine.selection.getSelectedIds();
              const relativePath =
                parseScopedProjectPath(scopedPath)?.relativePath ??
                normalizeProjectRelativePath(savedPath);
              const [metadata, thumbnailResult] = await Promise.all([
                fetchVideoMetadata({
                  workspaceId: resolvedWorkspaceId || "",
                  projectId: currentProjectId,
                  uri: scopedPath,
                }),
                // 逻辑：生成后尝试拉取缩略图，让视频节点展示封面。
                resolvedWorkspaceId && currentProjectId && relativePath
                  ? trpcClient.fs.thumbnails.query({
                      workspaceId: resolvedWorkspaceId,
                      projectId: currentProjectId,
                      uris: [relativePath],
                    })
                  : Promise.resolve(null),
              ]);
              const posterPath =
                thumbnailResult?.items?.find((item) => item.uri === relativePath)?.dataUrl ?? "";
              const naturalWidth = metadata?.width ?? DEFAULT_VIDEO_WIDTH;
              const naturalHeight = metadata?.height ?? DEFAULT_VIDEO_HEIGHT;
              const [width, height] = fitSize(
                naturalWidth,
                naturalHeight,
                VIDEO_NODE_MAX_DIMENSION
              );
              const videoNodeId = engine.addNodeElement(
                "video",
                {
                  sourcePath: scopedPath,
                  fileName: status.fileName,
                  posterPath: posterPath || undefined,
                  naturalWidth,
                  naturalHeight,
                },
                [baseX, startY, width, height]
              );
              if (videoNodeId) {
                engine.addConnectorElement({
                  source: { elementId: nodeId },
                  target: { elementId: videoNodeId },
                  style: engine.getConnectorStyle(),
                });
              }
              if (selectionSnapshot.length > 0) {
                engine.selection.setSelection(selectionSnapshot);
              }
            }
            return;
          }

          if (
            status.status === "not_found" ||
            status.status === "expired" ||
            status.status === "failed"
          ) {
            throw new Error("生成视频失败");
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        throw new Error("视频生成超时");
      } catch (error) {
        if (!controller.signal.aborted) {
          engine.doc.updateNodeProps(nodeId, {
            errorText: error instanceof Error ? error.message : "生成视频失败",
          });
          toast.error("生成视频失败");
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsRunning(false);
      }
    },
    [
      aspectRatio,
      currentProjectId,
      durationSeconds,
      engine,
      element.id,
      hasAnyImageInput,
      hasInvalidImages,
      hasPrompt,
      hasTooManyImages,
      promptText,
      resolvedImages,
      resolvedWorkspaceId,
      videoSaveDir,
    ]
  );

  const handlePromptFocus = useCallback(() => {
    const now = Date.now();
    if (now - focusThrottleRef.current < 300) return;
    focusThrottleRef.current = now;
    if (engine.getViewState().panning) return;
    // 逻辑：引擎实例可能来自旧热更新，缺少方法时直接跳过。
    if (typeof engine.focusViewportToRect !== "function") return;
    const [x, y, w, h] = element.xywh;
    engine.focusViewportToRect({ x, y, w, h }, { padding: 320, durationMs: 280 });
  }, [engine, element.xywh]);

  const statusLabel =
    viewStatus === "running"
      ? "生成中…"
      : viewStatus === "done"
        ? "已完成"
      : viewStatus === "error"
        ? "生成失败"
      : viewStatus === "needs_model"
        ? "需要配置模型"
      : viewStatus === "needs_prompt"
        ? "需要提示词"
      : viewStatus === "too_many_images"
        ? "图片数量过多"
      : viewStatus === "invalid_image"
        ? "图片地址不可用"
      : "待运行";

  const statusHint = useMemo(() => {
    if (viewStatus === "needs_prompt") {
      return { tone: "warn", text: "需要输入提示词或连接图片后才能生成视频。" };
    }
    if (viewStatus === "too_many_images") {
      return {
        tone: "warn",
        text: `最多支持 ${VIDEO_GENERATE_MAX_INPUT_IMAGES} 张图片输入，已连接 ${inputImageNodes.length} 张。`,
      };
    }
    if (viewStatus === "invalid_image") {
      return { tone: "warn", text: "存在无法访问的图片地址，请检查输入。" };
    }
    if (viewStatus === "needs_model") {
      return { tone: "warn", text: "未找到支持「视频生成」的模型，请先在设置中配置。" };
    }
    if (viewStatus === "error") {
      return { tone: "error", text: errorText || "生成视频失败，请重试。" };
    }
    if (viewStatus === "running") {
      return { tone: "info", text: "正在准备生成视频，请稍等…" };
    }
    if (viewStatus === "done") return null;
    if (!hasAnyImageInput) {
      return { tone: "info", text: "未连接图片，将以纯文本生成视频。" };
    }
    return { tone: "info", text: "准备就绪，点击运行即可生成视频。" };
  }, [errorText, hasAnyImageInput, inputImageNodes.length, viewStatus]);

  const containerClassName = [
    "relative flex w-full flex-col gap-2 rounded-xl border border-slate-300/80 bg-white/90 p-3 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-lg",
    "bg-[radial-gradient(180px_circle_at_top_left,rgba(126,232,255,0.45),rgba(255,255,255,0)_60%),radial-gradient(220px_circle_at_85%_15%,rgba(186,255,236,0.35),rgba(255,255,255,0)_65%)]",
    "dark:border-slate-700/90 dark:bg-slate-900/80 dark:text-slate-100 dark:shadow-[0_12px_30px_rgba(0,0,0,0.5)]",
    "dark:bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.6),rgba(15,23,42,0)_48%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.22),rgba(15,23,42,0)_42%)]",
    selected ? "ring-1 ring-slate-300 dark:ring-slate-600" : "",
    viewStatus === "running"
      ? "tenas-thinking-border tenas-thinking-border-on border-transparent"
      : "",
    viewStatus === "error"
      ? "border-rose-400/80 bg-rose-50/60 dark:border-rose-400/70 dark:bg-rose-950/30"
      : "",
  ].join(" ");

  return (
    <div
      className={containerClassName}
      onPointerDown={(event) => {
        // 逻辑：点击节点本体保持选中。
        event.stopPropagation();
        onSelect();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-8 w-8 items-center justify-center text-slate-500 dark:text-slate-300">
            <Play size={18} />
          </span>
          <div className="min-w-0 ml-1">
            <div className="text-[12px] font-semibold leading-4">视频生成</div>
            <div className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              {statusLabel}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isRunning ? (
            <button
              type="button"
              className="rounded-md border border-slate-200/80 bg-background px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-800"
              onPointerDown={(event) => {
                event.stopPropagation();
                stopVideoGenerate();
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Square size={12} />
                停止
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!canRun}
              className="rounded-md border border-slate-200/80 bg-background px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-800"
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelect();
                runVideoGenerate({
                  chatModelId: effectiveModelId,
                  chatModelSource: chatSource,
                });
              }}
            >
              <span className="inline-flex items-center gap-1">
                {viewStatus === "error" ? <RotateCcw size={12} /> : <Play size={12} />}
                {viewStatus === "error" ? "重试" : "运行"}
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="mt-1 flex flex-col gap-2" data-board-editor>
        <div className="flex items-center gap-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">模型</div>
          <div className="min-w-0 flex-1">
            <Select
              value={effectiveModelId}
              onValueChange={(value) => {
                onUpdate({ chatModelId: value });
              }}
              disabled={candidates.length === 0 || isRunning}
            >
              <SelectTrigger className="h-7 w-full px-2 text-[11px] shadow-none">
                <SelectValue placeholder="无可用模型" />
              </SelectTrigger>
              <SelectContent className="text-[11px]">
                {candidates.length ? null : (
                  <SelectItem value="__none__" disabled className="text-[11px]">
                    无可用模型
                  </SelectItem>
                )}
                {candidates.map((option) => (
                  <SelectItem key={option.id} value={option.id} className="text-[11px]">
                    {option.providerName}:{option.modelDefinition?.name || option.modelId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">时长</div>
          <Input
            type="number"
            min={VIDEO_GENERATE_MIN_DURATION}
            max={VIDEO_GENERATE_MAX_DURATION}
            value={durationSeconds}
            disabled={engine.isLocked() || element.locked}
            onChange={handleDurationChange}
            className="h-7 w-16 px-2 text-[11px]"
          />
          <div className="text-[11px] text-slate-400 dark:text-slate-500">秒</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">比例</div>
          <Select
            value={aspectRatio}
            onValueChange={(value) => {
              onUpdate({ aspectRatio: value });
            }}
            disabled={isRunning}
          >
            <SelectTrigger className="h-7 w-20 px-2 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="text-[11px]">
              {VIDEO_GENERATE_RATIO_OPTIONS.map((option) => (
                <SelectItem key={option} value={option} className="text-[11px]">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>提示词</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                {localPromptText.length}/500
              </span>
            </div>
            {upstreamPromptText ? (
              <div className="rounded-md border border-slate-200/70 bg-white/70 px-1.5 py-[1px] text-[10px] leading-[14px] text-slate-500 dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-slate-300">
                已加载上游提示词
              </div>
            ) : null}
          </div>
          <div className="min-w-0 space-y-1">
            <Textarea
              value={localPromptText}
              maxLength={500}
              placeholder="输入补充提示词（最多 500 字）"
              onChange={(event) => {
                const next = event.target.value.slice(0, 500);
                onUpdate({ promptText: next });
              }}
              onFocus={handlePromptFocus}
              data-board-scroll
              className="min-h-[88px] px-2 py-1 text-[12px] leading-5 text-slate-600 shadow-none placeholder:text-slate-400 focus-visible:ring-0 dark:text-slate-200 dark:placeholder:text-slate-500 md:text-[12px]"
              disabled={engine.isLocked() || element.locked || isRunning}
            />
          </div>
        </div>
      </div>

      {statusHint ? (
        statusHint.tone === "error" ? (
          <div className="relative rounded-md border border-rose-200/70 bg-rose-50 p-2 text-[11px] leading-4 text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
            <button
              type="button"
              className="absolute right-2 top-2 rounded-md border border-rose-200/70 bg-background px-2 py-0.5 text-[10px] text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-200 dark:hover:bg-rose-950/60"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={handleCopyError}
            >
              <span className="inline-flex items-center gap-1">
                <Copy size={10} />
                复制
              </span>
            </button>
            <pre className="whitespace-pre-wrap break-words pr-14 font-sans">
              {statusHint.text}
            </pre>
          </div>
        ) : (
          <div
            className={[
              "rounded-md border px-2 py-1 text-[11px] leading-4",
              statusHint.tone === "warn"
                ? "border-amber-200/70 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
                : "border-slate-200/70 bg-slate-50 text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-slate-200",
            ].join(" ")}
          >
            {statusHint.text}
          </div>
        )
      ) : null}
    </div>
  );
}

/** Definition for the video generation node. */
export const VideoGenerateNodeDefinition: CanvasNodeDefinition<VideoGenerateNodeProps> = {
  type: VIDEO_GENERATE_NODE_TYPE,
  schema: VideoGenerateNodeSchema,
  defaultProps: {
    promptText: "",
    durationSeconds: VIDEO_GENERATE_DEFAULT_DURATION,
    aspectRatio: VIDEO_GENERATE_DEFAULT_RATIO,
    resultVideo: "",
  },
  view: VideoGenerateNodeView,
  capabilities: {
    resizable: true,
    rotatable: false,
    connectable: "anchors",
    minSize: { w: 320, h: 280 },
    maxSize: { w: 720, h: 520 },
  },
};
