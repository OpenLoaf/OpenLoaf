import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../engine/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Check, Copy, LogIn, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { useBoardContext } from "../core/BoardProvider";
import { useMediaModels } from "@/hooks/use-media-models";
import { getWorkspaceIdFromCookie } from "../core/boardSession";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import type { ImageNodeProps } from "./ImageNode";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tenas-ai/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@tenas-ai/ui/card";
import { Input } from "@tenas-ai/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@tenas-ai/ui/tabs";
import { Textarea } from "@tenas-ai/ui/textarea";
import TagsInputBasic from "@/components/ui/basic-tags-input";
import {
  IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT,
  IMAGE_GENERATE_MAX_INPUT_IMAGES,
  IMAGE_GENERATE_MAX_OUTPUT_IMAGES,
  filterImageMediaModels,
} from "./lib/image-generation";
import { resolveRightStackPlacement } from "../utils/output-placement";
import {
  normalizeProjectRelativePath,
} from "@/components/project/filesystem/utils/file-system-utils";
import {
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from "../core/boardFilePath";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";
import { submitImageTask } from "@/lib/saas-media";
import { DEFAULT_NODE_SIZE } from "../engine/constants";
import { LOADING_NODE_TYPE } from "./LoadingNode";
import { NodeFrame } from "./NodeFrame";

/** Node type identifier for image generation. */
export const IMAGE_GENERATE_NODE_TYPE = "image_generate";
/** Gap between generated image nodes. */
const GENERATED_IMAGE_NODE_GAP = 32;
/** Extra horizontal gap for the first generated image node. */
const GENERATED_IMAGE_NODE_FIRST_GAP = 120;
/** Available aspect ratio options. */
const IMAGE_GENERATE_ASPECT_RATIO_OPTIONS = ["1:1", "16:9", "9:16", "4:3"] as const;
const IMAGE_GENERATE_COUNT_OPTIONS = Array.from({ length: 5 }, (_, index) => index + 1);
const IMAGE_GENERATE_STYLE_SUGGESTIONS = ["写实", "动漫", "插画", "3D", "赛博朋克", "水彩"] as const;


export type ImageGenerateNodeProps = {
  /** Selected SaaS model id. */
  modelId?: string;
  /** Legacy chat model id for migration. */
  chatModelId?: string;
  /** Local prompt text entered in the node. */
  promptText?: string;
  /** Style prompt for image generation. */
  style?: string;
  /** Negative prompt text. */
  negativePrompt?: string;
  /** Output aspect ratio for generated images. */
  outputAspectRatio?: string;
  /** Requested output image count. */
  outputCount?: number;
  /** Model parameters. */
  parameters?: Record<string, string | number | boolean>;
  /** Generated image urls. */
  resultImages?: string[];
  /** Error text for failed runs. */
  errorText?: string;
};

/** Schema for image generation node props. */
const ImageGenerateNodeSchema = z.object({
  modelId: z.string().optional(),
  chatModelId: z.string().optional(),
  promptText: z.string().optional(),
  style: z.string().optional(),
  negativePrompt: z.string().optional(),
  outputAspectRatio: z.string().optional(),
  outputCount: z.number().optional(),
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  resultImages: z.array(z.string()).optional(),
  errorText: z.string().optional(),
});

/** Normalize the stored value to a plain text string. */
function normalizeTextValue(value?: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Normalize the output count within supported bounds. */
function normalizeOutputCount(value: number | undefined) {
  if (!Number.isFinite(value)) return IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT;
  const rounded = Math.round(value as number);
  // 逻辑：限制在允许范围内，避免无效请求数量。
  const maxCount = Math.min(
    IMAGE_GENERATE_MAX_OUTPUT_IMAGES,
    IMAGE_GENERATE_COUNT_OPTIONS.length
  );
  return Math.min(Math.max(rounded, 1), maxCount);
}

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
  /** Advanced panel open state. */
  /** Workspace id used for requests. */
  const resolvedWorkspaceId = useMemo(() => getWorkspaceIdFromCookie(), []);
  const isAdvancedOpen = selected;
  const [loginOpen, setLoginOpen] = useState(false);
  const { loggedIn: authLoggedIn, loginStatus, refreshSession } = useSaasAuth();
  const isLoginBusy = loginStatus === "opening" || loginStatus === "polling";
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

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
    outputAspectRatioValue === "auto" ? undefined : outputAspectRatioValue;
  const localPromptText = normalizeTextValue(element.props.promptText);
  const styleText = normalizeTextValue(element.props.style);
  const negativePromptText = normalizeTextValue(element.props.negativePrompt);
  const styleTags = useMemo(
    () => styleText.split(/[,，、\n]/).map((tag) => tag.trim()).filter(Boolean),
    [styleText]
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
        sideGap: GENERATED_IMAGE_NODE_FIRST_GAP,
        stackGap: GENERATED_IMAGE_NODE_GAP,
        outputHeights: [DEFAULT_NODE_SIZE[1]],
      }
    );
    if (placement) return { baseX: placement.baseX, startY: placement.startY };
    return { baseX: nodeX + nodeW + GENERATED_IMAGE_NODE_FIRST_GAP, startY: nodeY };
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

      const inputs =
        resolvedImages.length > 0
          ? { images: resolvedImages.map((image) => ({ url: image.url, mediaType: image.mediaType })) }
          : undefined;
      const payload = {
        modelId,
        prompt: promptText,
        negativePrompt: negativePromptText || undefined,
        style: styleText || undefined,
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
    "relative flex h-full w-full min-h-0 min-w-0 flex-col gap-3 rounded-xl border border-slate-300/80 bg-white/90 p-3 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-lg",
    "bg-[radial-gradient(180px_circle_at_top_left,rgba(126,232,255,0.45),rgba(255,255,255,0)_60%),radial-gradient(220px_circle_at_85%_15%,rgba(186,255,236,0.35),rgba(255,255,255,0)_65%)]",
    "dark:border-slate-700/90 dark:bg-slate-900/80 dark:text-slate-100 dark:shadow-[0_12px_30px_rgba(0,0,0,0.5)]",
    "dark:bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.6),rgba(15,23,42,0)_48%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.22),rgba(15,23,42,0)_42%)]",
    viewStatus === "error"
      ? "border-rose-400/80 bg-rose-50/60 dark:border-rose-400/70 dark:bg-rose-950/30"
      : "",
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
    if (!hasAnyImageInput) {
      return { tone: "info", text: "未连接图片，将以纯文本生成。" };
    }
    return null;
  }, [
    errorText,
    hasAnyImageInput,
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
            <span className="relative flex h-8 w-8 items-center justify-center overflow-visible text-slate-500 dark:text-slate-300">
              <img
                src="/board/pictures-svgrepo-com.svg"
                alt=""
                aria-hidden="true"
                className="absolute -left-6 h-[56px] w-[56px] max-h-none max-w-none"
                style={{ top: -25 }}
                draggable={false}
              />
            </span>
            <div className="min-w-0 ml-1">
            <div className="text-[16px] font-semibold leading-6">图片生成</div>
            <div className="mt-0.5 text-[13px] leading-4 text-slate-500 dark:text-slate-400">
              {subtitleText}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={authLoggedIn ? !canGenerate : isLoginBusy}
            className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200/80 bg-background px-3 text-[13px] leading-none text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-800"
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect();
              handlePrimaryAction();
            }}
          >
            <span className="inline-flex items-center gap-1">
              {PrimaryIcon ? <PrimaryIcon size={16} /> : null}
              {primaryLabel}
            </span>
          </button>
        </div>
      </div>

        <div className="mt-1 flex min-h-0 flex-1 flex-col gap-3" data-board-editor>
          <div className="flex items-center gap-3">
            <div className="text-[13px] text-slate-500 dark:text-slate-400">模型</div>
            <div className="min-w-0 flex-1">
              {authLoggedIn ? (
                <Select
                  value={effectiveModelId}
                  onValueChange={(value) => {
                    onUpdate({ modelId: value });
                  }}
                  disabled={candidates.length === 0 || engine.isLocked() || element.locked}
                >
                  <SelectTrigger className="h-9 w-full px-3 text-[13px]">
                    <SelectValue placeholder="无可用模型" />
                  </SelectTrigger>
                  <SelectContent className="text-[13px]">
                    {candidates.length ? null : (
                      <SelectItem value="__none__" disabled className="text-[13px]">
                        无可用模型
                      </SelectItem>
                    )}
                    {candidates.map((option) => (
                      <SelectItem key={option.id} value={option.id} className="text-[13px]">
                        {option.name || option.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <button
                  type="button"
                  disabled={isLoginBusy}
                  className={[
                    "flex h-9 w-full items-center justify-between rounded-md border border-slate-200/80 bg-slate-50/90 px-3 text-[13px] text-slate-500",
                    "hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60",
                    "dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800",
                  ].join(" ")}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelect();
                    handleOpenLogin();
                  }}
                >
                  <span className="truncate">登录账户后选择模型</span>
                  <LogIn size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="min-w-0 flex min-h-0 flex-1 flex-col gap-2">
            <Textarea
              value={localPromptText}
              maxLength={500}
              placeholder="输入补充提示词（最多 500 字）"
              onChange={(event) => {
                const next = event.target.value.slice(0, 500);
                onUpdate({ promptText: next });
              }}
              data-board-scroll
              className="min-h-[96px] flex-1 overflow-y-auto px-3.5 py-2.5 text-[16px] leading-6 text-slate-600 shadow-none placeholder:text-slate-400 focus-visible:ring-0 dark:text-slate-200 dark:placeholder:text-slate-500 md:text-[16px]"
              disabled={engine.isLocked() || element.locked}
            />
          </div>
        </div>

      </div>

      {statusHint ? (
        <div
          className={[
            "absolute left-0 top-full z-10 mt-2 w-full rounded-xl border text-slate-700 shadow-[0_10px_20px_rgba(15,23,42,0.12)] backdrop-blur-lg dark:text-slate-100",
            statusHint.tone === "error"
              ? "border-rose-200/70 bg-rose-100/95 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/70 dark:text-rose-200"
              : statusHint.tone === "warn"
                ? "border-amber-200/70 bg-amber-100/95 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/70 dark:text-amber-200"
                : "border-sky-200/70 bg-sky-100/95 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/70 dark:text-sky-200",
          ].join(" ")}
          data-board-editor
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          <div className="relative px-3 py-2.5">
            {statusHint.tone === "error" ? (
              <>
                <button
                  type="button"
                  className={[
                    "absolute right-3 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-[12px] leading-none",
                    copied
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-current/70 hover:text-current",
                  ].join(" ")}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={handleCopyError}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <div className="whitespace-pre-wrap break-words pr-16 font-sans text-[13px] leading-5">
                  {statusHint.text}
                </div>
              </>
            ) : (
              <div className="text-[13px] leading-5">{statusHint.text}</div>
            )}
          </div>
        </div>
      ) : null}

      {isAdvancedOpen ? (
        <Card
          className="absolute left-full top-0 z-20 ml-4 w-60 gap-3 border-slate-200/80 bg-white/95 py-0 text-slate-700 shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur-lg dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-100"
          data-board-editor
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          <CardHeader className="border-b border-slate-200/70 px-3 py-1 !pb-1 !gap-0 dark:border-slate-700/70">
            <CardTitle className="text-[13px] font-semibold text-slate-600 dark:text-slate-200">
              高级设置
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2.5 pt-2">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1 text-[12px] text-slate-500 dark:text-slate-300">
                  数量
                </div>
                <Tabs
                  value={String(outputCount)}
                  onValueChange={(value) => {
                    const parsed = Number(value);
                    onUpdate({ outputCount: normalizeOutputCount(parsed) });
                  }}
                >
                  <TabsList className="grid h-7 w-32 grid-cols-5 rounded-md bg-slate-100/80 p-0.5 dark:bg-slate-800/80">
                    {IMAGE_GENERATE_COUNT_OPTIONS.map((option) => (
                      <TabsTrigger
                        key={option}
                        value={String(option)}
                        className="h-6 text-[11px] text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 dark:text-slate-300 dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-slate-50"
                        disabled={engine.isLocked() || element.locked}
                      >
                        {option}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1 text-[12px] text-slate-500 dark:text-slate-300">
                  宽高比
                </div>
                <Select
                  value={outputAspectRatioValue}
                  onValueChange={(value) => {
                    onUpdate({
                      outputAspectRatio: value === "auto" ? undefined : value,
                    });
                  }}
                  disabled={engine.isLocked() || element.locked}
                >
                  <SelectTrigger className="h-7 w-28 px-2 text-[12px] shadow-none">
                    <SelectValue placeholder="自动" />
                  </SelectTrigger>
                  <SelectContent className="text-[12px] shadow-none">
                    <SelectItem value="auto" className="text-[12px]">
                      自动
                    </SelectItem>
                    {IMAGE_GENERATE_ASPECT_RATIO_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option} className="text-[12px]">
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5">
                <TagsInputBasic
                  dense
                  label="风格"
                  placeholder="写实 / 动漫 / 插画..."
                  suggestions={[...IMAGE_GENERATE_STYLE_SUGGESTIONS]}
                  value={styleTags}
                  onValueChange={(value) => {
                    // 逻辑：用顿号连接，保持风格字段可读性。
                    onUpdate({ style: value.join("、") });
                  }}
                  className="w-32"
                  disabled={engine.isLocked() || element.locked}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1 text-[12px] text-slate-500 dark:text-slate-300">
                  不希望出现
                </div>
                <Input
                  value={negativePromptText}
                  onChange={(event) => {
                    onUpdate({ negativePrompt: event.target.value });
                  }}
                  placeholder="不希望出现"
                  className="h-8 w-28 px-2 text-[12px]"
                  disabled={engine.isLocked() || element.locked}
                />
              </div>
            </div>
          </CardContent>
        </Card>
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
    minSize: { w: 380, h: 330 },
  },
};
