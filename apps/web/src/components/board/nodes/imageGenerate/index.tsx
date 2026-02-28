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
import { Check, Copy, LogIn, RotateCcw, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { useBoardContext } from "../../core/BoardProvider";
import { useMediaModels } from "@/hooks/use-media-models";
import { getWorkspaceIdFromCookie } from "../../core/boardSession";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import type { ImageNodeProps } from "../ImageNode";
import { Input } from "@openloaf/ui/input";
import { Textarea } from "@openloaf/ui/textarea";
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
  BOARD_GENERATE_NODE_BASE,
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

export { IMAGE_GENERATE_NODE_TYPE };

/** Render the image generation node. */
export function ImageGenerateNodeView({
  element,
  selected,
  onSelect,
  onUpdate,
}: CanvasNodeViewProps<ImageGenerateNodeProps>) {
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
    return "";
  }, [boardFolderScope]);
  /** Abort controller for the active request. */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Throttle timestamp for focus-driven viewport moves. */
  const focusThrottleRef = useRef(0);
  /** Loading node id for the current generation. */
  const loadingNodeIdRef = useRef<string | null>(null);
  /** Workspace id used for requests. */
  const resolvedWorkspaceId = useMemo(() => getWorkspaceIdFromCookie(), []);
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
  const localPromptText = normalizeTextValue(element.props.promptText);
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

  const hasInvalidImages = invalidImageCount > 0;
  const hasTooManyImages = overflowCount > 0;

  const inputSummary = useMemo(() => {
    if (inputImageCount === 0) return "文生图";
    if (inputImageCount === 1) return "单图";
    return "多图";
  }, [inputImageCount]);
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
        errorText: "请选择支持「图片生成」的模型",
      });
      return;
    }

    if (!hasPrompt) {
      engine.doc.updateNodeProps(nodeId, {
        errorText: "请先输入或连接提示词",
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
            workspaceId: resolvedWorkspaceId || undefined,
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
        workspaceId: resolvedWorkspaceId || undefined,
        projectId: currentProjectId || undefined,
        saveDir: imageSaveDir || undefined,
        sourceNodeId: nodeId,
      };
      const result = await submitImageTask(payload);
      if (!result?.success || !result?.data?.taskId) {
        throw new Error("图片任务提交失败");
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
          errorText: error instanceof Error ? error.message : "生成图片失败",
        });
        toast.error("生成图片失败");
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
    resolvedWorkspaceId,
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

  const containerClassName = [
    "relative flex w-full min-w-0 flex-col gap-3 rounded-xl border p-3 text-[#202124] dark:text-slate-100 transition-colors duration-150",
    BOARD_GENERATE_NODE_BASE,
    viewStatus === "error"
      ? BOARD_GENERATE_ERROR
      : selected
        ? BOARD_GENERATE_SELECTED_IMAGE
        : BOARD_GENERATE_BORDER_IMAGE,
  ].join(" ");

  const statusHint = useMemo(() => {
    if (viewStatus === "needs_prompt") {
      return { tone: "warn", text: "需要输入或连接提示词后才能生成图片。" };
    }
    if (viewStatus === "too_many_images") {
      return {
        tone: "warn",
        text: `最多支持 ${maxInputImages} 张图片输入，已连接 ${inputImageNodes.length} 张。`,
      };
    }
    if (viewStatus === "invalid_image") {
      return { tone: "warn", text: "存在无法访问的图片地址，请检查输入。" };
    }
    if (viewStatus === "needs_model") {
      return {
        tone: "warn",
        text: "未找到支持「图片生成」的模型，请先在设置中配置。",
      };
    }
    if (viewStatus === "error") {
      return { tone: "error", text: errorText || "生成图片失败，请重试。" };
    }
    if (viewStatus === "done") return null;
    return null;
  }, [
    errorText,
    inputImageNodes.length,
    maxInputImages,
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
      ? "重试"
      : "生成"
    : isLoginBusy
      ? "登录中"
      : "登录";
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
    const copyText = errorText.trim() || "生成图片失败，请重试。";
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
      toast.error("复制失败");
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
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${BOARD_GENERATE_DOT_IMAGE}`} />
          <div className="text-[13px] font-semibold leading-5">图片生成</div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] leading-3 ${BOARD_GENERATE_PILL_IMAGE}`}>
            {subtitleText}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-150 ${
              isAdvancedOpen
                ? "bg-[#d3e3fd] text-[#1a73e8] dark:bg-sky-800/60 dark:text-sky-50"
                : "text-[#5f6368] hover:bg-[#f1f3f4] dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
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
            className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[12px] leading-none transition-colors duration-150 disabled:opacity-50 ${BOARD_GENERATE_BTN_IMAGE}`}
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

        <div className="mt-1 flex shrink-0 flex-col gap-3" data-board-editor>
          <div className="flex items-center gap-3">
            <div className="text-[12px] text-[#5f6368] dark:text-slate-400">模型</div>
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
          <div className="min-w-0 flex shrink-0 flex-col gap-2">
            <div className="text-[12px] text-[#5f6368] dark:text-slate-400">
              提示词
            </div>
            <Textarea
              value={localPromptText}
              maxLength={500}
              placeholder="请输入提示词"
              onChange={(event) => {
                const next = event.target.value.slice(0, 500);
                onUpdate({ promptText: next });
              }}
              data-board-scroll
              className="min-h-[96px] flex-1 overflow-y-auto border-transparent bg-[#edf2fa] px-3.5 py-2.5 text-[14px] leading-6 text-[#202124] shadow-none placeholder:text-[#5f6368] focus-visible:border-[#d2e3fc] focus-visible:ring-1 focus-visible:ring-[rgba(26,115,232,0.22)] dark:bg-[hsl(var(--muted)/0.38)] dark:text-slate-100 dark:placeholder:text-slate-400 md:text-[14px]"
              disabled={isLocked}
            />
          </div>
        </div>

        {isAdvancedOpen ? (
          <div
            className="pt-1"
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
            className={[
              "rounded-lg px-3 py-2 text-[12px] leading-5 shadow-sm",
              statusHint.tone === "error"
                ? "border border-[#d93025]/20 bg-[#fce8e6] text-[#d93025] dark:border-rose-400/30 dark:bg-rose-950/40 dark:text-rose-200"
                : statusHint.tone === "warn"
                  ? "border border-amber-200/70 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
                  : "border border-sky-200/70 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200",
            ].join(" ")}
          >
            <div className="relative">
              {statusHint.tone === "error" ? (
                <>
                  <button
                    type="button"
                    className={[
                      "absolute right-0 top-0 inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] leading-none",
                      copied
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-current/70 hover:text-current",
                    ].join(" ")}
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

/** Definition for the image generation node. */
export const ImageGenerateNodeDefinition: CanvasNodeDefinition<ImageGenerateNodeProps> = {
  type: IMAGE_GENERATE_NODE_TYPE,
  schema: ImageGenerateNodeSchema,
  defaultProps: {
    outputCount: IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT,
    promptText: "",
    style: "",
    negativePrompt: "",
  },
  view: ImageGenerateNodeView,
  capabilities: {
    resizable: false,
    connectable: "auto",
    minSize: { w: 340, h: 280 },
  },
};
