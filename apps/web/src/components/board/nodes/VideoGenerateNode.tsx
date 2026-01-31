import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../engine/types";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { z } from "zod";
import { Copy, Play, RotateCcw, Square } from "lucide-react";
import type {
  ModelParameterDefinition,
  ModelParameterFeature,
  ModelTag,
} from "@tenas-ai/api/common";
import { toast } from "sonner";

import { useBoardContext } from "../core/BoardProvider";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useSettingsValues } from "@/hooks/use-settings";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { filterModelOptionsByTags } from "./lib/image-generation";
import { Input } from "@tenas-ai/ui/input";
import { Textarea } from "@tenas-ai/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@tenas-ai/ui/card";
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
import { normalizeProjectRelativePath } from "@/components/project/filesystem/utils/file-system-utils";
import {
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from "../core/boardFilePath";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";
import { LOADING_NODE_TYPE } from "./LoadingNode";
import { NodeFrame } from "./NodeFrame";
import { resolveRightStackPlacement } from "../utils/output-placement";

/** Node type identifier for video generation. */
export const VIDEO_GENERATE_NODE_TYPE = "video_generate";
/** Maximum number of input images supported by video generation by default. */
const VIDEO_GENERATE_DEFAULT_MAX_INPUT_IMAGES = 1;
/** Gap between generated video nodes. */
const VIDEO_GENERATE_NODE_GAP = 32;
/** Extra horizontal gap for the first generated video node. */
const VIDEO_GENERATE_NODE_FIRST_GAP = 120;
/** Default width for generated video placeholders. */
const VIDEO_GENERATE_OUTPUT_WIDTH = 320;
/** Default height for generated video placeholders. */
const VIDEO_GENERATE_OUTPUT_HEIGHT = 180;


export type VideoGenerateNodeProps = {
  /** Selected chat model id (profileId:modelId). */
  chatModelId?: string;
  /** Prompt text entered in the node. */
  promptText?: string;
  /** Legacy duration in seconds. */
  durationSeconds?: number;
  /** Legacy aspect ratio preset value. */
  aspectRatio?: string;
  /** Model parameters. */
  parameters?: Record<string, string | number | boolean>;
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
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  resultVideo: z.string().optional(),
  errorText: z.string().optional(),
});

/** Required tags for video generation models. */
const REQUIRED_TAGS: ModelTag[] = ["video_generation"];

