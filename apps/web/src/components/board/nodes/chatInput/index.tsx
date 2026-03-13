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
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
  CanvasToolbarItem,
} from "../../engine/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import i18next from "i18next";
import { MessageSquare, Send, AlertCircle, RotateCcw, Pencil } from "lucide-react";
import { generateId } from "ai";
import { useTranslation } from "react-i18next";
import { cn } from "@udecode/cn";

import { useBoardContext } from "../../core/BoardProvider";
import { NodeFrame } from "../NodeFrame";
import { useAutoResizeNode } from "../lib/use-auto-resize-node";
import { resolveRightStackPlacement } from "../../utils/output-placement";
import { GROUP_NODE_TYPE } from "../../engine/grouping";
import {
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from "../../core/boardFilePath";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";
import {
  normalizeProjectRelativePath,
} from "@/components/project/filesystem/utils/file-system-utils";
import { sendBoardChatMessage } from "../../hooks/sendBoardChatMessage";
import { CHAT_MESSAGE_NODE_TYPE } from "../chatMessage/types";
import {
  getBoardChatMessageMeta,
  updateBoardChatMessageMeta,
} from "../../utils/board-chat-message";
import {
  CHAT_INPUT_NODE_TYPE,
  ChatInputNodeSchema,
  type ChatInputNodeProps,
} from "./types";
import {
  BOARD_GENERATE_NODE_BASE_CHAT,
  BOARD_GENERATE_BORDER_CHAT,
  BOARD_GENERATE_SELECTED_CHAT,
  BOARD_GENERATE_ERROR,
  BOARD_GENERATE_BTN_CHAT,
  BOARD_TOOLBAR_ITEM_AMBER,
} from "../../ui/board-style-system";

export { CHAT_INPUT_NODE_TYPE };

const CHAT_INPUT_DEFAULT_WIDTH = 360;
const CHAT_INPUT_DEFAULT_HEIGHT = 200;
const CHAT_MESSAGE_DEFAULT_WIDTH = 400;
const CHAT_MESSAGE_DEFAULT_HEIGHT = 120;
const OUTPUT_SIDE_GAP = 60;
const OUTPUT_STACK_GAP = 16;

/** Fixed Y-offset for left/right anchors (center of header bar). */
const CHAT_ANCHOR_Y_OFFSET = 18;

/** Resolve the stored message id from a canvas node in the chat chain. */
function resolveCanvasMessageId(
  element: { type: string; props?: Record<string, unknown>; meta?: Record<string, unknown> },
): string | null {
  const groupMeta = getBoardChatMessageMeta({
    id: "",
    kind: "node",
    type: element.type,
    xywh: [0, 0, 0, 0],
    props: element.props ?? {},
    meta: element.meta,
  });
  if (groupMeta?.messageId) return groupMeta.messageId;

  if (element.type === CHAT_MESSAGE_NODE_TYPE || element.type === CHAT_INPUT_NODE_TYPE) {
    const messageId = element.props?.messageId;
    return typeof messageId === "string" && messageId.trim().length > 0 ? messageId : null;
  }

  return null;
}

/** Collect messageIdChain by walking upstream connectors. */
function collectMessageIdChain(
  engine: ReturnType<typeof useBoardContext>["engine"],
  currentNodeId: string,
): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();
  let nodeId: string | null = currentNodeId;

  while (nodeId && !visited.has(nodeId)) {
    visited.add(nodeId);
    // Find connector where target = nodeId
    let foundSource: string | null = null;
    for (const item of engine.doc.getElements()) {
      if (item.kind !== "connector") continue;
      if (!item.target || !("elementId" in item.target)) continue;
      if (item.target.elementId !== nodeId) continue;
      if (!item.source || !("elementId" in item.source)) continue;
      foundSource = item.source.elementId;
      break;
    }
    if (!foundSource) break;
    const sourceNode = engine.doc.getElementById(foundSource);
    if (!sourceNode || sourceNode.kind !== "node") break;

    const msgId = resolveCanvasMessageId(sourceNode as any);
    if (msgId) chain.unshift(msgId);
    nodeId = foundSource;
  }

  return chain;
}

