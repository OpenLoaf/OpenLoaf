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
import { Check, Copy, ImagePlus, LogIn, RotateCcw, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { cn } from "@udecode/cn";

import { useBoardContext } from "../../core/BoardProvider";
import { useMediaModels } from "@/hooks/use-media-models";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import type { ImageNodeProps } from "../ImageNode";


import {
  IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT,
  IMAGE_GENERATE_MAX_INPUT_IMAGES,
  filterImageMediaModels,
} from "../lib/image-generation";
import { resolveRightStackPlacement } from "../../utils/output-placement";
import {
  normalizeProjectRelativePath,
} from "@/components/project/filesystem/utils/file-system-utils";
import {
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from "../../core/boardFilePath";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";
import { submitImageTask } from "@/lib/saas-media";
import { DEFAULT_NODE_SIZE } from "../../engine/constants";
import { LOADING_NODE_TYPE } from "../LoadingNode";
import { NodeFrame } from "../NodeFrame";
import { useAutoResizeNode } from "../lib/use-auto-resize-node";
import { getPreviewEndpoint } from "@/lib/image/uri";
import { blobToBase64 } from "../../utils/base64";
import {
  GENERATED_IMAGE_NODE_FIRST_GAP,
  GENERATED_IMAGE_NODE_GAP,
  IMAGE_GENERATE_ASPECT_RATIO_OPTIONS,
  IMAGE_GENERATE_NODE_TYPE,
} from "./constants";
import {
  BOARD_GENERATE_NODE_BASE_IMAGE,
  BOARD_GENERATE_BORDER_IMAGE,
  BOARD_GENERATE_SELECTED_IMAGE,
  BOARD_GENERATE_ERROR,
  BOARD_GENERATE_BTN_IMAGE,
  BOARD_GENERATE_PILL_IMAGE,
  BOARD_GENERATE_DOT_IMAGE,
} from "../../ui/board-style-system";
import { ImageGenerateNodeSchema, type ImageGenerateNodeProps } from "./types";
import { normalizeOutputCount, normalizeTextValue } from "./utils";
import { AdvancedSettingsPanel } from "./AdvancedSettingsPanel";
import { ModelSelect } from "./ModelSelect";
import { getBoardChatMessageMeta } from "../../utils/board-chat-message";
import { createBoardChatMessageToolbarItems } from "../../utils/board-chat-toolbar";

export { IMAGE_GENERATE_NODE_TYPE };

/** Render the read-only chat projection for image generation parts. */
function ImageGenerateProjectionView({
  element,
  selected,
  onSelect,
}: CanvasNodeViewProps<ImageGenerateNodeProps>) {
  const { t } = useTranslation("board");
  const { fileContext } = useBoardContext();
  const status = element.props.projectionStatus ?? (
    element.props.errorText
      ? "error"
      : (element.props.resultImages?.length ?? 0) > 0
        ? "done"
        : "generating"
  );

  return (
    <NodeFrame>
      <div
        className={cn(
          "flex h-full w-full flex-col overflow-hidden rounded-xl border",
          BOARD_GENERATE_NODE_BASE_IMAGE,
          selected ? BOARD_GENERATE_SELECTED_IMAGE : BOARD_GENERATE_BORDER_IMAGE,
          status === "error" && BOARD_GENERATE_ERROR,
        )}
        onClick={onSelect}
      >
        <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2">
          <Sparkles className="h-4 w-4 text-ol-blue" />
          <span className="text-xs font-medium text-ol-blue">
            {t("imageGenerate.title")}
          </span>
          <span className={cn("ml-auto rounded-md px-1.5 py-0.5 text-[10px]", BOARD_GENERATE_PILL_IMAGE)}>
            {status === "generating"
              ? t("chatMessage.streaming")
              : status === "error"
                ? t("imageGenerate.hints.generateFailed")
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
              <span className={cn("h-2 w-2 rounded-full animate-pulse", BOARD_GENERATE_DOT_IMAGE)} />
              <span>{t("chatMessage.thinking")}</span>
            </div>
          ) : null}
          {status === "error" && element.props.errorText ? (
            <div className="text-xs text-destructive whitespace-pre-wrap break-words">
              {element.props.errorText}
            </div>
          ) : null}
          {(element.props.resultImages?.length ?? 0) > 0 ? (
            <div className="grid grid-cols-1 gap-2">
              {element.props.resultImages?.map((url, index) => (
                <img
                  key={`${url}:${index}`}
                  src={getPreviewEndpoint(url, { projectId: fileContext?.projectId })}
                  alt=""
                  className="max-h-[180px] w-full rounded-lg border border-border/30 object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </NodeFrame>
  );
}

/** Render the editable image generation node. */
function EditableImageGenerateNodeView({
  element,
  selected,
  onSelect,
  onUpdate,
}: CanvasNodeViewProps<ImageGenerateNodeProps>) {
  const { t } = useTranslation('board');
  /** Board engine used for lock checks and connector queries. */
  const { engine, fileContext } = useBoardContext();
  /** SaaS image model list for selection. */
  const { imageModels } = useMediaModels();
  /** Board folder scope used for resolving relative asset uris. */
  const boardFolderScope = useMemo(
    () => resolveBoardFolderScope(fileContext),
    [fileContext?.boardFolderUri, fileContext?.projectId, fileContext?.rootUri]
  );
  const currentProjectId = boardFolderScope?.projectId ?? fileContext?.projectId;
  const imageSaveDir = useMemo(() => {
    if (boardFolderScope) {
      // 逻辑：默认写入画布资产目录，避免图片散落在画布根目录。
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
  /** Abort controller for the active request. */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Throttle timestamp for focus-driven viewport moves. */
  const focusThrottleRef = useRef(0);
  /** Loading node id for the current generation. */
  const loadingNodeIdRef = useRef<string | null>(null);
  const [isAdvancedOpen, setAdvancedOpen] = useState(false);
  const isLocked = engine.isLocked() || element.locked === true;
  const [loginOpen, setLoginOpen] = useState(false);
  const { loggedIn: authLoggedIn, loginStatus, refreshSession } = useSaasAuth();
  const isLoginBusy = loginStatus === "opening" || loginStatus === "polling";
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const [modelSelectOpen, setModelSelectOpen] = useState(false);
  const [aspectRatioOpen, setAspectRatioOpen] = useState(false);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (!authLoggedIn) return;
    if (!loginOpen) return;
    setLoginOpen(false);
  }, [authLoggedIn, loginOpen]);

  const errorText = element.props.errorText ?? "";
  const outputCount = normalizeOutputCount(element.props.outputCount);
  const outputAspectRatioValue =
    typeof element.props.outputAspectRatio === "string" &&
    element.props.outputAspectRatio.trim()
      ? element.props.outputAspectRatio.trim()
      : "auto";
  const outputAspectRatio =
    outputAspectRatioValue === "auto"
      ? undefined
      : IMAGE_GENERATE_ASPECT_RATIO_OPTIONS.includes(
            outputAspectRatioValue as (typeof IMAGE_GENERATE_ASPECT_RATIO_OPTIONS)[number]
          )
        ? (outputAspectRatioValue as (typeof IMAGE_GENERATE_ASPECT_RATIO_OPTIONS)[number])
        : undefined;
  const propsPromptText = normalizeTextValue(element.props.promptText);
  const composingRef = useRef(false);
  const [localPromptText, setLocalPromptText] = useState(propsPromptText);
  // Sync from props when not composing (e.g. undo/redo, external updates)
  useEffect(() => {
    if (!composingRef.current) {
      setLocalPromptText(propsPromptText);
    }
  }, [propsPromptText]);
  const styleText = normalizeTextValue(element.props.style);
  const negativePromptText = normalizeTextValue(element.props.negativePrompt);
  const styleTags = useMemo(
    () => styleText.split(/[,，、\n]/).map((tag) => tag.trim()).filter(Boolean),
    [styleText]
  );
  const normalizedStyleText = useMemo(
    () => styleTags.join(","),
    [styleTags]
  );

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

  const upstreamPromptText = inputTextSegments.join("\n").trim();
  const sanitizedLocalPrompt = localPromptText.trim();
  // 逻辑：合并上游与本地提示词，保证两者都参与生成。
  const promptText = [upstreamPromptText, sanitizedLocalPrompt]
    .filter(Boolean)
    .join("\n");
  const hasPrompt = Boolean(promptText);
  const inputImageCount = inputImageNodes.length;
  const hasAnyImageInput = inputImageCount > 0;
  const hasMaskInput = false;

  const candidates = useMemo(() => {
    return filterImageMediaModels(imageModels, {
      imageCount: inputImageCount,
      hasMask: hasMaskInput,
      outputCount,
    });
  }, [imageModels, inputImageCount, hasMaskInput, outputCount]);

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

  const maxInputImages =
    selectedModel?.capabilities?.input?.maxImages ?? IMAGE_GENERATE_MAX_INPUT_IMAGES;
  const overflowCount = Math.max(0, inputImageNodes.length - maxInputImages);
  const limitedInputImages = inputImageNodes.slice(0, maxInputImages);
  const resolvedImages: Array<{ url?: string; base64?: string; mediaType: string }> = [];
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

  const hasInvalidImages = invalidImageCount > 0;
  const hasTooManyImages = overflowCount > 0;

  const inputSummary = useMemo(() => {
    if (inputImageCount === 0) return t('imageGenerate.mode.textToImage');
    if (inputImageCount === 1) return t('imageGenerate.mode.singleImage');
    return t('imageGenerate.mode.multiImage');
  }, [inputImageCount, t]);
  const inputSummaryText = hasMaskInput ? `${inputSummary} + 遮罩` : inputSummary;

  useEffect(() => {
    // 逻辑：当默认模型可用时自动写入节点，避免用户每次重复选择。
    if (!effectiveModelId) return;
    if (hasSelectedModel) return;
    onUpdate({ modelId: effectiveModelId });
  }, [effectiveModelId, hasSelectedModel, onUpdate]);

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

  useEffect(() => {
    return () => {
      if (!abortControllerRef.current) return;
      // 逻辑：节点卸载时中止请求，避免泄露连接。
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const resolveOutputPlacement = useCallback(() => {
    const sourceNode = engine.doc.getElementById(element.id);
    if (!sourceNode || sourceNode.kind !== "node") return null;
    const [nodeX, nodeY, nodeW, nodeH] = sourceNode.xywh;
    const sideGap = GENERATED_IMAGE_NODE_FIRST_GAP;
    const existingOutputs = engine.doc.getElements().reduce((nodes, item) => {
      if (item.kind !== "connector") return nodes;
      if (!("elementId" in item.source)) return nodes;
      if (item.source.elementId !== element.id) return nodes;
      if (!("elementId" in item.target)) return nodes;
      const target = engine.doc.getElementById(item.target.elementId);
      if (!target || target.kind !== "node") return nodes;
      if (target.type !== "image" && target.type !== LOADING_NODE_TYPE) return nodes;
      return [...nodes, target];
    }, [] as Array<typeof sourceNode>);
    const placement = resolveRightStackPlacement(
      [nodeX, nodeY, nodeW, nodeH],
      existingOutputs.map((target) => target.xywh),
      {
        sideGap,
        stackGap: GENERATED_IMAGE_NODE_GAP,
        outputHeights: [DEFAULT_NODE_SIZE[1]],
      }
    );
    if (placement) return { baseX: placement.baseX, startY: placement.startY };
    return { baseX: nodeX + nodeW + sideGap, startY: nodeY };
  }, [element.id, engine.doc]);

  /** Run an image generation request via SaaS. */
  const runImageGenerate = useCallback(async () => {
    const nodeId = element.id;
    const node = engine.doc.getElementById(nodeId);
    if (!node || node.kind !== "node" || node.type !== IMAGE_GENERATE_NODE_TYPE) {
      return;
    }

    const modelId = (effectiveModelId || (node.props as any)?.modelId || "").trim();
    if (!modelId) {
      engine.doc.updateNodeProps(nodeId, {
        errorText: t('imageGenerate.errors.noModelSupport'),
      });
      return;
    }

    if (!hasPrompt) {
      engine.doc.updateNodeProps(nodeId, {
        errorText: t('imageGenerate.errors.noPrompt'),
      });
      return;
    }

    if (hasTooManyImages) {
      engine.doc.updateNodeProps(nodeId, {
        errorText: t('imageGenerate.errors.tooManyImages', { max: maxInputImages }),
      });
      return;
    }

    if (hasInvalidImages) {
      engine.doc.updateNodeProps(nodeId, {
        errorText: t('imageGenerate.errors.invalidImageUrl'),
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
      modelId,
    });

    try {
      const placement = resolveOutputPlacement();
      if (placement) {
        const selectionSnapshot = engine.selection.getSelectedIds();
        const loadingNodeId = engine.addNodeElement(
          LOADING_NODE_TYPE,
          {
            taskType: "image_generate",
            sourceNodeId: nodeId,
            promptText,
            projectId: currentProjectId || undefined,
            saveDir: imageSaveDir || undefined,
          },
          [
            placement.baseX,
            placement.startY,
            DEFAULT_NODE_SIZE[0],
            DEFAULT_NODE_SIZE[1],
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
            images: Array<{ base64: string; mediaType: string }>;
          }
        | undefined;
      if (resolvedImages.length > 0) {
        const encodedImages = await Promise.all(
          resolvedImages.map(async (image) => {
            const res = await fetch(image.url ?? "");
            if (!res.ok) {
              throw new Error(t('imageGenerate.errors.imageReadFailed'));
            }
            const blob = await res.blob();
            const base64 = await blobToBase64(blob);
            return {
              base64,
              mediaType: image.mediaType,
            };
          })
        );
        inputs = { images: encodedImages };
      }
      const payload = {
        modelId,
        prompt: promptText,
        negativePrompt: negativePromptText || undefined,
        style: normalizedStyleText || undefined,
        inputs,
        output: {
          count: outputCount,
          aspectRatio: outputAspectRatio || undefined,
        },
        parameters: element.props.parameters ?? undefined,
        projectId: currentProjectId || undefined,
        saveDir: imageSaveDir || undefined,
        sourceNodeId: nodeId,
      };
      const result = await submitImageTask(payload);
      if (!result?.success || !result?.data?.taskId) {
        throw new Error(t('imageGenerate.errors.submitFailed'));
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
          errorText: error instanceof Error ? error.message : t('imageGenerate.errors.generateFailed'),
        });
        toast.error(t('imageGenerate.errors.generateFailed'));
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [
    clearLoadingNode,
    currentProjectId,
    effectiveModelId,
    element.id,
    engine,
    hasInvalidImages,
    hasPrompt,
    hasTooManyImages,
    imageSaveDir,
    maxInputImages,
    negativePromptText,
    outputCount,
    outputAspectRatio,
    promptText,
    resolvedImages,
    resolveOutputPlacement,
    styleText,
  ]);

  const outputImages = Array.isArray(element.props.resultImages)
    ? element.props.resultImages
    : [];

  const viewStatus = useMemo(() => {
    if (!hasPrompt) return "needs_prompt";
    if (hasTooManyImages) return "too_many_images";
    if (hasInvalidImages) return "invalid_image";
    if (candidates.length === 0) return "needs_model";
    if (errorText) return "error";
    if (outputImages.length > 0) return "done";
    return "idle";
  }, [
    candidates.length,
    errorText,
    hasInvalidImages,
    hasPrompt,
    hasTooManyImages,
    outputImages.length,
  ]);

  const containerClassName = cn(
    "relative flex w-full min-w-0 flex-col rounded-xl border overflow-hidden text-ol-text-primary transition-all duration-150",
    BOARD_GENERATE_NODE_BASE_IMAGE,
    viewStatus === "error"
      ? BOARD_GENERATE_ERROR
      : selected
        ? BOARD_GENERATE_SELECTED_IMAGE
        : BOARD_GENERATE_BORDER_IMAGE,
  );

  const statusHint = useMemo(() => {
    if (viewStatus === "needs_prompt") {
      return { tone: "warn", text: t('imageGenerate.hints.needsPrompt') };
    }
    if (viewStatus === "too_many_images") {
      return {
        tone: "warn",
        text: t('imageGenerate.hints.tooManyImages', { max: maxInputImages, connected: inputImageNodes.length }),
      };
    }
    if (viewStatus === "invalid_image") {
      return { tone: "warn", text: t('imageGenerate.hints.invalidImage') };
    }
    if (viewStatus === "needs_model") {
      return {
        tone: "warn",
        text: t('imageGenerate.hints.needsModel'),
      };
    }
    if (viewStatus === "error") {
      return { tone: "error", text: errorText || t('imageGenerate.hints.generateFailed') };
    }
    if (viewStatus === "done") return null;
    return null;
  }, [
    errorText,
    inputImageNodes.length,
    maxInputImages,
    t,
    viewStatus,
  ]);

  const canRun =
    hasPrompt &&
    !hasTooManyImages &&
    !hasInvalidImages &&
    candidates.length > 0 &&
    Boolean(effectiveModelId) &&
    !engine.isLocked() &&
    !element.locked;
  const canGenerate = authLoggedIn && canRun;
  const primaryLabel = authLoggedIn
    ? viewStatus === "error"
      ? t('imageGenerate.retry')
      : t('imageGenerate.generate')
    : isLoginBusy
      ? t('imageGenerate.loggingIn')
      : t('imageGenerate.login');
  const primaryIcon = authLoggedIn
    ? viewStatus === "error"
      ? RotateCcw
      : Sparkles
    : LogIn;
  const PrimaryIcon = primaryIcon;

  const handleOpenLogin = useCallback(() => {
    if (isLoginBusy) return;
    setLoginOpen(true);
  }, [isLoginBusy]);
  const handlePrimaryAction = useCallback(() => {
    if (!authLoggedIn) {
      handleOpenLogin();
      return;
    }
    if (!canRun) return;
    void runImageGenerate();
  }, [authLoggedIn, canRun, handleOpenLogin, runImageGenerate]);

  const handleCopyError = useCallback(async () => {
    const copyText = errorText.trim() || t('imageGenerate.hints.generateFailed');
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
      setCopied(true);
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 1600);
    } catch {
      toast.error(t('imageGenerate.errors.copyFailed'));
    }
  }, [errorText]);


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

  const subtitleText = inputSummaryText;

  const { containerRef } = useAutoResizeNode({
    engine,
    elementId: element.id,
    minHeight: 0,
  });

  return (
    <NodeFrame
      onPointerDown={(event) => {
        // 逻辑：点击节点本体保持选中。
        event.stopPropagation();
        onSelect();
      }}
      onContextMenu={(event) => {
        // 逻辑：禁用当前节点右键菜单，避免误触画布菜单。
        event.preventDefault();
        event.stopPropagation();
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
          <ImagePlus className="h-4 w-4 shrink-0 text-ol-blue" />
          <div className="text-xs font-medium text-ol-blue">{t('imageGenerate.title')}</div>
          <span className={cn("rounded-md px-2 py-0.5 text-[10px] leading-3", BOARD_GENERATE_PILL_IMAGE)}>
            {subtitleText}
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 p-3" data-board-editor>
          <textarea
            className="w-full min-h-[60px] resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            value={localPromptText}
            maxLength={500}
            placeholder={t('imageGenerate.promptPlaceholder')}
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
              outputCount={outputCount}
              outputAspectRatioValue={outputAspectRatioValue}
              aspectRatioOpen={aspectRatioOpen}
              styleTags={styleTags}
              negativePromptText={negativePromptText}
              onSelect={onSelect}
              onOutputCountChange={(count) => {
                onUpdate({ outputCount: normalizeOutputCount(count) });
              }}
              onAspectRatioOpenChange={setAspectRatioOpen}
              onAspectRatioChange={(value) => {
                onUpdate({ outputAspectRatio: value });
              }}
              onStyleChange={(value) => {
                onUpdate({ style: value.join(",") });
              }}
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
                ? "bg-ol-blue-bg-hover text-ol-blue"
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
              BOARD_GENERATE_BTN_IMAGE,
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
          <div
            className={cn(
              "rounded-xl px-3 py-2 text-[12px] leading-5",
              statusHint.tone === "error"
                ? "bg-ol-red-bg/80 text-ol-red"
                : statusHint.tone === "warn"
                  ? "bg-ol-amber-bg/80 text-ol-amber"
                  : "bg-ol-blue-bg/80 text-ol-blue",
            )}
          >
            <div className="relative">
              {statusHint.tone === "error" ? (
                <>
                  <button
                    type="button"
                    className={cn(
                      "absolute right-0 top-0 inline-flex h-6 w-6 items-center justify-center rounded-md text-[12px] leading-none",
                      copied
                        ? "text-ol-green"
                        : "text-current/70 hover:text-current",
                    )}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                    }}
                    onClick={handleCopyError}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                  <div className="whitespace-pre-wrap break-words pr-8 font-sans">
                    {statusHint.text}
                  </div>
                </>
              ) : (
                <div>{statusHint.text}</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </NodeFrame>
  );
}

/** Render an image generation node, switching to chat projection mode when needed. */
export function ImageGenerateNodeView(props: CanvasNodeViewProps<ImageGenerateNodeProps>) {
  if (props.element.props.readOnlyProjection) {
    return <ImageGenerateProjectionView {...props} />;
  }

  return <EditableImageGenerateNodeView {...props} />;
}

/** Definition for the image generation node. */
export const ImageGenerateNodeDefinition: CanvasNodeDefinition<ImageGenerateNodeProps> = {
  type: IMAGE_GENERATE_NODE_TYPE,
  schema: ImageGenerateNodeSchema,
  defaultProps: {
    outputCount: IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT,
    promptText: "",
    style: "",
    negativePrompt: "",
    readOnlyProjection: false,
  },
  view: ImageGenerateNodeView,
  capabilities: {
    resizable: false,
    connectable: "auto",
    minSize: { w: 340, h: 280 },
  },
  toolbar: (ctx) => {
    if (!ctx.element.props.readOnlyProjection) return [];
    const messageMeta = getBoardChatMessageMeta(ctx.element);
    return messageMeta ? createBoardChatMessageToolbarItems(ctx, messageMeta) : [];
  },
};
