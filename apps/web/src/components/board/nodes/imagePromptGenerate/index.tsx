/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type {
  CanvasConnectorTemplateDefinition,
  CanvasNodeDefinition,
  CanvasNodeViewProps,
} from "../../engine/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Play, RotateCcw, Square } from "lucide-react";
import { generateId } from "ai";

import { useBoardContext } from "../../core/BoardProvider";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { useInstalledCliProviderIds } from "@/hooks/use-cli-tools-installed";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useSettingsValues } from "@/hooks/use-settings";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { createChatSessionId } from "@/lib/chat-session-id";
import { getWebClientId } from "@/lib/chat/streamClientId";
import { getClientTimeZone } from "@/utils/time-zone";
import type { OpenLoafUIMessage } from "@openloaf/api/types/message";
import type { ImageNodeProps } from "../ImageNode";
import { getWorkspaceIdFromCookie } from "../../core/boardSession";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select";
import { IMAGE_GENERATE_NODE_TYPE } from "../imageGenerate/constants";
import {
  filterModelOptionsByTags,
  runChatSseRequest,
} from "../lib/image-generation";
import { resolveBoardFolderScope, resolveProjectPathFromBoardUri } from "../../core/boardFilePath";
import { NodeFrame } from "../NodeFrame";
import {
  EXCLUDED_TAGS,
  IMAGE_PROMPT_GENERATE_MIN_HEIGHT,
  IMAGE_PROMPT_GENERATE_NODE_TYPE,
  IMAGE_PROMPT_TEXT,
  REQUIRED_TAGS,
} from "./constants";
import { ImagePromptGenerateNodeSchema, type ImagePromptGenerateNodeProps } from "./types";
import { measureContainerHeight } from "./utils";

export { IMAGE_PROMPT_GENERATE_NODE_TYPE };
export type { ImagePromptGenerateNodeProps };

/** Connector templates offered by the image prompt node. */
const IMAGE_PROMPT_GENERATE_CONNECTOR_TEMPLATES: CanvasConnectorTemplateDefinition[] = [
  {
    id: IMAGE_GENERATE_NODE_TYPE,
    label: "图片生成",
    description: "基于提示词与图片生成新图",
    size: [320, 260],
    icon: (
      <img
        src="/board/converted_small.svg"
        alt=""
        aria-hidden="true"
        className="h-4 w-4"
        draggable={false}
      />
    ),
    createNode: () => ({
      type: IMAGE_GENERATE_NODE_TYPE,
      props: {},
    }),
  },
];

