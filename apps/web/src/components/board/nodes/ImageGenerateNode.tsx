import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../engine/types";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { z } from "zod";
import { ChevronDown, ImagePlus, Play, RotateCcw, Square } from "lucide-react";
import { generateId } from "ai";

import { useBoardContext } from "../core/BoardProvider";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useSettingsValues } from "@/hooks/use-settings";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { createChatSessionId } from "@/lib/chat-session-id";
import { getWebClientId } from "@/lib/chat/streamClientId";
import { normalizeImageOptions } from "@/lib/chat/image-options";
import type { TenasUIMessage } from "@tenas-ai/api/types/message";
import { getWorkspaceIdFromCookie } from "../core/boardStorage";
import { toast } from "sonner";
import type { ImageNodeProps } from "./ImageNode";
import type { TextNodeValue } from "./TextNode";
import {
  BOARD_RELATIVE_URI_PREFIX,
  IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT,
  IMAGE_GENERATE_MAX_INPUT_IMAGES,
  IMAGE_GENERATE_MAX_OUTPUT_IMAGES,
  filterImageGenerationModelOptions,
  resolveBoardFolderScope,
  resolveBoardRelativeUri,
  runChatSseRequest,
} from "./lib/image-generation";
import { buildImageNodePayloadFromUri } from "../utils/image";
import { buildTenasFileUrl } from "@/components/project/filesystem/utils/file-system-utils";

/** Node type identifier for image generation. */
export const IMAGE_GENERATE_NODE_TYPE = "image_generate";
/** Gap between generated image nodes. */
const GENERATED_IMAGE_NODE_GAP = 32;

/** Legacy Plate node shape used by older text nodes. */
type LegacyPlateNode = {
  /** Plain text stored on the legacy node. */
  text?: string;
  /** Children nodes for nested structure. */
  children?: LegacyPlateNode[];
};

/** Legacy Plate document value stored on older text nodes. */
type LegacyPlateValue = LegacyPlateNode[];

export type ImageGenerateNodeProps = {
  /** Selected chat model id (profileId:modelId). */
  chatModelId?: string;
  /** Requested output image count. */
  outputCount?: number;
  /** Generated image urls. */
  resultImages?: string[];
  /** Error text for failed runs. */
  errorText?: string;
};

/** Schema for image generation node props. */
const ImageGenerateNodeSchema = z.object({
  chatModelId: z.string().optional(),
  outputCount: z.number().optional(),
  resultImages: z.array(z.string()).optional(),
  errorText: z.string().optional(),
});

/** Extract plain text from a legacy Plate node. */
function extractLegacyText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if ("text" in node && typeof node.text === "string") return node.text;
  if ("children" in node && Array.isArray(node.children)) {
    // 逻辑：递归拼接子节点文本，保留段落结构。
    return node.children.map(extractLegacyText).join("");
  }
  return "";
}

/** Normalize the stored value to a plain text string. */
function normalizeTextValue(value?: TextNodeValue): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const legacyValue = value as LegacyPlateValue;
    // 逻辑：兼容旧版 Plate 数据，按顶层节点换行合并。
    return legacyValue.map(extractLegacyText).join("\n");
  }
  return "";
}