/** Collect upstream connections (image/file/text) as @path annotations. */
function collectUpstreamAttachments(
  engine: ReturnType<typeof useBoardContext>["engine"],
  elementId: string,
): string[] {
  const annotations: string[] = [];
  for (const item of engine.doc.getElements()) {
    if (item.kind !== "connector") continue;
    if (!item.target || !("elementId" in item.target)) continue;
    if (item.target.elementId !== elementId) continue;
    if (!item.source || !("elementId" in item.source)) continue;
    const source = engine.doc.getElementById(item.source.elementId);
    if (!source || source.kind !== "node") continue;

    if (source.type === "image") {
      const src =
        (source.props as any)?.src ??
        (source.props as any)?.originalSrc;
      if (src) annotations.push(`@${src}`);
    } else if (source.type === "file_attachment" || source.type === "file-attachment") {
      const filePath =
        (source.props as any)?.filePath ??
        (source.props as any)?.sourcePath;
      if (filePath) annotations.push(`@${filePath}`);
    } else if (source.type === "text") {
      const value = (source.props as any)?.value;
      if (typeof value === "string" && value.trim()) {
        annotations.push(value.trim());
      }
    }
  }
  return annotations;
}

/** Render the chat input node. */
export function ChatInputNodeView({
  element,
  selected,
  onSelect,
  onUpdate,
}: CanvasNodeViewProps<ChatInputNodeProps>) {
  const { t } = useTranslation("board");
  const { engine, fileContext } = useBoardContext();
  const nodeId = element.id;
  const status = element.props.status ?? "idle";
  const isSent = status === "sent";
  const isSending = status === "sending";
  const isError = status === "error";
  const isEditable = status === "idle" || status === "error";

  const composingRef = useRef(false);
  const propsText = element.props.inputText ?? "";
  const [localText, setLocalText] = useState(propsText);
  useEffect(() => {
    if (!composingRef.current) setLocalText(propsText);
  }, [propsText]);

  const { containerRef, requestResize } = useAutoResizeNode({
    engine,
    elementId: nodeId,
    minHeight: 0,
  });

  const boardId = fileContext?.boardId;
  const projectId = fileContext?.projectId;

  const boardFolderScope = useMemo(
    () => resolveBoardFolderScope(fileContext),
    [fileContext],
  );

  const imageSaveDir = useMemo(() => {
    if (boardFolderScope) {
      return normalizeProjectRelativePath(
        `${boardFolderScope.relativeFolderPath}/${BOARD_ASSETS_DIR_NAME}`,
      );
    }
    if (fileContext?.boardFolderUri) {
      return `${fileContext.boardFolderUri}/${BOARD_ASSETS_DIR_NAME}`;
    }
    return "";
  }, [boardFolderScope, fileContext?.boardFolderUri]);

  const resolveOutputPlacement = useCallback(() => {
    const el = engine.doc.getElementById(nodeId);
    if (!el) return null;
    const existingOutputs: [number, number, number, number][] = [];
    for (const item of engine.doc.getElements()) {
      if (item.kind !== "connector") continue;
      if (!item.source || !("elementId" in item.source)) continue;
      if (item.source.elementId !== nodeId) continue;
      if (!item.target || !("elementId" in item.target)) continue;
      const targetEl = engine.doc.getElementById(item.target.elementId);
      if (targetEl) existingOutputs.push(targetEl.xywh);
    }
    return resolveRightStackPlacement(el.xywh, existingOutputs, {
      sideGap: OUTPUT_SIDE_GAP,
      stackGap: OUTPUT_STACK_GAP,
      outputHeights: [CHAT_MESSAGE_DEFAULT_HEIGHT],
    });
  }, [engine, nodeId]);

  const handleSend = useCallback(async () => {
    if (!boardId || !localText.trim()) return;
    if (isSending || isSent) return;

    const sessionId = boardId;
    const userMsgId = generateId();
    const assistantMsgId = generateId();

    // Collect upstream @path annotations
    const annotations = collectUpstreamAttachments(engine, nodeId);
    const fullText = [...annotations, localText.trim()].join("\n");

    // Collect messageIdChain
    const messageIdChain = collectMessageIdChain(engine, nodeId);

    // Save text to props
    onUpdate({
      inputText: localText.trim(),
      status: "sending",
      messageId: userMsgId,
      errorText: undefined,
    });

    // 逻辑：assistant 回复先创建消息 group，后续流式 part 再增量投影为组内子节点。
    const placement = resolveOutputPlacement();
    let messageGroupId: string | null = null;
    if (placement) {
      const selectionSnapshot = engine.selection.getSelectedIds();
      messageGroupId = engine.addNodeElement(
        GROUP_NODE_TYPE,
        { childIds: [] },
        [
          placement.baseX,
          placement.startY,
          CHAT_MESSAGE_DEFAULT_WIDTH,
          CHAT_MESSAGE_DEFAULT_HEIGHT,
        ],
        { skipHistory: true },
      );
      if (messageGroupId) {
        updateBoardChatMessageMeta(engine, messageGroupId, {
          messageId: assistantMsgId,
          userMessageId: userMsgId,
          sourceInputNodeId: nodeId,
          status: "streaming",
          chatModelId: element.props.chatModelId,
        });
        engine.addConnectorElement({
          source: { elementId: nodeId },
          target: { elementId: messageGroupId },
          style: engine.getConnectorStyle(),
        }, { skipHistory: true });
        engine.commitHistory();
      }
      if (selectionSnapshot.length > 0) {
        engine.selection.setSelection(selectionSnapshot);
      }
    }

    if (!messageGroupId) {
      onUpdate({ status: "error", errorText: "Failed to create message group" });
      return;
    }

    const parentMsgId = messageIdChain.length > 0
      ? messageIdChain[messageIdChain.length - 1]!
      : null;
    const userMessage = {
      id: userMsgId,
      role: "user" as const,
      parentMessageId: parentMsgId,
      parts: [{ type: "text" as const, text: fullText }],
    };

    await sendBoardChatMessage({
      sessionId,
      boardId,
      projectId,
      userMessage,
      assistantMessageId: assistantMsgId,
      messageIdChain: [...messageIdChain, userMsgId],
      chatModelId: element.props.chatModelId,
      messageGroupElementId: messageGroupId,
      engine,
      imageSaveDir: imageSaveDir || undefined,
      onStatusChange: (newStatus, errorText) => {
        updateBoardChatMessageMeta(engine, messageGroupId!, {
          status: newStatus,
          errorText: newStatus === "error" ? errorText : undefined,
        });
        if (newStatus === "complete" || newStatus === "error") {
          onUpdate({
            status: newStatus === "complete" ? "sent" : "error",
            errorText: newStatus === "error" ? errorText : undefined,
          });
        }
      },
    });
  }, [
    boardId,
    localText,
    isSending,
    isSent,
    engine,
    nodeId,
    onUpdate,
    resolveOutputPlacement,
    element.props.chatModelId,
    imageSaveDir,
    projectId,
  ]);

  const handleRetry = useCallback(() => {
    onUpdate({ status: "idle", errorText: undefined, messageId: undefined });
  }, [onUpdate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (composingRef.current) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const hasError = isError && element.props.errorText;

  return (
    <NodeFrame>
      <div
        ref={containerRef}
        className={cn(
          "flex flex-col rounded-xl border-2 overflow-hidden transition-all",
          BOARD_GENERATE_NODE_BASE_CHAT,
          selected ? BOARD_GENERATE_SELECTED_CHAT : BOARD_GENERATE_BORDER_CHAT,
          hasError && BOARD_GENERATE_ERROR,
        )}
        onClick={onSelect}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
          <MessageSquare className="h-4 w-4 text-ol-green" />
          <span className="text-xs font-medium text-ol-green">
            {t("chatInput.title")}
          </span>
        </div>

        {/* Model ID display (uses global default) */}
        {element.props.chatModelId && (
          <div className="px-3 py-1 border-b border-border/20">
            <span className="text-[10px] text-muted-foreground">
              {element.props.chatModelId.split("/").pop()}
            </span>
          </div>
        )}

        {/* Text input */}
        <div className="flex-1 p-3">
          {isEditable ? (
            <textarea
              className="w-full min-h-[60px] resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              placeholder={t("chatInput.placeholder")}
              value={localText}
              onChange={(e) => {
                setLocalText(e.target.value);
                onUpdate({ inputText: e.target.value });
                requestResize();
              }}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={() => { composingRef.current = false; }}
              autoFocus={element.props.autoFocus}
              disabled={isSending}
            />
          ) : (
            <div className="text-sm text-foreground/80 whitespace-pre-wrap">
              {localText || element.props.inputText}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-border/20">
          {hasError && (
            <div className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              <span className="truncate max-w-[200px]">{element.props.errorText}</span>
            </div>
          )}
          <div className="flex-1" />
          {isError && (
            <button
              type="button"
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                BOARD_GENERATE_BTN_CHAT,
              )}
              onClick={handleRetry}
            >
              <RotateCcw className="h-3 w-3" />
              {t("chatInput.retry")}
            </button>
          )}
          {isEditable && !isError && (
            <button
              type="button"
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                BOARD_GENERATE_BTN_CHAT,
                !localText.trim() && "opacity-50 cursor-not-allowed",
              )}
              onClick={handleSend}
              disabled={!localText.trim() || isSending}
            >
              <Send className="h-3 w-3" />
              {t("chatInput.send")}
            </button>
          )}
          {isSending && (
            <span className="text-xs text-muted-foreground animate-pulse">
              {t("chatInput.sending")}
            </span>
          )}
          {isSent && (
            <span className="text-xs text-muted-foreground">
              {t("chatInput.sent")}
            </span>
          )}
        </div>
      </div>
    </NodeFrame>
  );
}

