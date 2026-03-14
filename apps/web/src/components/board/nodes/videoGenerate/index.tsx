/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../../engine/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Film, LogIn, Play, RotateCcw, Settings } from "lucide-react";
import type { ModelCapabilities, ModelParameterFeature } from "@openloaf/api/common";
import { toast } from "sonner";

import { useBoardContext } from "../../core/BoardProvider";
import { useMediaModels } from "@/hooks/use-media-models";
import { filterVideoMediaModels } from "../lib/image-generation";
import { Switch } from "@openloaf/ui/switch";
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
import { useAutoResizeNode } from "../lib/use-auto-resize-node";
import { resolveRightStackPlacement } from "../../utils/output-placement";
import { getPreviewEndpoint } from "@/lib/image/uri";
import { blobToBase64 } from "../../utils/base64";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import { useTranslation } from "react-i18next";
import { cn } from "@udecode/cn";
import {
  VIDEO_GENERATE_DEFAULT_MAX_INPUT_IMAGES,
  VIDEO_GENERATE_NODE_FIRST_GAP,
  VIDEO_GENERATE_NODE_GAP,
  VIDEO_GENERATE_NODE_TYPE,
  VIDEO_GENERATE_OUTPUT_HEIGHT,
  VIDEO_GENERATE_OUTPUT_WIDTH,
} from "./constants";
import {
  BOARD_GENERATE_NODE_BASE_VIDEO,
  BOARD_GENERATE_BORDER_VIDEO,
  BOARD_GENERATE_SELECTED_VIDEO,
  BOARD_GENERATE_ERROR,
  BOARD_GENERATE_BTN_VIDEO,
  BOARD_GENERATE_PILL_VIDEO,
  BOARD_GENERATE_DOT_VIDEO,
} from "../../ui/board-style-system";
import { VideoGenerateNodeSchema, type VideoGenerateNodeProps } from "./types";
import { isEmptyParamValue, normalizeTextValue, resolveParameterDefaults } from "./utils";
import { ModelSelect } from "./ModelSelect";
import { AdvancedSettingsPanel } from "./AdvancedSettingsPanel";
import { getBoardChatMessageMeta } from "../../utils/board-chat-message";
import { createBoardChatMessageToolbarItems } from "../../utils/board-chat-toolbar";

export { VIDEO_GENERATE_NODE_TYPE };


/** Render the read-only chat projection for video generation parts. */
function VideoGenerateProjectionView({
  element,
  selected,
  onSelect,
}: CanvasNodeViewProps<VideoGenerateNodeProps>) {
  const { t } = useTranslation("board");
  const { fileContext } = useBoardContext();
  const status = element.props.projectionStatus ?? (
    element.props.errorText
      ? "error"
      : element.props.resultVideo
        ? "done"
        : "generating"
  );

  return (
    <NodeFrame>
      <div
        className={cn(
          "flex h-full w-full flex-col overflow-hidden rounded-xl border",
          BOARD_GENERATE_NODE_BASE_VIDEO,
          selected ? BOARD_GENERATE_SELECTED_VIDEO : BOARD_GENERATE_BORDER_VIDEO,
          status === "error" && BOARD_GENERATE_ERROR,
        )}
        onClick={onSelect}
      >
        <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2">
          <Film className="h-4 w-4 text-ol-purple" />
          <span className="text-xs font-medium text-ol-purple">
            {t("videoGenerate.title")}
          </span>
          <span className={cn("ml-auto rounded-md px-1.5 py-0.5 text-[10px]", BOARD_GENERATE_PILL_VIDEO)}>
            {status === "generating"
              ? t("chatMessage.streaming")
              : status === "error"
                ? t("videoGenerate.hints.generateFailed")
                : t("videoGenerate.status.completed")}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-auto p-3">
          {element.props.promptText ? (
            <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
              {element.props.promptText}
            </div>
          ) : null}
          {status === "generating" ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full animate-pulse", BOARD_GENERATE_DOT_VIDEO)} />
              <span>{t("chatMessage.thinking")}</span>
            </div>
          ) : null}
          {status === "error" && element.props.errorText ? (
            <div className="text-xs text-destructive whitespace-pre-wrap break-words">
              {element.props.errorText}
            </div>
          ) : null}
          {element.props.resultVideo ? (
            <video
              src={getPreviewEndpoint(element.props.resultVideo, { projectId: fileContext?.projectId })}
              className="aspect-video w-full rounded-lg border border-border/30 object-cover"
              controls
            />
          ) : null}
        </div>
      </div>
    </NodeFrame>
  );
}

