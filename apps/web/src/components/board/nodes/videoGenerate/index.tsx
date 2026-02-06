import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../../engine/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, LogIn, Play, RotateCcw } from "lucide-react";
import type { ModelParameterFeature } from "@tenas-ai/api/common";
import { toast } from "sonner";

import { useBoardContext } from "../../core/BoardProvider";
import { useMediaModels } from "@/hooks/use-media-models";
import { filterVideoMediaModels } from "../lib/image-generation";
import { Textarea } from "@tenas-ai/ui/textarea";
import { Switch } from "@tenas-ai/ui/switch";
import { getWorkspaceIdFromCookie } from "../../core/boardSession";
import type { ImageNodeProps } from "../ImageNode";
import { normalizeProjectRelativePath } from "@/components/project/filesystem/utils/file-system-utils";
import {
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from "../../core/boardFilePath";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";
import { submitVideoTask } from "@/lib/saas-media";
import { LOADING_NODE_TYPE } from "../LoadingNode";
import { NodeFrame } from "../NodeFrame";
import { resolveRightStackPlacement } from "../../utils/output-placement";
import { getPreviewEndpoint } from "@/lib/image/uri";
import { blobToBase64 } from "../../utils/base64";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import {
  ADVANCED_PANEL_OFFSET_PX,
  VIDEO_GENERATE_DEFAULT_MAX_INPUT_IMAGES,
  VIDEO_GENERATE_NODE_FIRST_GAP,
  VIDEO_GENERATE_NODE_GAP,
  VIDEO_GENERATE_NODE_TYPE,
  VIDEO_GENERATE_OUTPUT_HEIGHT,
  VIDEO_GENERATE_OUTPUT_WIDTH,
} from "./constants";
import { VideoGenerateNodeSchema, type VideoGenerateNodeProps } from "./types";
import { isEmptyParamValue, normalizeTextValue, resolveParameterDefaults } from "./utils";
import { ModelSelect } from "./ModelSelect";
import { AdvancedSettingsPanel } from "./AdvancedSettingsPanel";

export { VIDEO_GENERATE_NODE_TYPE };


/** Render the video generation node. */
export function VideoGenerateNodeView({
  element,
  selected,
  onSelect,
  onUpdate,
}: CanvasNodeViewProps<VideoGenerateNodeProps>) {
  /** Board engine used for lock checks. */
  const { engine, fileContext } = useBoardContext();
  /** SaaS video model list for selection. */
  const { videoModels, refresh: refreshMediaModels } = useMediaModels();
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
  /** Throttle timestamp for focus-driven viewport moves. */
  const focusThrottleRef = useRef(0);
  /** Abort controller for the active request. */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Loading node id for the current generation. */
  const loadingNodeIdRef = useRef<string | null>(null);
  /** Workspace id used for requests. */
  const resolvedWorkspaceId = useMemo(() => getWorkspaceIdFromCookie(), []);
  const isAdvancedOpen = selected;
  const isLocked = engine.isLocked() || element.locked === true;
  const [loginOpen, setLoginOpen] = useState(false);
  const { loggedIn: authLoggedIn, loginStatus, refreshSession } = useSaasAuth();
  const isLoginBusy = loginStatus === "opening" || loginStatus === "polling";
  const [modelSelectOpen, setModelSelectOpen] = useState(false);

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

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);
  useEffect(() => {
    // 逻辑：挂载时主动拉取模型，避免首次加载失败后一直为空。
    void refreshMediaModels();
  }, [refreshMediaModels]);
  useEffect(() => {
    if (!authLoggedIn) return;
    // 逻辑：登录后刷新模型列表，避免首次未登录导致列表为空。
    void refreshMediaModels();
  }, [authLoggedIn, refreshMediaModels]);
  useEffect(() => {
    if (!authLoggedIn) return;
    if (!loginOpen) return;
    setLoginOpen(false);
  }, [authLoggedIn, loginOpen]);

  const inputImageCount = inputImageNodes.length;
  const outputAudio = element.props.outputAudio === true;
  const candidates = useMemo(() => {
    const filtered = filterVideoMediaModels(videoModels, {
      imageCount: inputImageCount,
      hasReference: false,
      hasStartEnd: inputImageCount >= 2,
      withAudio: outputAudio,
    });
    // 逻辑：单图场景下若过滤为空，回退使用全部视频模型避免标签不一致导致无可用模型。
    if (
      !outputAudio &&
      filtered.length === 0 &&
      inputImageCount <= 1 &&
      videoModels.length > 0
    ) {
      return videoModels;
    }
    return filtered;
  }, [inputImageCount, outputAudio, videoModels]);
  const selectedModelId = (element.props.modelId ?? element.props.chatModelId ?? "").trim();
  const hasSelectedModel = useMemo(
    () => candidates.some((item) => item.id === selectedModelId),
    [candidates, selectedModelId]
  );
  const effectiveModelId = useMemo(() => {
    if (selectedModelId && hasSelectedModel) return selectedModelId;
    return candidates[0]?.id ?? "";
  }, [candidates, hasSelectedModel, selectedModelId]);
  const selectedModel = useMemo(
    () => candidates.find((item) => item.id === effectiveModelId),
    [candidates, effectiveModelId]
  );
  const parameterFields = useMemo(
    () => selectedModel?.parameters?.fields ?? [],
    [selectedModel]
  );
  const parameterFeatures = useMemo<ModelParameterFeature[]>(
    () => selectedModel?.parameters?.features ?? [],
    [selectedModel]
  );
  const allowsPrompt =
    parameterFeatures.includes("prompt") || parameterFeatures.length === 0;
  const supportsStartEnd = selectedModel?.capabilities?.input?.supportsStartEnd === true;
  const maxInputImages =
    selectedModel?.capabilities?.input?.maxImages ??
    (supportsStartEnd ? 2 : VIDEO_GENERATE_DEFAULT_MAX_INPUT_IMAGES);

  useEffect(() => {
    // 逻辑：当默认模型可用时自动写入节点，避免用户每次重复选择。
    if (!effectiveModelId) return;
    if (hasSelectedModel) return;
    onUpdate({ modelId: effectiveModelId });
  }, [effectiveModelId, hasSelectedModel, onUpdate]);

  const errorText = element.props.errorText ?? "";
  const localPromptText = normalizeTextValue(element.props.promptText);
  const negativePromptText = normalizeTextValue(element.props.negativePrompt);
  const styleText = normalizeTextValue(element.props.style);
  const styleTags = useMemo(
    () => styleText.split(/[,，、\n]/).map((tag) => tag.trim()).filter(Boolean),
    [styleText]
  );
  const normalizedStyleText = useMemo(() => styleTags.join(","), [styleTags]);
  const outputAspectRatioValue =
    typeof element.props.aspectRatio === "string" && element.props.aspectRatio.trim()
      ? element.props.aspectRatio.trim()
      : "auto";
  const outputAspectRatio =
    outputAspectRatioValue === "auto" ? undefined : outputAspectRatioValue;
  const durationSeconds =
    typeof element.props.durationSeconds === "number" &&
    Number.isFinite(element.props.durationSeconds)
      ? element.props.durationSeconds
      : undefined;
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
  const [aspectRatioOpen, setAspectRatioOpen] = useState(false);

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
    const sideGap = isAdvancedOpen && parameterFields.length > 0
      ? VIDEO_GENERATE_NODE_FIRST_GAP + ADVANCED_PANEL_OFFSET_PX
      : VIDEO_GENERATE_NODE_FIRST_GAP;
    const existingOutputs = engine.doc.getElements().reduce((nodes, item) => {
      if (item.kind !== "connector") return nodes;
      if (!("elementId" in item.source)) return nodes;
      if (item.source.elementId !== element.id) return nodes;
      if (!("elementId" in item.target)) return nodes;
      const target = engine.doc.getElementById(item.target.elementId);
      if (!target || target.kind !== "node") {
        return nodes;
      }
      if (target.type !== "video" && target.type !== LOADING_NODE_TYPE) {
        return nodes;
      }
      return [...nodes, target];
    }, [] as Array<typeof sourceNode>);
    const placement = resolveRightStackPlacement(
      [nodeX, nodeY, nodeW, nodeH],
      existingOutputs.map((target) => target.xywh),
      {
        sideGap,
        stackGap: VIDEO_GENERATE_NODE_GAP,
        outputHeights: [VIDEO_GENERATE_OUTPUT_HEIGHT],
      }
    );
    if (!placement) return null;
    return { baseX: placement.baseX, startY: placement.startY };
  }, [element.id, engine.doc, isAdvancedOpen, parameterFields.length]);

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

  const upstreamPromptText = allowsPrompt ? inputTextSegments.join("\n").trim() : "";
  const sanitizedLocalPrompt = allowsPrompt ? localPromptText.trim() : "";
  // 逻辑：合并上游与本地提示词，保证两者都参与生成。
  const promptText = allowsPrompt
    ? [upstreamPromptText, sanitizedLocalPrompt].filter(Boolean).join("\n")
    : "";
  const hasPrompt = allowsPrompt ? Boolean(promptText) : true;
  const overflowCount = Math.max(0, inputImageCount - maxInputImages);
  const limitedInputImages = inputImageNodes.slice(0, maxInputImages);
  const resolvedImages: Array<{ url: string; mediaType: string }> = [];
  let invalidImageCount = 0;

  for (const imageProps of limitedInputImages) {
    const rawUri = (imageProps?.originalSrc ?? "").trim();
    if (!rawUri) {
      invalidImageCount += 1;
      continue;
    }
    const projectPath = resolveProjectPathFromBoardUri({
      uri: rawUri,
      boardFolderScope,
      currentProjectId,
      rootUri: fileContext?.rootUri,
    });
    if (!projectPath) {
      invalidImageCount += 1;
      continue;
    }
    const previewUrl = getPreviewEndpoint(projectPath, {
      projectId: currentProjectId,
      workspaceId: resolvedWorkspaceId || undefined,
    });
    if (!previewUrl) {
      invalidImageCount += 1;
      continue;
    }
    resolvedImages.push({
      url: previewUrl,
      mediaType: imageProps?.mimeType || "application/octet-stream",
    });
  }

  const hasAnyImageInput = inputImageCount > 0;
  const hasInvalidImages = invalidImageCount > 0;
  const hasTooManyImages = overflowCount > 0;
  const resultVideo = typeof element.props.resultVideo === "string" ? element.props.resultVideo : "";

  const viewStatus = useMemo(() => {
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
    resultVideo,
  ]);

  const canRun =
    (hasPrompt || hasAnyImageInput) &&
    !hasMissingRequiredParameters &&
    !hasTooManyImages &&
    !hasInvalidImages &&
    candidates.length > 0 &&
    Boolean(effectiveModelId) &&
    !engine.isLocked() &&
    !element.locked;
  const canGenerate = authLoggedIn && canRun;
  const primaryLabel = authLoggedIn
    ? viewStatus === "error"
      ? "重试"
      : "生成"
    : isLoginBusy
      ? "登录中"
      : "登录";
  const primaryIcon = authLoggedIn ? (viewStatus === "error" ? RotateCcw : Play) : LogIn;
  const PrimaryIcon = primaryIcon;

  const handleOpenLogin = useCallback(() => {
    if (isLoginBusy) return;
    setLoginOpen(true);
  }, [isLoginBusy]);

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
    async () => {
      const nodeId = element.id;
      const node = engine.doc.getElementById(nodeId);
      if (!node || node.kind !== "node" || node.type !== VIDEO_GENERATE_NODE_TYPE) {
        return;
      }

      const modelId = (effectiveModelId || (node.props as any)?.modelId || "").trim();
      if (!modelId) {
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

      engine.doc.updateNodeProps(nodeId, {
        errorText: "",
        resultVideo: "",
        modelId,
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
        let inputs:
          | {
              images?: Array<{ base64: string; mediaType: string }>;
              startImage?: { base64: string; mediaType: string };
              endImage?: { base64: string; mediaType: string };
            }
          | undefined;
        if (resolvedImages.length > 0) {
          const encodedImages = await Promise.all(
            resolvedImages.map(async (image) => {
              const res = await fetch(image.url ?? "");
              if (!res.ok) {
                throw new Error("图片读取失败");
              }
              const blob = await res.blob();
              const base64 = await blobToBase64(blob);
              return {
                base64,
                mediaType: image.mediaType,
              };
            })
          );
          inputs = supportsStartEnd
            ? {
                ...(encodedImages[0] ? { startImage: encodedImages[0] } : {}),
                ...(encodedImages[1] ? { endImage: encodedImages[1] } : {}),
              }
            : { images: encodedImages };
        }
        const requestParameters = parameterFields.length > 0 ? resolvedParameters : undefined;
        const result = await submitVideoTask({
          modelId,
          prompt: hasPrompt ? promptText : "",
          negativePrompt: negativePromptText || undefined,
          style: normalizedStyleText || undefined,
          inputs,
          output: {
            aspectRatio: outputAspectRatio || undefined,
            duration: durationSeconds || undefined,
          },
          parameters: requestParameters,
          workspaceId: resolvedWorkspaceId || undefined,
          projectId: currentProjectId || undefined,
          saveDir: videoSaveDir || undefined,
          sourceNodeId: nodeId,
        });
        if (!result?.success || !result?.data?.taskId) {
          throw new Error("视频任务提交失败");
        }
        if (loadingNodeIdRef.current) {
          engine.doc.updateNodeProps(loadingNodeIdRef.current, {
            taskId: result.data.taskId,
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
      }
    },
    [
      currentProjectId,
      engine,
      element.id,
      outputAspectRatio,
      durationSeconds,
      effectiveModelId,
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
      supportsStartEnd,
      videoSaveDir,
      maxInputImages,
      clearLoadingNode,
      resolveOutputPlacement,
      normalizedStyleText,
      negativePromptText,
    ]
  );

  const handlePrimaryAction = useCallback(() => {
    if (!authLoggedIn) {
      handleOpenLogin();
      return;
    }
    if (!canRun) return;
    void runVideoGenerate();
  }, [authLoggedIn, canRun, handleOpenLogin, runVideoGenerate]);

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
    viewStatus === "done"
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
        text: `最多支持 ${maxInputImages} 张图片输入，已连接 ${inputImageCount} 张。`,
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
    if (viewStatus === "done") return null;
    if (!hasAnyImageInput && allowsPrompt) {
      return { tone: "info", text: "未连接图片，将以纯文本生成视频。" };
    }
    return null;
  }, [
    allowsPrompt,
    errorText,
    hasAnyImageInput,
    inputImageCount,
    maxInputImages,
    missingRequiredParameters,
    viewStatus,
  ]);

  const containerClassName = [
    "relative flex h-full w-full min-h-0 min-w-0 flex-col gap-2 rounded-xl border border-slate-300/80 bg-white/90 p-3 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-lg",
    "bg-[radial-gradient(180px_circle_at_top_left,rgba(126,232,255,0.45),rgba(255,255,255,0)_60%),radial-gradient(220px_circle_at_85%_15%,rgba(186,255,236,0.35),rgba(255,255,255,0)_65%)]",
    "dark:border-slate-700/90 dark:bg-slate-900/80 dark:text-slate-100 dark:shadow-[0_12px_30px_rgba(0,0,0,0.5)]",
    "dark:bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.6),rgba(15,23,42,0)_48%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.22),rgba(15,23,42,0)_42%)]",
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
      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
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
          <button
            type="button"
            disabled={authLoggedIn ? !canGenerate : isLoginBusy}
            className="inline-flex h-7 items-center justify-center rounded-md border border-slate-200/80 bg-background px-2.5 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-800"
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect();
              handlePrimaryAction();
            }}
          >
            <span className="inline-flex items-center gap-1">
              {PrimaryIcon ? <PrimaryIcon size={12} /> : null}
              {primaryLabel}
            </span>
          </button>
        </div>
      </div>

      <div className="mt-1 flex min-h-0 flex-1 flex-col gap-2" data-board-editor>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">输出音频</div>
          <Switch
            checked={outputAudio}
            onCheckedChange={(checked) => {
              onUpdate({ outputAudio: checked });
            }}
            disabled={isLocked}
            aria-label="输出音频"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">模型</div>
          <div className="min-w-0 flex-1">
            <ModelSelect
              authLoggedIn={authLoggedIn}
              isLoginBusy={isLoginBusy}
              candidates={candidates}
              selectedModel={selectedModel}
              effectiveModelId={effectiveModelId}
              disabled={isLocked}
              modelSelectOpen={modelSelectOpen}
              onOpenChange={setModelSelectOpen}
              onSelect={onSelect}
              onSelectModel={(modelId) => {
                onUpdate({ modelId });
              }}
              onOpenLogin={handleOpenLogin}
            />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          {allowsPrompt ? (
            <>
              <div className="text-[12px] text-slate-500 dark:text-slate-400">提示词</div>
              <div className="min-w-0 flex min-h-0 flex-1 flex-col gap-1">
                <Textarea
                  value={localPromptText}
                  maxLength={500}
                  placeholder="请输入提示词"
                  onChange={(event) => {
                    const next = event.target.value.slice(0, 500);
                    onUpdate({ promptText: next });
                  }}
                  data-board-scroll
                  className="h-full min-h-[96px] flex-1 overflow-y-auto px-3 py-2 text-[13px] leading-5 text-slate-600 shadow-none placeholder:text-slate-400 focus-visible:ring-0 dark:text-slate-200 dark:placeholder:text-slate-500 md:text-[13px]"
                  disabled={isLocked}
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
      <AdvancedSettingsPanel
        open={isAdvancedOpen}
        parameterFields={parameterFields}
        resolvedParameters={resolvedParameters}
        onParameterChange={handleParameterChange}
        aspectRatioValue={outputAspectRatioValue}
        aspectRatioOpen={aspectRatioOpen}
        onAspectRatioOpenChange={setAspectRatioOpen}
        onAspectRatioChange={(value) => {
          onUpdate({ aspectRatio: value });
        }}
        durationSeconds={durationSeconds}
        onDurationChange={(value) => {
          onUpdate({ durationSeconds: value });
        }}
        styleTags={styleTags}
        onStyleChange={(value) => {
          // 逻辑：风格字段按逗号分隔。
          onUpdate({ style: value.join(",") });
        }}
        negativePromptText={negativePromptText}
        onNegativePromptChange={(value) => {
          onUpdate({ negativePrompt: value });
        }}
        disabled={isLocked}
      />
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
    outputAudio: false,
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
