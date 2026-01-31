import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../engine/types";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { z } from "zod";
import { Copy, Play, RotateCcw, Square } from "lucide-react";
import { generateId } from "ai";
import type { ModelParameterDefinition } from "@tenas-ai/api/common";

import { useBoardContext } from "../core/BoardProvider";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useSettingsValues } from "@/hooks/use-settings";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { createChatSessionId } from "@/lib/chat-session-id";
import { getWebClientId } from "@/lib/chat/streamClientId";
import { normalizeImageOptions } from "@/lib/chat/image-options";
import { getClientTimeZone } from "@/utils/time-zone";
import type { TenasUIMessage } from "@tenas-ai/api/types/message";
import { getWorkspaceIdFromCookie } from "../core/boardSession";
import { toast } from "sonner";
import type { ImageNodeProps } from "./ImageNode";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tenas-ai/ui/select";
import { Input } from "@tenas-ai/ui/input";
import { Textarea } from "@tenas-ai/ui/textarea";
import {
  IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT,
  IMAGE_GENERATE_MAX_INPUT_IMAGES,
  IMAGE_GENERATE_MAX_OUTPUT_IMAGES,
  filterImageGenerationModelOptions,
  runChatSseRequest,
} from "./lib/image-generation";
import { buildImageNodePayloadFromUri } from "../utils/image";
import {
  buildChildUri,
  formatScopedProjectPath,
  getUniqueName,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import {
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
  toBoardRelativePath,
} from "../core/boardFilePath";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";
import { resolveFileName } from "@/lib/image/uri";
import { trpcClient } from "@/utils/trpc";

/** Node type identifier for image generation. */
export const IMAGE_GENERATE_NODE_TYPE = "image_generate";
/** Gap between generated image nodes. */
const GENERATED_IMAGE_NODE_GAP = 32;
/** Extra horizontal gap for the first generated image node. */
const GENERATED_IMAGE_NODE_FIRST_GAP = 64;
/** Default aspect ratio when none is specified. */
const IMAGE_GENERATE_DEFAULT_RATIO = "4:3";


export type ImageGenerateNodeProps = {
  /** Selected chat model id (profileId:modelId). */
  chatModelId?: string;
  /** Local prompt text entered in the node. */
  promptText?: string;
  /** Aspect ratio for generated images. */
  aspectRatio?: string;
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
  chatModelId: z.string().optional(),
  promptText: z.string().optional(),
  aspectRatio: z.string().optional(),
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
  return Math.min(Math.max(rounded, 1), IMAGE_GENERATE_MAX_OUTPUT_IMAGES);
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

/** Map parameter values into image generate options. */
function buildImageOptionsFromParameters(
  parameters: Record<string, string | number | boolean>,
  fallback: { outputCount: number; aspectRatio?: string; allowAspectRatio: boolean }
) {
  const options: {
    n?: number;
    size?: string;
    aspectRatio?: string;
    seed?: number;
    providerOptions?: Record<string, Record<string, string | number | boolean>>;
  } = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (isEmptyParamValue(value)) continue;
    if (key === "n") {
      const numeric = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(numeric)) options.n = numeric;
      continue;
    }
    if (key === "size") {
      options.size = typeof value === "string" ? value.trim() : String(value);
      continue;
    }
    if (key === "aspectRatio") {
      options.aspectRatio = typeof value === "string" ? value.trim() : String(value);
      continue;
    }
    if (key === "seed") {
      const numeric = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(numeric)) options.seed = numeric;
      continue;
    }
    if (key.startsWith("providerOptions.")) {
      const [, providerId, optionKey] = key.split(".");
      if (!providerId || !optionKey) continue;
      if (!options.providerOptions) options.providerOptions = {};
      if (!options.providerOptions[providerId]) options.providerOptions[providerId] = {};
      options.providerOptions[providerId][optionKey] = value;
    }
  }
  if (options.n === undefined) options.n = fallback.outputCount;
  if (
    !options.size &&
    !options.aspectRatio &&
    fallback.aspectRatio &&
    fallback.allowAspectRatio
  ) {
    options.aspectRatio = fallback.aspectRatio;
  }
  return options;
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
  /** Session id used for image generation requests. */
  const sessionIdRef = useRef(createChatSessionId());
  /** Abort controller for the active request. */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Throttle timestamp for focus-driven viewport moves. */
  const focusThrottleRef = useRef(0);
  /** Runtime running flag for this node. */
  const [isRunning, setIsRunning] = useState(false);
  /** Workspace id used for SSE payload metadata. */
  const resolvedWorkspaceId = useMemo(() => getWorkspaceIdFromCookie(), []);

  const errorText = element.props.errorText ?? "";
  const outputImages = Array.isArray(element.props.resultImages)
    ? element.props.resultImages
    : [];
  const rawParameters =
    element.props.parameters && typeof element.props.parameters === "object"
      ? element.props.parameters
      : undefined;
  const rawOutputCount = rawParameters?.n;
  const outputCount = normalizeOutputCount(
    typeof rawOutputCount === "number"
      ? rawOutputCount
      : typeof rawOutputCount === "string"
        ? Number(rawOutputCount)
        : element.props.outputCount
  );
  const localPromptText =
    typeof element.props.promptText === "string" ? element.props.promptText : "";
  const selectedAspectRatio =
    typeof rawParameters?.aspectRatio === "string"
      ? rawParameters.aspectRatio.trim()
      : typeof element.props.aspectRatio === "string"
        ? element.props.aspectRatio.trim()
        : "";

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
  const overflowCount = Math.max(0, inputImageNodes.length - IMAGE_GENERATE_MAX_INPUT_IMAGES);
  const limitedInputImages = inputImageNodes.slice(0, IMAGE_GENERATE_MAX_INPUT_IMAGES);
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

  const selectedModelOption = useMemo(
    () => candidates.find((item) => item.id === effectiveModelId),
    [candidates, effectiveModelId]
  );
  const parameterFields = useMemo(
    () => selectedModelOption?.modelDefinition?.parameters?.fields ?? [],
    [selectedModelOption]
  );
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

  const effectiveAspectRatio = useMemo(() => {
    if (selectedAspectRatio) return selectedAspectRatio;
    return IMAGE_GENERATE_DEFAULT_RATIO;
  }, [selectedAspectRatio]);

  useEffect(() => {
    // 逻辑：当默认模型可用时自动写入节点，避免用户每次重复选择。
    if (!effectiveModelId) return;
    if (selectedModelId) return;
    onUpdate({ chatModelId: effectiveModelId });
  }, [effectiveModelId, onUpdate, selectedModelId]);

  useEffect(() => {
    // 逻辑：未设置比例时写入默认值，避免发送空参数。
    if (!effectiveAspectRatio || selectedAspectRatio) return;
    if (parameterFields.length > 0) return;
    onUpdate({ aspectRatio: effectiveAspectRatio });
  }, [effectiveAspectRatio, onUpdate, parameterFields, selectedAspectRatio]);

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

  /** Run an image generation request via /ai/execute. */
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
          errorText: "请先输入或连接提示词",
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
        const normalizedOptions = normalizeImageOptions(
          buildImageOptionsFromParameters(resolvedParameters, {
            outputCount,
            aspectRatio: effectiveAspectRatio,
            allowAspectRatio:
              parameterFields.some((field) => field.key === "aspectRatio") ||
              (parameterFields.length === 0 &&
                !["custom", "openai"].includes(selectedModelOption?.providerId ?? "")),
          })
        );
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
          timezone: getClientTimeZone(),
          workspaceId: resolvedWorkspaceId || undefined,
          projectId: boardFolderScope?.projectId ?? fileContext?.projectId ?? undefined,
          boardId: fileContext?.boardId ?? undefined,
          imageSaveDir: imageSaveDir || undefined,
          trigger: "board-image-generate",
          chatModelId,
          chatModelSource: input.chatModelSource,
          intent: "image",
          responseMode: "stream",
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
              const rawUrl = parsed.url.trim();
              const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawUrl);
              const resolvedUrl = hasScheme
                ? rawUrl
                : (() => {
                    const scoped = parseScopedProjectPath(rawUrl);
                    if (!scoped) return "";
                    return formatScopedProjectPath({
                      projectId: scoped.projectId,
                      currentProjectId,
                      relativePath: scoped.relativePath,
                      includeAt: true,
                    });
                  })();
              if (!resolvedUrl) return;
              const storedUrl = toBoardRelativePath(
                resolvedUrl,
                boardFolderScope,
                fileContext?.boardFolderUri
              );
              const mediaType =
                typeof parsed?.mediaType === "string" ? parsed.mediaType : undefined;
              const fileName =
                typeof parsed?.fileName === "string" ? parsed.fileName : undefined;
              streamedImages = [...streamedImages, storedUrl];
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
              : nodeX + nodeW + GENERATED_IMAGE_NODE_FIRST_GAP;
            const startY =
              existingOutputs.length > 0
                ? existingOutputs.reduce((maxY, target) => {
                    const bottom = target.xywh[1] + target.xywh[3];
                    return Math.max(maxY, bottom);
                  }, firstOutput ? firstOutput.xywh[1] + firstOutput.xywh[3] : nodeY) +
                  GENERATED_IMAGE_NODE_GAP
                : nodeY;
            const selectionSnapshot = engine.selection.getSelectedIds();
            const assetNamePool = new Set<string>();
            if (imageSaveDir && resolvedWorkspaceId && currentProjectId) {
              try {
                const list = await trpcClient.fs.list.query({
                  workspaceId: resolvedWorkspaceId,
                  projectId: currentProjectId,
                  uri: imageSaveDir,
                  includeHidden: true,
                });
                for (const entry of list.entries ?? []) {
                  if (entry?.name) assetNamePool.add(entry.name);
                }
              } catch {
                // 逻辑：读取资产目录失败时仍允许写入，交由后端覆盖处理。
              }
            }
            const copyToBoardAssets = async (
              sourceUrl: string,
              fallbackName?: string
            ): Promise<string> => {
              if (!imageSaveDir || !resolvedWorkspaceId || !currentProjectId) {
                return sourceUrl;
              }
              const parsed = parseScopedProjectPath(sourceUrl);
              const relativeFrom = parsed?.relativePath
                ? normalizeProjectRelativePath(parsed.relativePath)
                : normalizeProjectRelativePath(sourceUrl);
              if (!relativeFrom) return sourceUrl;
              const resolvedName = (fallbackName || resolveFileName(relativeFrom)).trim();
              const safeName = resolvedName.replace(/[\\/]/g, "-") || "image.png";
              const uniqueName = getUniqueName(safeName, assetNamePool);
              assetNamePool.add(uniqueName);
              const targetRelative = normalizeProjectRelativePath(
                buildChildUri(imageSaveDir, uniqueName)
              );
              try {
                await trpcClient.fs.copy.mutate({
                  workspaceId: resolvedWorkspaceId,
                  projectId: currentProjectId,
                  from: relativeFrom,
                  to: targetRelative,
                });
                return targetRelative;
              } catch {
                // 逻辑：复制失败时回退原始路径，避免阻断创建节点。
                return sourceUrl;
              }
            };
            let currentY = startY;
            for (const output of uniqueOutputs) {
              try {
                const assetUrl = await copyToBoardAssets(output.url, output.fileName);
                const payload = await buildImageNodePayloadFromUri(assetUrl, {
                  projectId: fileContext?.projectId,
                });
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
      fileContext?.boardFolderUri,
      fileContext?.boardId,
      fileContext?.projectId,
      currentProjectId,
      effectiveAspectRatio,
      hasInvalidImages,
      hasMissingRequiredParameters,
      hasPrompt,
      hasTooManyImages,
      imageSaveDir,
      outputCount,
      parameterFields,
      promptText,
      resolvedParameters,
      resolvedImages,
      resolvedWorkspaceId,
      selectedModelOption?.providerId,
    ]
  );

  const viewStatus = useMemo(() => {
    // 逻辑：运行态以 SSE 请求为准，不写入节点，避免刷新后卡死。
    if (isRunning) return "running";
    if (!hasPrompt) return "needs_prompt";
    if (hasMissingRequiredParameters) return "missing_parameters";
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
    hasMissingRequiredParameters,
    hasPrompt,
    hasTooManyImages,
    isRunning,
    outputImages.length,
  ]);

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

  const statusHint = useMemo(() => {
    if (viewStatus === "needs_prompt") {
      return { tone: "warn", text: "需要输入或连接提示词后才能生成图片。" };
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
        text: `最多支持 ${IMAGE_GENERATE_MAX_INPUT_IMAGES} 张图片输入，已连接 ${inputImageNodes.length} 张。`,
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
    if (viewStatus === "running") {
      return { tone: "info", text: "正在生成图片，请稍等…" };
    }
    if (viewStatus === "done") return null;
    if (!hasAnyImageInput) {
      return { tone: "info", text: "未连接图片，将以纯文本生成。" };
    }
    return { tone: "info", text: "准备就绪，点击运行即可生成图片。" };
  }, [
    errorText,
    hasAnyImageInput,
    inputImageNodes.length,
    missingRequiredParameters,
    viewStatus,
  ]);

  const canRun =
    !isRunning &&
    hasPrompt &&
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
      toast.success("已复制错误信息");
    } catch {
      toast.error("复制失败");
    }
  }, [errorText]);

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
      : viewStatus === "missing_parameters"
        ? "参数未填写"
      : viewStatus === "too_many_images"
        ? "图片数量过多"
      : viewStatus === "invalid_image"
        ? "图片地址不可用"
      : "待运行";

  const isAdvancedOpen = selected;

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
          ) : (
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
                  <SelectItem
                    key={option.id}
                    value={option.id}
                    className="text-[11px]"
                  >
                    {option.providerName}:{option.modelDefinition?.name || option.modelId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                : "border-sky-200/70 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200",
            ].join(" ")}
          >
            {statusHint.text}
          </div>
        )
      ) : null}
      {isAdvancedOpen && parameterFields.length > 0 ? (
        <div
          className="absolute left-full top-0 z-20 ml-2 w-64 rounded-xl border border-slate-200/80 bg-white/95 p-3 text-slate-700 shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur-lg dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-100"
          data-board-editor
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          <div className="mb-2 text-[12px] font-semibold text-slate-600 dark:text-slate-200">
            高级选项
          </div>
          <div className="flex flex-col gap-2">
            {parameterFields.map((field) => {
              const value = resolvedParameters[field.key];
              const valueString = value === undefined ? "" : String(value);
              const disabled = engine.isLocked() || element.locked || isRunning;
              if (field.type === "select") {
                const options = Array.isArray(field.values) ? field.values : [];
                return (
                  <div className="flex items-center gap-2" key={field.key}>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {field.title}
                    </div>
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
                      <SelectTrigger className="h-7 w-24 px-2 text-[11px]">
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
                  <div className="flex items-center gap-2" key={field.key}>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {field.title}
                    </div>
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
                      className="h-7 w-16 px-2 text-[11px]"
                    />
                    {field.unit ? (
                      <div className="text-[11px] text-slate-400 dark:text-slate-500">
                        {field.unit}
                      </div>
                    ) : null}
                  </div>
                );
              }
              if (field.type === "boolean") {
                return (
                  <div className="flex items-center gap-2" key={field.key}>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {field.title}
                    </div>
                    <Select
                      value={valueString}
                      onValueChange={(nextValue) => {
                        handleParameterChange(field.key, nextValue === "true");
                      }}
                      disabled={disabled}
                    >
                      <SelectTrigger className="h-7 w-20 px-2 text-[11px]">
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
                <div className="flex items-center gap-2" key={field.key}>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {field.title}
                  </div>
                  <Input
                    type="text"
                    value={valueString}
                    disabled={disabled}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      handleParameterChange(field.key, event.target.value);
                    }}
                    className="h-7 w-40 px-2 text-[11px]"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
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
    promptText: "",
    aspectRatio: IMAGE_GENERATE_DEFAULT_RATIO,
  },
  view: ImageGenerateNodeView,
  capabilities: {
    resizable: false,
    connectable: "auto",
    minSize: { w: 300, h: 260 },
  },
};