/** Render the editable video generation node. */
function EditableVideoGenerateNodeView({
  element,
  selected,
  onSelect,
  onUpdate,
}: CanvasNodeViewProps<VideoGenerateNodeProps>) {
  const { t } = useTranslation('board');
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
    // 逻辑：独立画布无 projectId 时回退到 file:// URI，确保服务端能保存到文件。
    if (fileContext?.boardFolderUri) {
      return `${fileContext.boardFolderUri}/${BOARD_ASSETS_DIR_NAME}`;
    }
    return "";
  }, [boardFolderScope, fileContext?.boardFolderUri]);
  /** Throttle timestamp for focus-driven viewport moves. */
  const focusThrottleRef = useRef(0);
  /** Abort controller for the active request. */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Loading node id for the current generation. */
  const loadingNodeIdRef = useRef<string | null>(null);
  const [isAdvancedOpen, setAdvancedOpen] = useState(false);
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
      continue;
    }
    if (source.type === "chat_message") {
      const urls = (source.props as any)?.resolvedImageUrls;
      if (Array.isArray(urls)) {
        for (const url of urls) {
          if (typeof url === "string" && url.trim()) {
            inputImageNodes.push({
              originalSrc: url,
              previewSrc: url,
              mimeType: "image/png",
              fileName: url.split("/").pop() || "image.png",
              naturalWidth: 0,
              naturalHeight: 0,
            });
          }
        }
      }
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
  const selectedCapabilities = selectedModel?.capabilities as
    | ModelCapabilities
    | undefined;
  const parameterFields = useMemo(
    () => selectedCapabilities?.params?.fields ?? [],
    [selectedCapabilities]
  );
  const parameterFeatures = useMemo<ModelParameterFeature[]>(
    () => selectedCapabilities?.params?.features ?? [],
    [selectedCapabilities]
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
  const propsPromptText = normalizeTextValue(element.props.promptText);
  const composingRef = useRef(false);
  const [localPromptText, setLocalPromptText] = useState(propsPromptText);
  // Sync from props when not composing (e.g. undo/redo, external updates)
  useEffect(() => {
    if (!composingRef.current) {
      setLocalPromptText(propsPromptText);
    }
  }, [propsPromptText]);
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
    const sideGap = VIDEO_GENERATE_NODE_FIRST_GAP;
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
      ? t('videoGenerate.retry')
      : t('videoGenerate.generate')
    : isLoginBusy
      ? t('videoGenerate.loggingIn')
      : t('videoGenerate.login');
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
    const copyText = errorText.trim() || t('videoGenerate.hints.generateFailed');
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
      toast.success(t('videoGenerate.errors.copyErrorSuccess'));
    } catch {
      toast.error(t('videoGenerate.errors.copyFailed'));
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
          errorText: t('videoGenerate.errors.noModelSupport'),
        });
        return;
      }

      if (!hasPrompt && !hasAnyImageInput) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: t('videoGenerate.errors.noPrompt'),
        });
        return;
      }

      if (hasMissingRequiredParameters) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: t('videoGenerate.errors.missingParameters'),
        });
        return;
      }

      if (hasTooManyImages) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: t('videoGenerate.errors.tooManyImages', { max: maxInputImages }),
        });
        return;
      }

      if (hasInvalidImages) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: t('videoGenerate.errors.invalidImageUrl'),
        });
        return;
      }

      if (!videoSaveDir) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: t('videoGenerate.errors.saveDirFailed'),
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
                throw new Error(t('videoGenerate.errors.imageReadFailed'));
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
          projectId: currentProjectId || undefined,
          saveDir: videoSaveDir || undefined,
          sourceNodeId: nodeId,
        });
        if (!result?.success || !result?.data?.taskId) {
          throw new Error(t('videoGenerate.errors.submitFailed'));
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
            errorText: error instanceof Error ? error.message : t('videoGenerate.errors.generateFailed'),
          });
          toast.error(t('videoGenerate.errors.generateFailed'));
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
      ? t('videoGenerate.status.completed')
    : viewStatus === "error"
      ? t('videoGenerate.status.failed')
    : viewStatus === "needs_model"
      ? t('videoGenerate.status.needModel')
    : viewStatus === "needs_prompt"
      ? t('videoGenerate.status.needsPrompt')
    : viewStatus === "missing_parameters"
      ? t('videoGenerate.status.missingParams')
    : viewStatus === "too_many_images"
      ? t('videoGenerate.status.tooManyImages')
    : viewStatus === "invalid_image"
      ? t('videoGenerate.status.invalidImage')
    : t('videoGenerate.status.idle');

  const statusHint = useMemo(() => {
    if (viewStatus === "needs_prompt") {
      return { tone: "warn", text: t('videoGenerate.hints.needsPrompt') };
    }
    if (viewStatus === "missing_parameters") {
      const requiredText = missingRequiredParameters
        .map((field) => field.title || field.key)
        .join("、");
      return { tone: "warn", text: t('videoGenerate.hints.missingParameters', { required: requiredText }) };
    }
    if (viewStatus === "too_many_images") {
      return {
        tone: "warn",
        text: t('videoGenerate.hints.tooManyImages', { max: maxInputImages, connected: inputImageCount }),
      };
    }
    if (viewStatus === "invalid_image") {
      return {
        tone: "warn",
        text: t('videoGenerate.hints.invalidImage'),
      };
    }
    if (viewStatus === "needs_model") {
      return { tone: "warn", text: t('videoGenerate.hints.needsModel') };
    }
    if (viewStatus === "error") {
      return { tone: "error", text: errorText || t('videoGenerate.hints.generateFailed') };
    }
    if (viewStatus === "done") return null;
    return null;
  }, [
    errorText,
    inputImageCount,
    maxInputImages,
    missingRequiredParameters,
    t,
    viewStatus,
  ]);

  const { containerRef } = useAutoResizeNode({
    engine,
    elementId: element.id,
    minHeight: 0,
  });

  const containerClassName = cn(
    "relative flex w-full min-w-0 flex-col rounded-xl border overflow-hidden text-ol-text-primary transition-all duration-150",
    BOARD_GENERATE_NODE_BASE_VIDEO,
    viewStatus === "error"
      ? BOARD_GENERATE_ERROR
      : selected
        ? BOARD_GENERATE_SELECTED_VIDEO
        : BOARD_GENERATE_BORDER_VIDEO,
  );

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
      <div ref={containerRef} className={containerClassName}>
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
          <Film className="h-4 w-4 shrink-0 text-ol-purple" />
          <div className="text-xs font-medium text-ol-purple">{t('videoGenerate.title')}</div>
          <span className={cn("rounded-md px-2 py-0.5 text-[10px] leading-3", BOARD_GENERATE_PILL_VIDEO)}>
            {statusLabel}
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 p-3 flex flex-col gap-2" data-board-editor>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-ol-text-auxiliary">{t('videoGenerate.outputAudio')}</div>
            <Switch
              checked={outputAudio}
              onCheckedChange={(checked) => {
                onUpdate({ outputAudio: checked });
              }}
              disabled={isLocked}
              aria-label={t('videoGenerate.outputAudio')}
            />
          </div>
          {allowsPrompt ? (
            <textarea
              className="w-full min-h-[60px] resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              value={localPromptText}
              maxLength={500}
              placeholder={t('videoGenerate.promptPlaceholder')}
              onChange={(event) => {
                const next = event.target.value.slice(0, 500);
                setLocalPromptText(next);
                if (!composingRef.current) {
                  onUpdate({ promptText: next });
                }
              }}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={(event) => {
                composingRef.current = false;
                const next = (event.target as HTMLTextAreaElement).value.slice(0, 500);
                setLocalPromptText(next);
                onUpdate({ promptText: next });
              }}
              data-board-scroll
              disabled={isLocked}
            />
          ) : null}
        </div>

        {/* Advanced Settings (between body and footer) */}
        {isAdvancedOpen ? (
          <div
            className="px-3 pb-2"
            data-board-editor
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          >
            <AdvancedSettingsPanel
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
                onUpdate({ style: value.join(",") });
              }}
              negativePromptText={negativePromptText}
              onNegativePromptChange={(value) => {
                onUpdate({ negativePrompt: value });
              }}
              disabled={isLocked}
            />
          </div>
        ) : null}

        {/* Footer */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border/20">
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
          <button
            type="button"
            className={cn(
              "shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150",
              isAdvancedOpen
                ? "bg-ol-purple-bg text-ol-purple"
                : "text-ol-text-auxiliary hover:bg-ol-surface-muted",
            )}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect();
              setAdvancedOpen((prev) => !prev);
            }}
          >
            <Settings size={14} />
          </button>
          <button
            type="button"
            disabled={authLoggedIn ? !canGenerate : isLoginBusy}
            className={cn(
              "shrink-0 inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 disabled:opacity-50",
              BOARD_GENERATE_BTN_VIDEO,
            )}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect();
              handlePrimaryAction();
            }}
          >
            <span className="inline-flex items-center gap-1">
              {PrimaryIcon ? <PrimaryIcon size={14} /> : null}
              {primaryLabel}
            </span>
          </button>
        </div>
      </div>
      {statusHint ? (
        <div
          className="absolute left-0 top-full z-10 mt-2 w-full px-1"
          data-board-editor
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          {statusHint.tone === "error" ? (
            <div className="relative rounded-xl bg-ol-red-bg/80 p-2 text-[11px] leading-4 text-ol-red">
              <button
                type="button"
                className="absolute right-2 top-2 rounded-md bg-ol-red/10 px-2 py-0.5 text-[10px] text-ol-red hover:bg-ol-red/20"
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={handleCopyError}
              >
                <span className="inline-flex items-center gap-1">
                  <Copy size={10} />
                  {t('selection.toolbar.copy')}
                </span>
              </button>
              <pre className="whitespace-pre-wrap break-words pr-14 font-sans">
                {statusHint.text}
              </pre>
            </div>
          ) : (
            <div
              className={cn(
                "rounded-xl px-2 py-1.5 text-[11px] leading-4",
                statusHint.tone === "warn"
                  ? "bg-ol-amber-bg/80 text-ol-amber"
                  : "bg-ol-blue-bg/80 text-ol-blue",
              )}
            >
              {statusHint.text}
            </div>
          )}
        </div>
      ) : null}
    </NodeFrame>
  );
}

/** Render a video generation node, switching to chat projection mode when needed. */
export function VideoGenerateNodeView(props: CanvasNodeViewProps<VideoGenerateNodeProps>) {
  if (props.element.props.readOnlyProjection) {
    return <VideoGenerateProjectionView {...props} />;
  }

  return <EditableVideoGenerateNodeView {...props} />;
}

/** Definition for the video generation node. */
export const VideoGenerateNodeDefinition: CanvasNodeDefinition<VideoGenerateNodeProps> = {
  type: VIDEO_GENERATE_NODE_TYPE,
  schema: VideoGenerateNodeSchema,
  defaultProps: {
    promptText: "",
    outputAudio: false,
    resultVideo: "",
    readOnlyProjection: false,
  },
  view: VideoGenerateNodeView,
  capabilities: {
    resizable: false,
    connectable: "anchors",
    minSize: { w: 320, h: 280 },
  },
  toolbar: (ctx) => {
    if (!ctx.element.props.readOnlyProjection) return [];
    const messageMeta = getBoardChatMessageMeta(ctx.element);
    return messageMeta ? createBoardChatMessageToolbarItems(ctx, messageMeta) : [];
  },
};