/** Normalize the output count within supported bounds. */
function normalizeOutputCount(value: number | undefined) {
  if (!Number.isFinite(value)) return IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT;
  const rounded = Math.round(value as number);
  // 逻辑：限制在允许范围内，避免无效请求数量。
  return Math.min(Math.max(rounded, 1), IMAGE_GENERATE_MAX_OUTPUT_IMAGES);
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
  /** Board folder scope used for resolving relative asset uris. */
  const boardFolderScope = useMemo(
    () => resolveBoardFolderScope(fileContext),
    [fileContext?.boardFolderUri, fileContext?.projectId, fileContext?.rootUri]
  );
  const imageSaveDir = useMemo(() => {
    if (boardFolderScope) {
      // 逻辑：默认使用画布所在目录保存生成图片。
      return buildTenasFileUrl(
        boardFolderScope.projectId,
        boardFolderScope.relativeFolderPath
      );
    }
    const fallback = fileContext?.boardFolderUri ?? "";
    return fallback.startsWith("tenas-file://") ? fallback : "";
  }, [boardFolderScope, fileContext?.boardFolderUri]);
  /** Session id used for image generation requests. */
  const sessionIdRef = useRef(createChatSessionId());
  /** Abort controller for the active request. */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Runtime running flag for this node. */
  const [isRunning, setIsRunning] = useState(false);
  /** Workspace id used for SSE payload metadata. */
  const resolvedWorkspaceId = useMemo(() => getWorkspaceIdFromCookie(), []);

  const errorText = element.props.errorText ?? "";
  const outputImages = Array.isArray(element.props.resultImages)
    ? element.props.resultImages
    : [];
  const outputCount = normalizeOutputCount(element.props.outputCount);

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
    }
  }

  const promptText = inputTextSegments.join("\n").trim();
  const hasPrompt = Boolean(promptText);
  const overflowCount = Math.max(0, inputImageNodes.length - IMAGE_GENERATE_MAX_INPUT_IMAGES);
  const limitedInputImages = inputImageNodes.slice(0, IMAGE_GENERATE_MAX_INPUT_IMAGES);
  const resolvedImages: Array<{ url: string; mediaType: string }> = [];
  let invalidImageCount = 0;

  for (const imageProps of limitedInputImages) {
    const rawUri = imageProps?.originalSrc ?? "";
    const resolvedUri = rawUri
      ? resolveBoardRelativeUri(rawUri, boardFolderScope)
      : "";
    const isRelative = resolvedUri.startsWith(BOARD_RELATIVE_URI_PREFIX);
    if (!resolvedUri || isRelative || !resolvedUri.startsWith("tenas-file://")) {
      invalidImageCount += 1;
      continue;
    }
    resolvedImages.push({
      url: resolvedUri,
      mediaType: imageProps?.mimeType || "application/octet-stream",
    });
  }

  const hasValidImages = resolvedImages.length > 0;
  const hasInvalidImages = invalidImageCount > 0;
  const hasTooManyImages = overflowCount > 0;

  const candidates = useMemo(() => {
    return filterImageGenerationModelOptions(modelOptions, {
      imageCount: resolvedImages.length,
      outputCount,
    });
  }, [modelOptions, outputCount, resolvedImages.length]);

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

  /** Stop the current image generation request. */
  const stopImageGenerate = useCallback(() => {
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

  /** Run an image generation request via /chat/sse. */
  const runImageGenerate = useCallback(
    async (input: { chatModelId?: string; chatModelSource?: "local" | "cloud" }) => {
      const nodeId = element.id;
      const node = engine.doc.getElementById(nodeId);
      if (!node || node.kind !== "node" || node.type !== IMAGE_GENERATE_NODE_TYPE) {
        return;
      }

      const chatModelId = (input.chatModelId ?? (node.props as any)?.chatModelId ?? "").trim();
      if (!chatModelId) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: "请选择支持「图片生成」的模型",
        });
        return;
      }

      if (!hasPrompt) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: "请先连接一个文字节点作为提示词",
        });
        return;
      }

      if (!hasValidImages) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: "请先连接至少一张可用图片",
        });
        return;
      }

      if (hasTooManyImages) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: `最多支持 ${IMAGE_GENERATE_MAX_INPUT_IMAGES} 张图片输入`,
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

      // 逻辑：开始生成前先清空错误与结果，保证流式从头写入。
      setIsRunning(true);
      engine.doc.updateNodeProps(nodeId, {
        errorText: "",
        resultImages: [],
        chatModelId,
      });

      try {
        const sessionId = sessionIdRef.current;
        const messageId = generateId();
        const imageParts = resolvedImages.map((image) => ({
          type: "file" as const,
          url: image.url,
          mediaType: image.mediaType,
        }));
        const normalizedOptions = normalizeImageOptions({ n: outputCount });
        const metadata = normalizedOptions ? { imageOptions: normalizedOptions } : undefined;
        const userMessage: TenasUIMessage = {
          id: messageId,
          role: "user",
          parentMessageId: null,
          parts: [...imageParts, { type: "text", text: promptText }],
          ...(metadata ? { metadata } : {}),
        };
        const payload = {
          sessionId,
          messages: [userMessage],
          clientId: getWebClientId() || undefined,
          workspaceId: resolvedWorkspaceId || undefined,
          projectId: boardFolderScope?.projectId ?? fileContext?.projectId ?? undefined,
          image_save_dir: imageSaveDir || undefined,
          trigger: "board-image-generate",
          chatModelId,
          chatModelSource: input.chatModelSource,
        };

        let streamedImages: string[] = [];
        let streamedImagePayloads: Array<{
          url: string;
          mediaType?: string;
          fileName?: string;
        }> = [];
        let streamedError = "";

        await runChatSseRequest({
          payload,
          signal: controller.signal,
          onEvent: (event) => {
            const parsed = event as any;
            if (parsed?.type === "file" && typeof parsed?.url === "string") {
              const resolvedUrl = resolveBoardRelativeUri(parsed.url, boardFolderScope);
              if (!resolvedUrl) return;
              const mediaType =
                typeof parsed?.mediaType === "string" ? parsed.mediaType : undefined;
              const fileName =
                typeof parsed?.fileName === "string" ? parsed.fileName : undefined;
              streamedImages = [...streamedImages, resolvedUrl];
              streamedImagePayloads = [
                ...streamedImagePayloads,
                { url: resolvedUrl, mediaType, fileName },
              ];
              // 逻辑：节点被删除时终止写入，避免无效更新。
              if (!engine.doc.getElementById(nodeId)) {
                controller.abort();
                setIsRunning(false);
                return false;
              }
              engine.doc.updateNodeProps(nodeId, { resultImages: streamedImages });
              return;
            }
            if (parsed?.type === "text-delta" && typeof parsed?.delta === "string") {
              streamedError += parsed.delta;
              // 逻辑：错误流文本直接写入节点，便于用户查看。
              if (!engine.doc.getElementById(nodeId)) {
                controller.abort();
                setIsRunning(false);
                return false;
              }
              engine.doc.updateNodeProps(nodeId, { errorText: streamedError });
            }
          },
        });

        if (!controller.signal.aborted && streamedImagePayloads.length > 0) {
          const sourceNode = engine.doc.getElementById(nodeId);
          if (sourceNode && sourceNode.kind === "node") {
            const [nodeX, nodeY, nodeW] = sourceNode.xywh;
            const baseX = nodeX + nodeW + GENERATED_IMAGE_NODE_GAP;
            const seenUrls = new Set<string>();
            const uniqueOutputs = streamedImagePayloads.filter((output) => {
              const key = output.url.trim();
              if (!key || seenUrls.has(key)) return false;
              seenUrls.add(key);
              return true;
            });
            const existingOutputs = engine.doc.getElements().reduce((nodes, item) => {
              if (item.kind !== "connector") return nodes;
              if (!("elementId" in item.source)) return nodes;
              if (item.source.elementId !== nodeId) return nodes;
              if (!("elementId" in item.target)) return nodes;
              const target = engine.doc.getElementById(item.target.elementId);
              if (!target || target.kind !== "node" || target.type !== "image") {
                return nodes;
              }
              return [...nodes, target];
            }, [] as Array<typeof sourceNode>);
            const startY = existingOutputs.reduce((maxY, target) => {
              const bottom = target.xywh[1] + target.xywh[3];
              return Math.max(maxY, bottom + GENERATED_IMAGE_NODE_GAP);
            }, nodeY);
            const selectionSnapshot = engine.selection.getSelectedIds();
            let currentY = startY;
            for (const output of uniqueOutputs) {
              try {
                const payload = await buildImageNodePayloadFromUri(output.url);
                const [outputW, outputH] = payload.size;
                const xywh: [number, number, number, number] = [
                  baseX,
                  currentY,
                  outputW,
                  outputH,
                ];
                // 逻辑：生成图片后先解析尺寸，再创建 ImageNode 并补齐连线。
                const imageNodeId = engine.addNodeElement(
                  "image",
                  payload.props satisfies ImageNodeProps,
                  xywh
                );
                if (imageNodeId) {
                  engine.addConnectorElement({
                    source: { elementId: nodeId },
                    target: { elementId: imageNodeId },
                    style: engine.getConnectorStyle(),
                  });
                }
                currentY += outputH + GENERATED_IMAGE_NODE_GAP;
              } catch {
                // 逻辑：读取图片失败时跳过输出，避免生成错误尺寸节点。
              }
            }
            if (selectionSnapshot.length > 0) {
              // 逻辑：恢复用户原有选中，避免输出节点打断当前操作。
              engine.selection.setSelection(selectionSnapshot);
            }
          }
        }

        if (!controller.signal.aborted && streamedImages.length === 0 && !streamedError) {
          // 逻辑：未返回任何图片时给出统一错误提示。
          if (engine.doc.getElementById(nodeId)) {
            engine.doc.updateNodeProps(nodeId, { errorText: "未生成图片" });
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          engine.doc.updateNodeProps(nodeId, {
            errorText: "生成图片失败",
          });
          toast.error("生成图片失败");
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsRunning(false);
      }
    },
    [
      boardFolderScope,
      element.id,
      engine,
      fileContext?.projectId,
      hasInvalidImages,
      hasPrompt,
      hasTooManyImages,
      hasValidImages,
      outputCount,
      promptText,
      resolvedImages,
      resolvedWorkspaceId,
    ]
  );

  const viewStatus = useMemo(() => {
    // 逻辑：运行态以 SSE 请求为准，不写入节点，避免刷新后卡死。
    if (isRunning) return "running";
    if (!hasValidImages) return "needs_image";
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
    hasValidImages,
    isRunning,
    outputImages.length,
  ]);

  const containerClassName = [
    "relative flex h-full w-full flex-col gap-2 rounded-xl border border-slate-200/80 bg-background/95 p-3 text-slate-700 shadow-sm backdrop-blur",
    "dark:border-slate-700/80 dark:text-slate-200",
    selected ? "ring-1 ring-slate-300 dark:ring-slate-600" : "",
    viewStatus === "running"
      ? "tenas-thinking-border tenas-thinking-border-on border-transparent"
      : "",
    viewStatus === "error"
      ? "border-rose-400/80 bg-rose-50/60 dark:border-rose-400/70 dark:bg-rose-950/30"
      : "",
  ].join(" ");

  const canRun =
    !isRunning &&
    hasPrompt &&
    hasValidImages &&
    !hasTooManyImages &&
    !hasInvalidImages &&
    candidates.length > 0 &&
    Boolean(effectiveModelId) &&
    !engine.isLocked() &&
    !element.locked;

  /** Handle output count edits. */
  const handleOutputCountChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = normalizeOutputCount(Number(event.target.value));
      onUpdate({ outputCount: next });
    },
    [onUpdate]
  );

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
              ? "需要连接文字输入"
              : viewStatus === "needs_image"
                ? "需要连接图片输入"
                : viewStatus === "too_many_images"
                  ? "图片数量过多"
                  : viewStatus === "invalid_image"
                    ? "图片地址不可用"
                    : "待运行";

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
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            <ImagePlus size={14} />
          </span>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold leading-4">图片生成</div>
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
                stopImageGenerate();
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Square size={12} />
                停止
              </span>
            </button>
          ) : hasValidImages ? (
            <button
              type="button"
              disabled={!canRun}
              className="rounded-md border border-slate-200/80 bg-background px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-800"
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelect();
                runImageGenerate({
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
          ) : null}
        </div>
      </div>

      <div className="mt-1 flex flex-col gap-2" data-board-editor>
        <div className="flex items-center gap-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">模型</div>
          <div className="relative min-w-0 flex-1">
            <select
              value={effectiveModelId}
              disabled={candidates.length === 0 || isRunning}
              onChange={(event) => {
                const next = event.target.value;
                onUpdate({ chatModelId: next });
              }}
              className="w-full appearance-none rounded-md border border-slate-200/80 bg-background px-2 py-1 pr-6 text-[11px] text-slate-700 outline-none dark:border-slate-700/80 dark:text-slate-200"
            >
              {candidates.length ? null : <option value="">无可用模型</option>}
              {candidates.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.providerName}:{option.modelId}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-1 top-1.5 text-slate-400"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            生成数量
          </div>
          <input
            type="number"
            min={1}
            max={IMAGE_GENERATE_MAX_OUTPUT_IMAGES}
            value={outputCount}
            disabled={engine.isLocked() || element.locked}
            onChange={handleOutputCountChange}
            className="h-6 w-16 rounded-md border border-slate-200/80 bg-background px-2 text-[11px] text-slate-700 outline-none dark:border-slate-700/80 dark:text-slate-200"
          />
          <div className="text-[11px] text-slate-400 dark:text-slate-500">
            张
          </div>
        </div>
      </div>

      <div className="rounded-md border border-slate-200/70 bg-slate-50 p-2 text-[11px] leading-4 text-slate-600 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-300">
        <div className="font-medium text-slate-700 dark:text-slate-200">输入</div>
        <div className="mt-1 text-slate-500 dark:text-slate-400">
          Prompt：{hasPrompt ? "已连接" : "未连接"}
        </div>
        <div className="text-slate-500 dark:text-slate-400">
          图片：已连接 {inputImageNodes.length} 张
          {hasTooManyImages ? `（超出 ${IMAGE_GENERATE_MAX_INPUT_IMAGES} 张）` : ""}
        </div>
        {hasInvalidImages ? (
          <div className="text-rose-500 dark:text-rose-300">
            存在无法访问的图片地址
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Definition for the image generation node. */
export const ImageGenerateNodeDefinition: CanvasNodeDefinition<ImageGenerateNodeProps> = {
  type: IMAGE_GENERATE_NODE_TYPE,
  schema: ImageGenerateNodeSchema,
  defaultProps: {
    outputCount: IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT,
    resultImages: [],
  },
  view: ImageGenerateNodeView,
  capabilities: {
    resizable: true,
    connectable: "auto",
    minSize: { w: 300, h: 260 },
  },
};
