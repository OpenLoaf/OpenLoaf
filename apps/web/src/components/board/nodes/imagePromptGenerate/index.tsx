/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type {
  CanvasConnectorTemplateDefinition,
  CanvasNodeDefinition,
  CanvasNodeViewProps,
} from "../../engine/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cloud, Copy, LogIn, Monitor, Play, RotateCcw, ScanEye, Square } from "lucide-react";
import { cn } from "@udecode/cn";
import { generateId } from "ai";

import { useBoardContext } from "../../core/BoardProvider";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import { buildChatModelOptions, buildCloudModelOptions } from "@/lib/provider-models";
import { useInstalledCliProviderIds } from "@/hooks/use-cli-tools-installed";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useSettingsValues } from "@/hooks/use-settings";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { createChatSessionId } from "@/lib/chat-session-id";
import { getWebClientId } from "@/lib/chat/streamClientId";
import { getClientTimeZone } from "@/utils/time-zone";
import type { OpenLoafUIMessage } from "@openloaf/api/types/message";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select";
import { IMAGE_GENERATE_NODE_TYPE } from "../imageGenerate/constants";
import i18next from "i18next";
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
  IMAGE_REQUIRED_TAGS,
  VIDEO_PROMPT_TEXT,
  VIDEO_REQUIRED_TAGS,
} from "./constants";
import { ImagePromptGenerateNodeSchema, type ImagePromptGenerateNodeProps } from "./types";
import { measureContainerHeight } from "./utils";
import {
  BOARD_GENERATE_NODE_BASE_PROMPT,
  BOARD_GENERATE_BORDER_PROMPT,
  BOARD_GENERATE_SELECTED_PROMPT,
  BOARD_GENERATE_ERROR,
  BOARD_GENERATE_BTN_PROMPT,
  BOARD_GENERATE_DOT_PROMPT,
  BOARD_GENERATE_INSET,
} from "../../ui/board-style-system";

export { IMAGE_PROMPT_GENERATE_NODE_TYPE };
export type { ImagePromptGenerateNodeProps };