/** Normalize the stored value to a plain text string. */
function normalizeTextValue(value?: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Check whether a parameter value is empty. */
function isEmptyParamValue(value: unknown) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

/** Resolve parameter defaults based on model definition. */
function resolveParameterDefaults(
  fields: ModelParameterDefinition[],
  input: Record<string, string | number | boolean> | undefined
) {
  const raw = input ?? {};
  const resolved: Record<string, string | number | boolean> = { ...raw };
  let changed = false;
  for (const field of fields) {
    const value = raw[field.key];
    if (!isEmptyParamValue(value)) continue;
    if (field.default !== undefined) {
      resolved[field.key] = field.default;
      changed = true;
    }
  }
  return { resolved, changed };
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

  const selectedModelOption = useMemo(
    () => candidates.find((item) => item.id === effectiveModelId),
    [candidates, effectiveModelId]
  );
  const parameterFields = useMemo(
    () => selectedModelOption?.modelDefinition?.parameters?.fields ?? [],
    [selectedModelOption]
  );
  const parameterFeatures = useMemo<ModelParameterFeature[]>(
    () => selectedModelOption?.modelDefinition?.parameters?.features ?? [],
    [selectedModelOption]
  );
  const allowsPrompt = parameterFeatures.includes("prompt");
  const maxInputImages = parameterFeatures.includes("last_frame_support")
    ? 2
    : VIDEO_GENERATE_DEFAULT_MAX_INPUT_IMAGES;

  useEffect(() => {
    // 逻辑：当默认模型可用时自动写入节点，避免用户每次重复选择。
    if (!effectiveModelId) return;
    if (selectedModelId) return;
    onUpdate({ chatModelId: effectiveModelId });
  }, [effectiveModelId, onUpdate, selectedModelId]);

  const errorText = element.props.errorText ?? "";
  const localPromptText = normalizeTextValue(element.props.promptText);
  const rawParameters =
    element.props.parameters && typeof element.props.parameters === "object"
      ? element.props.parameters
      : undefined;
  const resolvedParameterResult = useMemo(
    () => resolveParameterDefaults(parameterFields, rawParameters),
    [parameterFields, rawParameters]
  );
  const resolvedParameters = resolvedParameterResult.resolved;
  useEffect(() => {
    // 逻辑：补齐参数默认值，避免发送空参数。
    if (!resolvedParameterResult.changed) return;
    onUpdate({ parameters: resolvedParameterResult.resolved });
  }, [onUpdate, resolvedParameterResult]);

  const missingRequiredParameters = useMemo(() => {
    return parameterFields.filter((field) => {
      if (!field.request) return false;
      const value = resolvedParameters[field.key];
      return isEmptyParamValue(value);
    });
  }, [parameterFields, resolvedParameters]);
  const hasMissingRequiredParameters = missingRequiredParameters.length > 0;

  const resolveOutputPlacement = useCallback(() => {
    const sourceNode = engine.doc.getElementById(element.id);
    if (!sourceNode || sourceNode.kind !== "node") return null;
    const [nodeX, nodeY, nodeW, nodeH] = sourceNode.xywh;
    const existingOutputs = engine.doc.getElements().reduce((nodes, item) => {
      if (item.kind !== "connector") return nodes;
      if (!("elementId" in item.source)) return nodes;
      if (item.source.elementId !== element.id) return nodes;
      if (!("elementId" in item.target)) return nodes;
      const target = engine.doc.getElementById(item.target.elementId);
      if (!target || target.kind !== "node" || target.type !== "video") {
        return nodes;
      }
      return [...nodes, target];
    }, [] as Array<typeof sourceNode>);
    const placement = resolveRightStackPlacement(
      [nodeX, nodeY, nodeW, nodeH],
      existingOutputs.map((target) => target.xywh),
      {
        sideGap: VIDEO_GENERATE_NODE_FIRST_GAP,
        stackGap: VIDEO_GENERATE_NODE_GAP,
        outputHeights: [VIDEO_GENERATE_OUTPUT_HEIGHT],
      }
    );
    if (!placement) return null;
    return { baseX: placement.baseX, startY: placement.startY };
  }, [element.id, engine.doc]);

  const clearLoadingNode = useCallback(() => {
    if (!loadingNodeIdRef.current) return;
    const connectorIds = engine.doc
      .getElements()
      .filter((item) => item.kind === "connector")
      .filter((item) => {
        const sourceId = "elementId" in item.source ? item.source.elementId : null;
        const targetId = "elementId" in item.target ? item.target.elementId : null;
        return sourceId === loadingNodeIdRef.current || targetId === loadingNodeIdRef.current;
      })
      .map((item) => item.id);
    if (connectorIds.length > 0) {
      engine.doc.deleteElements(connectorIds);
    }
    engine.doc.deleteElement(loadingNodeIdRef.current);
    loadingNodeIdRef.current = null;
  }, [engine.doc]);

  /** Throttle timestamp for focus-driven viewport moves. */
  const focusThrottleRef = useRef(0);
  /** Abort controller for the active request. */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Loading node id for the current generation. */
  const loadingNodeIdRef = useRef<string | null>(null);
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

  const upstreamPromptText = allowsPrompt ? inputTextSegments.join("\n").trim() : "";
  const sanitizedLocalPrompt = allowsPrompt ? localPromptText.trim() : "";
  // 逻辑：合并上游与本地提示词，保证两者都参与生成。
  const promptText = allowsPrompt
    ? [upstreamPromptText, sanitizedLocalPrompt].filter(Boolean).join("\n")
    : "";
  const hasPrompt = allowsPrompt ? Boolean(promptText) : true;
  const overflowCount = Math.max(0, inputImageNodes.length - maxInputImages);
  const limitedInputImages = inputImageNodes.slice(0, maxInputImages);
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
    if (hasMissingRequiredParameters) return "missing_parameters";
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
    hasMissingRequiredParameters,
    hasPrompt,
    hasTooManyImages,
    isRunning,
    resultVideo,
  ]);

  const canRun =
    !isRunning &&
    (hasPrompt || hasAnyImageInput) &&
    !hasMissingRequiredParameters &&
    !hasTooManyImages &&
    !hasInvalidImages &&
    candidates.length > 0 &&
    Boolean(effectiveModelId) &&
    !engine.isLocked() &&
    !element.locked;

  /** Update a parameter value. */
  const handleParameterChange = useCallback(
    (key: string, value: string | number | boolean) => {
      const next = { ...resolvedParameters, [key]: value };
      onUpdate({ parameters: next });
    },
    [onUpdate, resolvedParameters]
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
    clearLoadingNode();
    if (!abortControllerRef.current) return;
    abortControllerRef.current.abort();
    abortControllerRef.current = null;
  }, [clearLoadingNode]);

  useEffect(() => {
    return () => {
      if (!abortControllerRef.current) return;
      // 逻辑：节点卸载时中止请求，避免泄露连接。
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const isAdvancedOpen = selected;

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

      if (hasMissingRequiredParameters) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: "请先填写必填参数",
        });
        return;
      }

      if (hasTooManyImages) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: `最多支持 ${maxInputImages} 张图片输入`,
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
      });

      try {
        const placement = resolveOutputPlacement();
        if (placement) {
          const selectionSnapshot = engine.selection.getSelectedIds();
          const loadingNodeId = engine.addNodeElement(
            LOADING_NODE_TYPE,
            {
              taskType: "video_generate",
              sourceNodeId: nodeId,
              promptText: promptText,
              chatModelId,
              workspaceId: resolvedWorkspaceId || undefined,
              projectId: currentProjectId || undefined,
              saveDir: videoSaveDir || undefined,
            },
            [
              placement.baseX,
              placement.startY,
              VIDEO_GENERATE_OUTPUT_WIDTH,
              VIDEO_GENERATE_OUTPUT_HEIGHT,
            ]
          );
          if (loadingNodeId) {
            engine.addConnectorElement({
              source: { elementId: nodeId },
              target: { elementId: loadingNodeId },
              style: engine.getConnectorStyle(),
            });
          }
          if (selectionSnapshot.length > 0) {
            engine.selection.setSelection(selectionSnapshot);
          }
          loadingNodeIdRef.current = loadingNodeId ?? null;
        }
        const imageUrls = resolvedImages.map((image) => image.url);
        const requestParameters = parameterFields.length > 0 ? resolvedParameters : undefined;
        const result = await trpcClient.ai.videoGenerate.mutate({
          prompt: hasPrompt ? promptText : undefined,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          parameters: requestParameters,
          chatModelId,
          workspaceId: resolvedWorkspaceId || undefined,
          projectId: currentProjectId || undefined,
        });
        if (!result?.taskId) {
          throw new Error("视频任务提交失败");
        }
        if (loadingNodeIdRef.current) {
          engine.doc.updateNodeProps(loadingNodeIdRef.current, {
            taskId: result.taskId,
          });
        }
        return;
      } catch (error) {
        clearLoadingNode();
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
      currentProjectId,
      engine,
      element.id,
      hasAnyImageInput,
      hasInvalidImages,
      hasMissingRequiredParameters,
      hasPrompt,
      hasTooManyImages,
      promptText,
      resolvedParameters,
      parameterFields.length,
      resolvedImages,
      resolvedWorkspaceId,
      videoSaveDir,
      maxInputImages,
      clearLoadingNode,
      resolveOutputPlacement,
    ]
  );

  /** Focus viewport to the node when the node is interacted with. */
  const handleNodeFocus = useCallback(() => {
    const now = Date.now();
    if (now - focusThrottleRef.current < 300) return;
    focusThrottleRef.current = now;
    if (engine.getViewState().panning) return;
    // 逻辑：节点点击后自动聚焦到画布视口，避免在视野外编辑。
    // 逻辑：引擎实例可能来自旧热更新，缺少方法时直接跳过。
    if (typeof engine.focusViewportToRect !== "function") return;
    const [x, y, w, h] = element.xywh;
    engine.focusViewportToRect({ x, y, w, h }, { padding: 240, durationMs: 280 });
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
      : viewStatus === "missing_parameters"
        ? "参数未填写"
      : viewStatus === "too_many_images"
        ? "图片数量过多"
      : viewStatus === "invalid_image"
        ? "图片地址不可用"
      : "待运行";

  const statusHint = useMemo(() => {
    if (viewStatus === "needs_prompt") {
      return { tone: "warn", text: "需要输入提示词或连接图片后才能生成视频。" };
    }
    if (viewStatus === "missing_parameters") {
      const requiredText = missingRequiredParameters
        .map((field) => field.title || field.key)
        .join("、");
      return { tone: "warn", text: `请先填写必填参数：${requiredText}` };
    }
    if (viewStatus === "too_many_images") {
      return {
        tone: "warn",
        text: `最多支持 ${maxInputImages} 张图片输入，已连接 ${inputImageNodes.length} 张。`,
      };
    }
    if (viewStatus === "invalid_image") {
      return {
        tone: "warn",
        text: "存在无法访问的图片地址，请检查输入。",
      };
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
    if (!hasAnyImageInput && allowsPrompt) {
      return { tone: "info", text: "未连接图片，将以纯文本生成视频。" };
    }
    return null;
  }, [
    allowsPrompt,
    errorText,
    hasAnyImageInput,
    inputImageNodes.length,
    maxInputImages,
    missingRequiredParameters,
    viewStatus,
  ]);

  const containerClassName = [
    "relative flex h-full w-full min-h-0 min-w-0 flex-col gap-2 rounded-xl border border-slate-300/80 bg-white/90 p-3 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-lg",
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
    <NodeFrame
      onPointerDown={(event) => {
        // 逻辑：点击节点本体保持选中。
        event.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(event) => {
        // 逻辑：双击节点聚焦视口，避免单击误触发。
        event.stopPropagation();
        handleNodeFocus();
      }}
    >
      <div className={containerClassName}>
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

      <div className="mt-1 flex min-h-0 flex-1 flex-col gap-2" data-board-editor>
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
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          {allowsPrompt ? (
            <>
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
              <div className="min-w-0 flex min-h-0 flex-1 flex-col gap-1">
                <Textarea
                  value={localPromptText}
                  maxLength={500}
                  placeholder="输入补充提示词（最多 500 字）"
                  onChange={(event) => {
                    const next = event.target.value.slice(0, 500);
                    onUpdate({ promptText: next });
                  }}
                  data-board-scroll
                  className="h-full min-h-[88px] flex-1 overflow-y-auto px-2 py-1 text-[13px] leading-5 text-slate-600 shadow-none placeholder:text-slate-400 focus-visible:ring-0 dark:text-slate-200 dark:placeholder:text-slate-500 md:text-[13px]"
                  disabled={engine.isLocked() || element.locked || isRunning}
                />
              </div>
            </>
          ) : null}
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
      {isAdvancedOpen && parameterFields.length > 0 ? (
        <Card
          className="absolute left-full top-0 z-20 ml-2 w-72 gap-3 border-slate-200/80 bg-white/95 py-3 text-slate-700 shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur-lg dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-100"
          data-board-editor
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          <CardHeader className="border-b border-slate-200/70 px-4 pb-2 pt-0 dark:border-slate-700/70">
            <CardTitle className="text-[12px] font-semibold text-slate-600 dark:text-slate-200">
              高级选项
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-2 pt-0">
            <div className="flex flex-col gap-3">
            {parameterFields.map((field) => {
              const value = resolvedParameters[field.key];
              const valueString = value === undefined ? "" : String(value);
              const disabled = engine.isLocked() || element.locked || isRunning;
              const label = (
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="text-[11px] text-slate-500 dark:text-slate-300">
                    {field.title}
                  </div>
                  {field.description ? (
                    <div className="text-[10px] leading-[14px] text-slate-400 dark:text-slate-500">
                      {field.description}
                    </div>
                  ) : null}
                </div>
              );
              if (field.type === "select") {
                const options = Array.isArray(field.values) ? field.values : [];
                return (
                  <div className="flex items-start gap-3" key={field.key}>
                    {label}
                    <Select
                      value={valueString}
                      onValueChange={(nextValue) => {
                        const matched = options.find(
                          (option) => String(option) === nextValue
                        );
                        handleParameterChange(field.key, matched ?? nextValue);
                      }}
                      disabled={disabled}
                    >
                      <SelectTrigger className="h-7 w-28 px-2 text-[11px]">
                        <SelectValue placeholder="请选择" />
                      </SelectTrigger>
                      <SelectContent className="text-[11px]">
                        {options.map((option) => (
                          <SelectItem
                            key={`${field.key}-${String(option)}`}
                            value={String(option)}
                            className="text-[11px]"
                          >
                            {String(option)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              if (field.type === "number") {
                const numericValue =
                  typeof value === "number"
                    ? value
                    : typeof value === "string" && value.trim()
                      ? Number(value)
                      : "";
                return (
                  <div className="flex items-start gap-3" key={field.key}>
                    {label}
                    <div className="flex items-center gap-2 shrink-0">
                      <Input
                        type="number"
                        min={typeof field.min === "number" ? field.min : undefined}
                        max={typeof field.max === "number" ? field.max : undefined}
                        step={typeof field.step === "number" ? field.step : undefined}
                        value={Number.isFinite(numericValue as number) ? numericValue : ""}
                        disabled={disabled}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                          const raw = event.target.value;
                          const nextValue =
                            raw.trim() === "" ? "" : Number.parseFloat(raw);
                          handleParameterChange(
                            field.key,
                            Number.isFinite(nextValue) ? nextValue : ""
                          );
                        }}
                        className="h-7 w-20 px-2 text-[11px]"
                      />
                      {field.unit ? (
                        <div className="text-[11px] text-slate-400 dark:text-slate-500">
                          {field.unit}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              }
              if (field.type === "boolean") {
                return (
                  <div className="flex items-start gap-3" key={field.key}>
                    {label}
                    <Select
                      value={valueString}
                      onValueChange={(nextValue) => {
                        handleParameterChange(field.key, nextValue === "true");
                      }}
                      disabled={disabled}
                    >
                      <SelectTrigger className="h-7 w-24 px-2 text-[11px]">
                        <SelectValue placeholder="请选择" />
                      </SelectTrigger>
                      <SelectContent className="text-[11px]">
                        <SelectItem value="true" className="text-[11px]">
                          是
                        </SelectItem>
                        <SelectItem value="false" className="text-[11px]">
                          否
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              return (
                <div className="flex items-start gap-3" key={field.key}>
                  {label}
                  <Input
                    type="text"
                    value={valueString}
                    disabled={disabled}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      handleParameterChange(field.key, event.target.value);
                    }}
                    className="h-7 w-28 px-2 text-[11px] shrink-0"
                  />
                </div>
              );
            })}
            </div>
          </CardContent>
        </Card>
      ) : null}
      </div>
    </NodeFrame>
  );
}

/** Definition for the video generation node. */
export const VideoGenerateNodeDefinition: CanvasNodeDefinition<VideoGenerateNodeProps> = {
  type: VIDEO_GENERATE_NODE_TYPE,
  schema: VideoGenerateNodeSchema,
  defaultProps: {
    promptText: "",
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