/** Build toolbar items for ChatInputNode. Only shows "Edit" when sent. */
function createChatInputToolbarItems(
  ctx: CanvasToolbarContext<ChatInputNodeProps>,
): CanvasToolbarItem[] {
  if (ctx.element.props.status !== "sent") return [];
  const engine = ctx.engine;
  const nodeId = ctx.element.id;
  return [
    {
      id: "edit-copy",
      label: i18next.t("board:chatMessage.edit"),
      icon: <Pencil size={14} />,
      className: BOARD_TOOLBAR_ITEM_AMBER,
      onSelect: () => {
        const el = engine.doc.getElementById(nodeId);
        if (!el) return;
        const [x, y, w, h] = el.xywh;
        const inputText = ctx.element.props.inputText ?? "";
        const newId = engine.addNodeElement(
          CHAT_INPUT_NODE_TYPE,
          { status: "idle", inputText, autoFocus: true },
          [x, y + h + OUTPUT_STACK_GAP, w, CHAT_INPUT_DEFAULT_HEIGHT],
        );
        if (newId) {
          // Connect from the upstream of this node (not from this node itself)
          // so the new node shares the same conversation context
          for (const item of engine.doc.getElements()) {
            if (item.kind !== "connector") continue;
            if (!item.target || !("elementId" in item.target)) continue;
            if (item.target.elementId !== nodeId) continue;
            if (!item.source || !("elementId" in item.source)) continue;
            engine.addConnectorElement({
              source: item.source,
              target: { elementId: newId },
              style: engine.getConnectorStyle(),
            });
            break;
          }
        }
      },
    },
  ];
}

/** ChatInputNode definition. */
export const ChatInputNodeDefinition: CanvasNodeDefinition<ChatInputNodeProps> = {
  type: CHAT_INPUT_NODE_TYPE,
  schema: ChatInputNodeSchema,
  defaultProps: {
    inputText: "",
    status: "idle",
  },
  view: ChatInputNodeView,
  toolbar: ctx => createChatInputToolbarItems(ctx),
  capabilities: {
    resizable: false,
    connectable: "auto",
    minSize: { w: 280, h: 160 },
  },
  anchors: (_props, bounds) => [
    { id: "left", point: [bounds.x, bounds.y + bounds.h / 2] },
    { id: "right", point: [bounds.x + bounds.w, bounds.y + bounds.h / 2] },
  ],
  connectorTemplates: () => [],
};
