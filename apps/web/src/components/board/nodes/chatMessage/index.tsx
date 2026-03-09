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
import { useCallback, useEffect, useMemo } from "react";
import i18next from "i18next";
import { Bot, Square, RotateCcw, Copy, Image as ImageIcon, Eye, EyeOff, Sparkles, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@udecode/cn";
import { toast } from "sonner";

import { useBoardContext } from "../../core/BoardProvider";
import { useBoardChatStore } from "../../hooks/boardChatStore";
import { useBoardChatMessage } from "../../hooks/useBoardChatMessage";
import { NodeFrame } from "../NodeFrame";
import { useAutoResizeNode } from "../lib/use-auto-resize-node";
import { MessageResponse } from "@/components/ai-elements/message";
import { getPreviewEndpoint } from "@/lib/image/uri";
import {
  CHAT_MESSAGE_NODE_TYPE,
  ChatMessageNodeSchema,
  type ChatMessageNodeProps,
} from "./types";
import { IMAGE_GENERATE_NODE_TYPE, VIDEO_GENERATE_NODE_TYPE } from "../node-config";
import {
  BOARD_GENERATE_NODE_BASE_CHAT,
  BOARD_GENERATE_BORDER_CHAT,
  BOARD_GENERATE_SELECTED_CHAT,
  BOARD_GENERATE_ERROR,
  BOARD_GENERATE_BTN_CHAT,
  BOARD_GENERATE_PILL_CHAT,
  BOARD_GENERATE_DOT_CHAT,
} from "../../ui/board-style-system";

export { CHAT_MESSAGE_NODE_TYPE };

/** Fixed Y-offset for left/right anchors (center of header bar). */
const CHAT_ANCHOR_Y_OFFSET = 18;

/** Extract text content from message parts. */
function extractTextFromParts(parts: unknown[]): string {
  return (parts as any[])
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("\n");
}

/** Extract image URLs from tool-image-generate parts. */
function extractImageParts(parts: unknown[]): Array<{ index: number; urls: string[] }> {
  const results: Array<{ index: number; urls: string[] }> = [];
  (parts as any[]).forEach((part, index) => {
    if (!part || typeof part !== "object") return;
    const type = (part as any).type;
    if (type === "tool-image-generate" && (part as any).state === "output-available") {
      const output = (part as any).output;
      if (output?.urls && Array.isArray(output.urls)) {
        results.push({ index, urls: output.urls });
      }
    }
  });
  return results;
}

/** Render the chat message node. */
export function ChatMessageNodeView({
  element,
  selected,
  onSelect,
  onUpdate,
}: CanvasNodeViewProps<ChatMessageNodeProps>) {
  const { t } = useTranslation("board");
  const { engine, fileContext } = useBoardContext();
  const nodeId = element.id;
  const status = element.props.status ?? "streaming";
  const messageId = element.props.messageId;
  const sessionId = fileContext?.boardId ?? "";
  const hiddenIndices = new Set(element.props.hiddenPartIndices ?? []);

  const { containerRef, requestResize } = useAutoResizeNode({
    engine,
    elementId: nodeId,
    minHeight: 80,
  });

  // Local streaming data
  const streamEntry = useBoardChatStore((s) => s.streams[nodeId]);

  // Server-loaded message data (for complete status)
  const {
    data: serverMessage,
    refetch: refetchMessage,
  } = useBoardChatMessage(sessionId, status === "complete" ? messageId : undefined);

  // When status changes to complete, clear local stream and refetch
  useEffect(() => {
    if (status === "complete" && messageId) {
      refetchMessage();
      useBoardChatStore.getState().removeStream(nodeId);
    }
  }, [status, messageId, nodeId, refetchMessage]);

  useEffect(() => {
    requestResize();
  }, [streamEntry?.text, serverMessage, requestResize]);

  // Re-center vertically relative to source input node after content settles
  useEffect(() => {
    if (status !== "complete" || !serverMessage) return;
    const sourceId = element.props.sourceInputNodeId;
    if (!sourceId) return;
    // Wait for auto-resize to settle before re-centering
    const timer = window.setTimeout(() => {
      const node = engine.doc.getElementById(nodeId);
      const sourceNode = engine.doc.getElementById(sourceId);
      if (!node || !sourceNode || sourceNode.kind !== "node") return;
      const [, sy, , sh] = sourceNode.xywh;
      const [nx, ny, nw, nh] = node.xywh;
      const sourceCenter = sy + sh / 2;
      const newY = sourceCenter - nh / 2;
      if (Math.abs(ny - newY) > 2) {
        engine.doc.updateElement(nodeId, {
          xywh: [nx, newY, nw, nh],
        });
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [status, serverMessage, engine, nodeId, element.props.sourceInputNodeId]);

  // Persist resolved image URLs to Yjs props for downstream connectors
  useEffect(() => {
    if (status !== "complete" || !serverMessage) return;
    const parts = extractImageParts((serverMessage as any)?.parts ?? []);
    const urls = parts.flatMap((p) => p.urls);
    const existing = element.props.resolvedImageUrls;
    if (urls.length > 0 && (!existing || existing.length === 0)) {
      onUpdate({ resolvedImageUrls: urls });
    }
  }, [status, serverMessage, element.props.resolvedImageUrls, onUpdate]);

  const handleStop = useCallback(() => {
    const entry = useBoardChatStore.getState().getStream(nodeId);
    entry?.abortController?.abort();
  }, [nodeId]);

  const handleCopyText = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(t("chatMessage.copied")),
      () => toast.error(t("chatMessage.copyFailed")),
    );
  }, [t]);

  const handleTogglePart = useCallback((index: number) => {
    const current = element.props.hiddenPartIndices ?? [];
    const isHidden = current.includes(index);
    onUpdate({
      hiddenPartIndices: isHidden
        ? current.filter((i) => i !== index)
        : [...current, index],
    });
  }, [element.props.hiddenPartIndices, onUpdate]);

  const isStreaming = status === "streaming";
  const isComplete = status === "complete";
  const isError = status === "error";

  // Resolve display content
  const displayText = isStreaming
    ? (streamEntry?.text ?? "")
    : isComplete && serverMessage
      ? extractTextFromParts((serverMessage as any)?.parts ?? [])
      : "";

  const imageParts = isComplete && serverMessage
    ? extractImageParts((serverMessage as any)?.parts ?? [])
    : [];

  return (
    <NodeFrame>
      <div
        ref={containerRef}
        className={cn(
          "flex flex-col rounded-xl border-2 overflow-hidden transition-all",
          BOARD_GENERATE_NODE_BASE_CHAT,
          selected ? BOARD_GENERATE_SELECTED_CHAT : BOARD_GENERATE_BORDER_CHAT,
          isError && BOARD_GENERATE_ERROR,
        )}
        onClick={onSelect}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
          <Bot className="h-4 w-4 text-[#188038] dark:text-emerald-400" />
          <span className="text-xs font-medium text-[#188038] dark:text-emerald-300">
            {t("chatMessage.title")}
          </span>
          {element.props.chatModelId && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full ml-auto", BOARD_GENERATE_PILL_CHAT)}>
              {element.props.chatModelId.split("/").pop()}
            </span>
          )}
          {isStreaming && (
            <span className="ml-auto flex items-center gap-1">
              <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", BOARD_GENERATE_DOT_CHAT)} />
              <span className="text-[10px] text-muted-foreground">
                {t("chatMessage.streaming")}
              </span>
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 px-3 py-2 min-h-[40px]">
          {/* Streaming: show live text */}
          {isStreaming && (
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
              {streamEntry?.text ? (
                <MessageResponse>{streamEntry.text}</MessageResponse>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className={cn("h-2 w-2 rounded-full animate-pulse", BOARD_GENERATE_DOT_CHAT)} />
                  <span className="text-xs">{t("chatMessage.thinking")}</span>
                </div>
              )}
            </div>
          )}

          {/* Streaming for other collaborators: loading */}
          {isStreaming && !streamEntry && (
            <div className="flex items-center gap-2 text-muted-foreground py-2">
              <span className={cn("h-2 w-2 rounded-full animate-pulse", BOARD_GENERATE_DOT_CHAT)} />
              <span className="text-xs">{t("chatMessage.otherGenerating")}</span>
            </div>
          )}

          {/* Complete: show server content */}
          {isComplete && displayText && (
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
              <MessageResponse>{displayText}</MessageResponse>
            </div>
          )}

          {/* Image parts */}
          {isComplete && imageParts.length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              {imageParts.map((imgPart) =>
                hiddenIndices.has(imgPart.index) ? (
                  <div
                    key={imgPart.index}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/30 text-xs text-muted-foreground"
                  >
                    <EyeOff className="h-3 w-3" />
                    <span>{t("chatMessage.hiddenPart")}</span>
                    <button
                      type="button"
                      className="ml-auto text-[10px] hover:text-foreground transition-colors"
                      onClick={() => handleTogglePart(imgPart.index)}
                    >
                      {t("chatMessage.show")}
                    </button>
                  </div>
                ) : (
                  <div key={imgPart.index} className="relative group">
                    {imgPart.urls.map((url, urlIdx) => (
                      <img
                        key={urlIdx}
                        src={getPreviewEndpoint(url, { workspaceId: fileContext?.workspaceId })}
                        alt=""
                        className="max-w-full rounded-lg border border-border/30"
                        loading="lazy"
                      />
                    ))}
                    <button
                      type="button"
                      className="absolute top-1 right-1 p-1 rounded bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleTogglePart(imgPart.index)}
                    >
                      <Eye className="h-3 w-3" />
                    </button>
                  </div>
                ),
              )}
            </div>
          )}

          {/* Error state */}
          {isError && (
            <div className="flex flex-col gap-2 py-2">
              <p className="text-xs text-destructive">{element.props.errorText}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-t border-border/20">
          {isStreaming && (
            <button
              type="button"
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                BOARD_GENERATE_BTN_CHAT,
              )}
              onClick={handleStop}
            >
              <Square className="h-3 w-3" />
              {t("chatMessage.stop")}
            </button>
          )}
          {isComplete && displayText && (
            <button
              type="button"
              className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => handleCopyText(displayText)}
            >
              <Copy className="h-3 w-3" />
            </button>
          )}
          {isError && (
            <button
              type="button"
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                BOARD_GENERATE_BTN_CHAT,
              )}
              onClick={() => {
                // Retry: reset status on source input node
                if (element.props.sourceInputNodeId) {
                  const inputNode = engine.doc.getElementById(element.props.sourceInputNodeId);
                  if (inputNode && inputNode.kind === "node") {
                    engine.doc.updateNodeProps(element.props.sourceInputNodeId, {
                      status: "idle",
                      errorText: undefined,
                    });
                  }
                }
                // Remove this message node
                engine.doc.deleteElement(nodeId);
              }}
            >
              <RotateCcw className="h-3 w-3" />
              {t("chatMessage.retry")}
            </button>
          )}
        </div>
      </div>
    </NodeFrame>
  );
}