/** Render the image prompt generation node. */
export function ImagePromptGenerateNodeView({
  element,
  onSelect,
  onUpdate,
}: CanvasNodeViewProps<ImagePromptGenerateNodeProps>) {
  const { engine, fileContext } = useBoardContext();
  const { basic } = useBasicConfig();
  const { providerItems } = useSettingsValues();
  const { models: cloudModels } = useCloudModels();
  const installedCliProviderIds = useInstalledCliProviderIds();
  const chatSource = normalizeChatModelSource(basic.chatSource);
  const modelOptions = useMemo(
    () => buildChatModelOptions(chatSource, providerItems, cloudModels, installedCliProviderIds),
    [chatSource, providerItems, cloudModels, installedCliProviderIds]
  );
  const candidates = useMemo(() => {
    return filterModelOptionsByTags(modelOptions, {
      required: REQUIRED_TAGS,
      excluded: EXCLUDED_TAGS,
    });
  }, [modelOptions]);

  /** Board folder scope used for resolving relative asset uris. */
  const boardFolderScope = useMemo(
    () => resolveBoardFolderScope(fileContext),
    [fileContext?.boardFolderUri, fileContext?.projectId, fileContext?.rootUri]
  );
  /** Session id used for image prompt runs inside this node. */
  const sessionIdRef = useRef(createChatSessionId());
  /** Abort controller for the active request. */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Throttle timestamp for focus-driven viewport moves. */
  const focusThrottleRef = useRef(0);
  /** Container ref for auto height measurements. */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Pending auto height resize animation frame id. */
  const resizeRafRef = useRef<number | null>(null);
  /** Runtime running flag for this node. */
  const [isRunning, setIsRunning] = useState(false);
  /** Workspace id used for SSE payload metadata. */
  const resolvedWorkspaceId = useMemo(() => getWorkspaceIdFromCookie(), []);
  const errorText = element.props.errorText ?? "";
  const resultText = element.props.resultText ?? "";
  // 逻辑：输入以“连线关系”为准，避免节点 props 与画布连接状态不一致。
  let inputImageId = "";
  let inputImageOriginalSrc = "";
  for (const item of engine.doc.getElements()) {
    if (item.kind !== "connector") continue;
    if (!item.target || !("elementId" in item.target)) continue;
    if (item.target.elementId !== element.id) continue;
    if (!item.source || !("elementId" in item.source)) continue;
    const sourceElementId = item.source.elementId;
    const source = sourceElementId ? engine.doc.getElementById(sourceElementId) : null;
    if (source && source.kind === "node" && source.type === "image") {
      inputImageId = source.id;
      inputImageOriginalSrc =
        typeof (source.props as any)?.originalSrc === "string"
          ? ((source.props as any).originalSrc as string)
          : "";
      break;
    }
  }
  const resolvedInputPath = resolveProjectPathFromBoardUri({
    uri: inputImageOriginalSrc.trim(),
    boardFolderScope,
    currentProjectId: boardFolderScope?.projectId ?? fileContext?.projectId,
    rootUri: fileContext?.rootUri,
  });
  const hasValidInput = Boolean(inputImageId && resolvedInputPath);
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

  /** Stop the current image prompt request. */
  const stopImagePromptGenerate = useCallback(() => {
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

  /** Run an image prompt generation request via /ai/chat. */
  const runImagePromptGenerate = useCallback(
    async (input: { chatModelId?: string; chatModelSource?: "local" | "cloud" }) => {
      const nodeId = element.id;
      const node = engine.doc.getElementById(nodeId);
      if (!node || node.kind !== "node" || node.type !== IMAGE_PROMPT_GENERATE_NODE_TYPE) {
        return;
      }

      const chatModelId = (input.chatModelId ?? (node.props as any)?.chatModelId ?? "").trim();
      if (!chatModelId) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: "请选择支持「图片输入 + 文本生成」的模型",
        });
        return;
      }

      // 逻辑：输入以“连线关系”为准，避免节点 props 与画布连接状态不一致。
      let imageProps: ImageNodeProps | null = null;
      for (const item of engine.doc.getElements()) {
        if (item.kind !== "connector") continue;
        if (!item.target || !("elementId" in item.target)) continue;
        if (item.target.elementId !== nodeId) continue;
        if (!item.source || !("elementId" in item.source)) continue;
        const sourceElementId = item.source.elementId;
        const source = sourceElementId ? engine.doc.getElementById(sourceElementId) : null;
        if (source && source.kind === "node" && source.type === "image") {
          imageProps = source.props as ImageNodeProps;
          break;
        }
      }
      const rawImageUrl = imageProps?.originalSrc ?? "";
      const imageUrl = resolveProjectPathFromBoardUri({
        uri: rawImageUrl,
        boardFolderScope,
        currentProjectId: boardFolderScope?.projectId ?? fileContext?.projectId,
        rootUri: fileContext?.rootUri,
      });
      const mediaType = imageProps?.mimeType || "application/octet-stream";
      if (!imageUrl) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: "当前图片缺少可用的地址，无法生成提示词",
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
        resultText: "",
        chatModelId,
      });

      try {
        const sessionId = sessionIdRef.current;
        const messageId = generateId();
        const userMessage: OpenLoafUIMessage = {
          id: messageId,
          role: "user",
          parentMessageId: null,
          parts: [
            { type: "file", url: imageUrl, mediaType },
            { type: "text", text: IMAGE_PROMPT_TEXT },
          ],
        };
        const payload = {
          sessionId,
          messages: [userMessage],
          clientId: getWebClientId() || undefined,
          timezone: getClientTimeZone(),
          workspaceId: resolvedWorkspaceId || undefined,
          projectId: boardFolderScope?.projectId ?? fileContext?.projectId ?? undefined,
          boardId: fileContext?.boardId ?? undefined,
          trigger: "board-image-prompt",
          chatModelId,
          chatModelSource: input.chatModelSource,
          intent: "image",
          responseMode: "stream",
        };
        let streamedText = "";
        await runChatSseRequest({
          payload,
          signal: controller.signal,
          onEvent: (event) => {
            const parsed = event as any;
            const delta =
              parsed?.type === "text-delta" && typeof parsed?.delta === "string"
                ? parsed.delta
                : parsed?.type === "text" && typeof parsed?.text === "string"
                  ? parsed.text
                  : typeof parsed?.data?.text === "string"
                    ? parsed.data.text
                    : "";
            if (!delta) return;
            streamedText += delta;
            // 逻辑：节点被删除时终止写入，避免无效更新。
            if (!engine.doc.getElementById(nodeId)) {
              controller.abort();
              setIsRunning(false);
              return false;
            }
            engine.doc.updateNodeProps(nodeId, { resultText: streamedText });
          },
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          engine.doc.updateNodeProps(nodeId, {
            errorText: "生成提示词失败",
          });
          toast.error("生成提示词失败");
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
      fileContext?.rootUri,
      resolvedWorkspaceId,
    ]
  );

  const viewStatus = useMemo(() => {
    // 逻辑：运行态以 SSE 请求为准，不写入节点，避免刷新后卡死。
    if (isRunning) return "running";
    if (!hasValidInput) return "needs_input";
    if (candidates.length === 0) return "needs_model";
    if (errorText) return "error";
    if (resultText) return "done";
    return "idle";
  }, [candidates.length, errorText, hasValidInput, isRunning, resultText]);

  /** Resize the node height to fit content. */
  const scheduleAutoHeight = useCallback(() => {
    if (resizeRafRef.current !== null) return;
    resizeRafRef.current = window.requestAnimationFrame(() => {
      resizeRafRef.current = null;
      const container = containerRef.current;
      if (!container) return;
      if (engine.isLocked() || element.locked) return;
      const snapshot = engine.getSnapshot();
      if (snapshot.draggingId === element.id || snapshot.toolbarDragging) return;
      const measuredHeight = Math.ceil(measureContainerHeight(container));
      const [x, y, w, h] = element.xywh;
      if (Math.abs(measuredHeight - h) <= 1) return;
      // 逻辑：按内容高度更新节点，空内容时也能收缩。
      engine.doc.updateElement(element.id, { xywh: [x, y, w, measuredHeight] });
    });
  }, [element.id, element.locked, element.xywh, engine]);

  useEffect(() => {
    scheduleAutoHeight();
  }, [resultText, scheduleAutoHeight, viewStatus]);

  useEffect(() => {
    return () => {
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, []);

  const containerClassName = [
    "relative flex h-full w-full min-h-0 min-w-0 flex-col gap-2 rounded-xl border border-slate-300/80 bg-white/90 p-3 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-lg",
    "bg-[radial-gradient(180px_circle_at_top_right,rgba(126,232,255,0.45),rgba(255,255,255,0)_60%),radial-gradient(220px_circle_at_15%_85%,rgba(186,255,236,0.35),rgba(255,255,255,0)_65%)]",
    "dark:border-slate-700/90 dark:bg-slate-900/80 dark:text-slate-100 dark:shadow-[0_12px_30px_rgba(0,0,0,0.5)]",
    "dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.6),rgba(15,23,42,0)_48%),radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),rgba(15,23,42,0)_42%)]",
    viewStatus === "running"
      ? "openloaf-thinking-border openloaf-thinking-border-on border-transparent"
      : "",
    viewStatus === "error"
      ? "border-rose-400/80 bg-rose-50/60 dark:border-rose-400/70 dark:bg-rose-950/30"
      : "",
  ].join(" ");

  const handleCopyResult = useCallback(async () => {
    if (!resultText) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(resultText);
      } else {
        // 逻辑：兼容不支持 Clipboard API 的环境。
        const textarea = document.createElement("textarea");
        textarea.value = resultText;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      toast.success("已复制提示词");
    } catch {
      toast.error("复制失败");
    }
  }, [resultText]);

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
      <div className={containerClassName} ref={containerRef}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-8 w-8 items-center justify-center overflow-visible text-slate-500 dark:text-slate-300">
            <img
              src="/board/converted_small.svg"
              alt=""
              aria-hidden="true"
              className="absolute -left-10 -top-10 h-24 w-24 max-h-none max-w-none"
              draggable={false}
            />
          </span>
          <div className="min-w-0 ml-1">
            <div className="text-[12px] font-semibold leading-4">图生文</div>
            <div className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              描述：根据图片生成文字内容
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {viewStatus === "running" ? (
            <button
              type="button"
              className="rounded-md border border-slate-200/80 bg-background px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-800"
              onPointerDown={(event) => {
                event.stopPropagation();
                stopImagePromptGenerate();
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Square size={12} />
                停止
              </span>
            </button>
          ) : hasValidInput ? (
            <button
              type="button"
              disabled={
                candidates.length === 0 ||
                !effectiveModelId ||
                engine.isLocked() ||
                element.locked
              }
              className="rounded-md border border-slate-200/80 bg-background px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-800"
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelect();
                runImagePromptGenerate({
                  chatModelId: effectiveModelId,
                  chatModelSource: chatSource,
                });
              }}
            >
              <span className="inline-flex items-center gap-1">
                {viewStatus === "error" || resultText ? (
                  <RotateCcw size={12} />
                ) : (
                  <Play size={12} />
                )}
                {viewStatus === "error" ? "重试" : resultText ? "重新生成" : "运行"}
              </span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-1 flex items-center gap-2">
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

      {resultText ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              图片内容
            </div>
            <button
              type="button"
              className="rounded-md px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={handleCopyResult}
            >
              <span className="inline-flex items-center gap-1">
                <Copy size={10} />
              </span>
            </button>
          </div>
          <div
            data-board-scroll
            className="rounded-md border border-slate-200/70 p-2 text-[12px] leading-5 text-slate-700 dark:border-slate-700/70 dark:text-slate-200"
          >
            <pre className="whitespace-pre-wrap break-words font-sans">
              {resultText}
            </pre>
          </div>
        </div>
      ) : null}
      </div>
    </NodeFrame>
  );
}

export const ImagePromptGenerateNodeDefinition: CanvasNodeDefinition<ImagePromptGenerateNodeProps> =
  {
    type: IMAGE_PROMPT_GENERATE_NODE_TYPE,
    schema: ImagePromptGenerateNodeSchema,
    defaultProps: {
      resultText: "",
    },
    view: ImagePromptGenerateNodeView,
    capabilities: {
      resizable: false,
      connectable: "anchors",
      minSize: { w: 260, h: IMAGE_PROMPT_GENERATE_MIN_HEIGHT },
    },
    connectorTemplates: () => IMAGE_PROMPT_GENERATE_CONNECTOR_TEMPLATES,
  };