/** Connector templates offered by the image prompt node. */
function getImagePromptGenerateConnectorTemplates(): CanvasConnectorTemplateDefinition[] {
  return [
    {
      id: IMAGE_GENERATE_NODE_TYPE,
      label: i18next.t('board:connector.imageGenerate'),
      description: i18next.t('board:connector.imageGenerateDesc'),
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
}

/** Render the image prompt generation node. */
export function ImagePromptGenerateNodeView({
  element,
  selected,
  onSelect,
  onUpdate,
}: CanvasNodeViewProps<ImagePromptGenerateNodeProps>) {
  const { t } = useTranslation('board');
  const { engine, fileContext } = useBoardContext();
  const { basic } = useBasicConfig();
  const { providerItems } = useSettingsValues();
  const { models: cloudModels } = useCloudModels();
  const installedCliProviderIds = useInstalledCliProviderIds();
  const { loggedIn: authLoggedIn, loginStatus, refreshSession } = useSaasAuth();
  const isLoginBusy = loginStatus === "opening" || loginStatus === "polling";
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);
  useEffect(() => {
    if (!authLoggedIn) return;
    if (!loginOpen) return;
    setLoginOpen(false);
  }, [authLoggedIn, loginOpen]);
  // 逻辑：图生文需要同时显示本地 + 云端的图片理解模型，不受 chatSource 限制。
  const modelOptions = useMemo(() => {
    const localOptions = buildChatModelOptions("local", providerItems, cloudModels, installedCliProviderIds);
    const cloudOptions = buildCloudModelOptions(cloudModels);
    const merged = new Map<string, (typeof localOptions)[number]>();
    for (const option of [...localOptions, ...cloudOptions]) {
      if (merged.has(option.id)) continue;
      merged.set(option.id, option);
    }
    return Array.from(merged.values());
  }, [providerItems, cloudModels, installedCliProviderIds]);
  /** Board folder scope used for resolving relative asset uris. */
  const boardFolderScope = useMemo(
    () => resolveBoardFolderScope(fileContext),
    [fileContext?.boardFolderUri, fileContext?.projectId, fileContext?.rootUri]
  );
  /** Session id used for image prompt runs inside this node. */
  const sessionIdRef = useRef(createChatSessionId());
  /** Abort controller for the active request. */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Container ref for auto height measurements. */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Pending auto height resize animation frame id. */
  const resizeRafRef = useRef<number | null>(null);
  /** Runtime running flag for this node. */
  const [isRunning, setIsRunning] = useState(false);
  const errorText = element.props.errorText ?? "";
  const resultText = element.props.resultText ?? "";
  // 逻辑：输入以”连线关系”为准，同时支持 image 和 video 源节点。
  let inputSourceId = "";
  let inputSourceSrc = "";
  let inputSourceType: "image" | "video" | "" = "";
  for (const item of engine.doc.getElements()) {
    if (item.kind !== "connector") continue;
    if (!item.target || !("elementId" in item.target)) continue;
    if (item.target.elementId !== element.id) continue;
    if (!item.source || !("elementId" in item.source)) continue;
    const sourceElementId = item.source.elementId;
    const source = sourceElementId ? engine.doc.getElementById(sourceElementId) : null;
    if (!source || source.kind !== "node") continue;
    if (source.type === "image") {
      inputSourceId = source.id;
      inputSourceSrc =
        typeof (source.props as any)?.originalSrc === "string"
          ? ((source.props as any).originalSrc as string)
          : "";
      inputSourceType = "image";
      break;
    }
    if (source.type === "video") {
      inputSourceId = source.id;
      inputSourceSrc =
        typeof (source.props as any)?.sourcePath === "string"
          ? ((source.props as any).sourcePath as string)
          : "";
      inputSourceType = "video";
      break;
    }
  }
  const resolvedInputPath = resolveProjectPathFromBoardUri({
    uri: inputSourceSrc.trim(),
    boardFolderScope,
    currentProjectId: boardFolderScope?.projectId ?? fileContext?.projectId,
    rootUri: fileContext?.rootUri,
  });
  const hasValidInput = Boolean(inputSourceId && resolvedInputPath);
  const requiredTags = inputSourceType === "video" ? VIDEO_REQUIRED_TAGS : IMAGE_REQUIRED_TAGS;
  const candidates = useMemo(() => {
    return filterModelOptionsByTags(modelOptions, {
      required: requiredTags,
      excluded: EXCLUDED_TAGS,
    });
  }, [modelOptions, requiredTags]);
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

  // 逻辑：云端模型 id 集合，用于区分本地/云端来源。
  const cloudModelIds = useMemo(
    () => new Set(buildCloudModelOptions(cloudModels).map((o) => o.id)),
    [cloudModels],
  );

  // 逻辑：根据选中模型判断来源（本地/云端），传给服务端正确路由。
  const effectiveModelSource = useMemo<"local" | "cloud">(
    () => (cloudModelIds.has(effectiveModelId) ? "cloud" : "local"),
    [cloudModelIds, effectiveModelId],
  );

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
          errorText: i18next.t('board:imagePromptGenerate.errors.noModelSupport'),
        });
        return;
      }

      // 逻辑：输入以”连线关系”为准，同时支持 image 和 video 源节点。
      let sourceProps: Record<string, any> | null = null;
      let sourceType: "image" | "video" | "" = "";
      for (const item of engine.doc.getElements()) {
        if (item.kind !== "connector") continue;
        if (!item.target || !("elementId" in item.target)) continue;
        if (item.target.elementId !== nodeId) continue;
        if (!item.source || !("elementId" in item.source)) continue;
        const sourceElementId = item.source.elementId;
        const source = sourceElementId ? engine.doc.getElementById(sourceElementId) : null;
        if (!source || source.kind !== "node") continue;
        if (source.type === "image") {
          sourceProps = source.props as Record<string, any>;
          sourceType = "image";
          break;
        }
        if (source.type === "video") {
          sourceProps = source.props as Record<string, any>;
          sourceType = "video";
          break;
        }
      }
      const rawSourceUrl =
        sourceType === "video"
          ? (sourceProps?.sourcePath ?? "")
          : (sourceProps?.originalSrc ?? "");
      const resolvedUrl = resolveProjectPathFromBoardUri({
        uri: rawSourceUrl,
        boardFolderScope,
        currentProjectId: boardFolderScope?.projectId ?? fileContext?.projectId,
        rootUri: fileContext?.rootUri,
      });
      let mediaType: string;
      if (sourceType === "video") {
        const ext = rawSourceUrl.split(".").pop()?.toLowerCase() ?? "";
        const videoMimeMap: Record<string, string> = {
          mp4: "video/mp4",
          webm: "video/webm",
          mov: "video/quicktime",
          avi: "video/x-msvideo",
          mkv: "video/x-matroska",
        };
        mediaType = videoMimeMap[ext] || "video/mp4";
      } else {
        mediaType = (sourceProps as any)?.mimeType || "application/octet-stream";
      }
      const promptText = sourceType === "video" ? VIDEO_PROMPT_TEXT : IMAGE_PROMPT_TEXT;
      if (!resolvedUrl) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: i18next.t('board:imagePromptGenerate.errors.noInput'),
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
            { type: "file", url: resolvedUrl, mediaType },
            { type: "text", text: promptText },
          ],
        };
        const payload = {
          sessionId,
          messages: [userMessage],
          clientId: getWebClientId() || undefined,
          timezone: getClientTimeZone(),
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
            errorText: i18next.t('board:imagePromptGenerate.errors.generateFailed'),
          });
          toast.error(i18next.t('board:imagePromptGenerate.errors.generateFailed'));
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

  const containerClassName = cn(
    "relative flex h-full w-full min-h-0 min-w-0 flex-col rounded-md overflow-hidden text-ol-text-primary transition-all duration-150",
    BOARD_GENERATE_NODE_BASE_PROMPT,
    viewStatus === "running"
      ? "openloaf-thinking-border openloaf-thinking-border-on border-transparent"
      : viewStatus === "error"
        ? BOARD_GENERATE_ERROR
        : selected
          ? BOARD_GENERATE_SELECTED_PROMPT
          : BOARD_GENERATE_BORDER_PROMPT,
  );

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
      toast.success(t('imagePromptGenerate.errors.copySuccess'));
    } catch {
      toast.error(t('imagePromptGenerate.errors.copyFailed'));
    }
  }, [resultText, t]);

  return (
    <NodeFrame
      onPointerDown={(event) => {
        // 逻辑：点击节点本体保持选中。
        event.stopPropagation();
        onSelect();
      }}
    >
      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <div className={containerClassName} ref={containerRef}>
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2">
          <ScanEye className="h-4 w-4 shrink-0 text-ol-amber" />
          <div className="text-xs font-medium text-ol-amber">{t('imagePromptGenerate.title')}</div>
        </div>

        {/* Model selector + action button */}
        <div className="flex items-center gap-2 px-3 pb-2 border-b border-border/30">
          <div className="min-w-0 flex-1">
            {!authLoggedIn && candidates.length === 0 ? (
              <button
                type="button"
                disabled={isLoginBusy}
                className="inline-flex h-7 w-full items-center justify-center bg-muted/50 px-3 text-[11px] text-ol-text-auxiliary transition-colors duration-150 hover:bg-muted disabled:opacity-50"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (!isLoginBusy) setLoginOpen(true);
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <LogIn size={12} />
                  {isLoginBusy ? t('imagePromptGenerate.loggingIn') : t('imagePromptGenerate.loginHint')}
                </span>
              </button>
            ) : (
              <Select
                value={effectiveModelId}
                onValueChange={(value) => {
                  onUpdate({ chatModelId: value });
                }}
                disabled={candidates.length === 0 || isRunning}
              >
                <SelectTrigger className="h-7 w-full border-0 bg-muted/50 px-2 text-[11px] shadow-none hover:bg-muted">
                  <SelectValue placeholder={t('imagePromptGenerate.noModel')} />
                </SelectTrigger>
                <SelectContent className="text-[11px]">
                  {candidates.length ? null : (
                    <SelectItem value="__none__" disabled className="text-[11px]">
                      {t('imagePromptGenerate.noModel')}
                    </SelectItem>
                  )}
                  {candidates.map((option) => {
                    const isCloud = cloudModelIds.has(option.id);
                    return (
                      <SelectItem
                        key={option.id}
                        value={option.id}
                        className="text-[11px]"
                      >
                        <span className="inline-flex items-center gap-1">
                          {isCloud ? (
                            <Cloud className="h-3 w-3 shrink-0 text-ol-blue" />
                          ) : (
                            <Monitor className="h-3 w-3 shrink-0 text-ol-text-auxiliary" />
                          )}
                          {option.providerName}:{option.modelDefinition?.name || option.modelId}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
          {viewStatus === "running" ? (
            <button
              type="button"
              className={cn(
                "shrink-0 inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                BOARD_GENERATE_BTN_PROMPT,
              )}
              onPointerDown={(event) => {
                event.stopPropagation();
                stopImagePromptGenerate();
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Square size={12} />
                {t('imagePromptGenerate.stop')}
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
              className={cn(
                "shrink-0 inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 disabled:opacity-50",
                BOARD_GENERATE_BTN_PROMPT,
              )}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelect();
                runImagePromptGenerate({
                  chatModelId: effectiveModelId,
                  chatModelSource: effectiveModelSource,
                });
              }}
            >
              <span className="inline-flex items-center gap-1">
                {viewStatus === "error" || resultText ? (
                  <RotateCcw size={12} />
                ) : (
                  <Play size={12} />
                )}
                {viewStatus === "error" ? t('imagePromptGenerate.retry') : resultText ? t('imagePromptGenerate.regenerate') : t('imagePromptGenerate.run')}
              </span>
            </button>
          ) : null}
        </div>

        {/* Body — content grows downward */}
        <div className="flex-1 p-3 flex flex-col gap-2" data-board-editor>
          {resultText ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-ol-text-auxiliary">
                  {t('imagePromptGenerate.contentDescription')}
                </div>
                <button
                  type="button"
                  className="rounded-md px-1.5 py-0.5 text-[10px] text-ol-text-auxiliary hover:text-ol-text-primary"
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
                className={cn("rounded-lg p-2 text-[12px] leading-5 text-ol-text-primary", BOARD_GENERATE_INSET)}
              >
                <pre className="whitespace-pre-wrap break-words font-sans">
                  {resultText}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
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
    connectorTemplates: () => getImagePromptGenerateConnectorTemplates(),
  };