/** ChatMessageNode definition. */
export const ChatMessageNodeDefinition: CanvasNodeDefinition<ChatMessageNodeProps> = {
  type: CHAT_MESSAGE_NODE_TYPE,
  schema: ChatMessageNodeSchema,
  defaultProps: {
    status: "streaming",
  },
  view: ChatMessageNodeView,
  capabilities: {
    resizable: false,
    connectable: "auto",
    minSize: { w: 300, h: 80 },
  },
  anchors: (_props, bounds) => [
    { id: "left", point: [bounds.x, bounds.y + CHAT_ANCHOR_Y_OFFSET] },
    { id: "right", point: [bounds.x + bounds.w, bounds.y + CHAT_ANCHOR_Y_OFFSET] },
  ],
  connectorTemplates: (element) => {
    if (element.props.status !== "complete") return [];
    const templates: CanvasConnectorTemplateDefinition[] = [
      {
        id: "continue-chat",
        label: i18next.t("board:chatMessage.continueChatLabel"),
        description: i18next.t("board:chatMessage.continueChatDesc"),
        size: [360, 200],
        icon: null,
        createNode: () => ({
          type: "chat_input",
          props: {
            status: "idle",
            autoFocus: true,
          },
        }),
      },
    ];
    if (element.props.resolvedImageUrls?.length) {
      templates.push(
        {
          id: IMAGE_GENERATE_NODE_TYPE,
          label: i18next.t("board:connector.imageGenerate"),
          description: i18next.t("board:connector.imageGenerateDesc"),
          size: [320, 260],
          icon: <Sparkles size={14} /> as any,
          createNode: () => ({
            type: IMAGE_GENERATE_NODE_TYPE,
            props: {},
          }),
        },
        {
          id: VIDEO_GENERATE_NODE_TYPE,
          label: i18next.t("board:connector.videoGenerate"),
          description: i18next.t("board:connector.videoGenerateDesc"),
          size: [360, 280],
          icon: <Play size={14} /> as any,
          createNode: () => ({
            type: VIDEO_GENERATE_NODE_TYPE,
            props: {},
          }),
        },
      );
    }
    return templates;
  },
};
