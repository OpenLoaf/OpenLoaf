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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import i18next from "i18next";
import { MessageSquare, Send, AlertCircle, RotateCcw, Pencil } from "lucide-react";
import { generateId } from "ai";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@udecode/cn";
import { trpc } from "@/utils/trpc";
import { SKILL_COMMAND_PREFIX } from "@openloaf/api/common";

import { useBoardContext } from "../../core/BoardProvider";
import { extractTextNodePlainText } from "../lib/text-node-utils";
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

// ── Skill menu helpers ──

type SkillSummary = {
  name: string;
  description: string;
  scope: "global" | "project";
  isEnabled: boolean;
};

/** Detect slash trigger at end of input. */
const SLASH_TRIGGER_REGEX = /(^|\s)(\/\S*)$/u;

function resolveSlashQuery(value: string): string | null {
  const match = SLASH_TRIGGER_REGEX.exec(value);
  if (!match) return null;
  const token = match[2] ?? "";
  if (!token.startsWith("/")) return null;
  return token.slice(1);
}

function filterEnabledSkills(skills: SkillSummary[], query: string): SkillSummary[] {
  const keyword = query.trim().toLowerCase();
  return skills
    .filter((s) => s.isEnabled)
    .filter((s) => {
      if (!keyword) return true;
      return s.name.toLowerCase().includes(keyword) || s.description.toLowerCase().includes(keyword);
    });
}

function replaceSlashToken(input: string, replacement: string): string {
  const match = SLASH_TRIGGER_REGEX.exec(input);
  if (!match) return input;
  const token = match[2] ?? "";
  const tokenStartIndex = (match.index ?? 0) + (match[1]?.length ?? 0);
  const before = input.slice(0, tokenStartIndex);
  const after = input.slice(tokenStartIndex + token.length);
  const next = `${before}${replacement}${after}`;
  return next.endsWith(" ") ? next : `${next} `;
}

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
      const plainText = extractTextNodePlainText((source.props as any)?.value);
      if (plainText.trim()) {
        annotations.push(plainText.trim());
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

  // ── Skill menu state ──
  const [isFocused, setIsFocused] = useState(false);
  const [skillMenuIndex, setSkillMenuIndex] = useState(0);
  const skillsQuery = useQuery({
    ...(projectId
      ? trpc.settings.getSkills.queryOptions({ projectId })
      : trpc.settings.getSkills.queryOptions()),
    staleTime: 5 * 60 * 1000,
  });
  const slashQuery = resolveSlashQuery(localText);
  const filteredSkills = useMemo(
    () => filterEnabledSkills((skillsQuery.data ?? []) as SkillSummary[], slashQuery ?? ""),
    [skillsQuery.data, slashQuery],
  );
  const isSkillMenuOpen = isFocused && slashQuery !== null && isEditable;

  useEffect(() => {
    setSkillMenuIndex(0);
  }, [slashQuery]);

  const selectSkill = useCallback((skillName: string) => {
    const replacement = `${SKILL_COMMAND_PREFIX}${skillName}`;
    const next = replaceSlashToken(localText, replacement);
    setLocalText(next);
    onUpdate({ inputText: next });
    setSkillMenuIndex(0);
  }, [localText, onUpdate]);

  // ── Skill menu portal positioning ──
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!isSkillMenuOpen || !textareaRef.current) {
      setMenuPos(null);
      return;
    }
    const rect = textareaRef.current.getBoundingClientRect();
    setMenuPos({
      left: rect.left,
      bottom: window.innerHeight - rect.top + 4,
      width: rect.width,
    });
  }, [isSkillMenuOpen, localText]);

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
      // Skill menu keyboard navigation
      if (isSkillMenuOpen && filteredSkills.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSkillMenuIndex((prev) => (prev + 1) % filteredSkills.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSkillMenuIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const skill = filteredSkills[skillMenuIndex];
          if (skill) selectSkill(skill.name);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setIsFocused(false);
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, isSkillMenuOpen, filteredSkills, skillMenuIndex, selectSkill],
  );

  const hasError = isError && element.props.errorText;

  return (
    <>
    <NodeFrame>
      <div
        ref={containerRef}
        className={cn(
          "flex flex-col h-full w-full rounded-md overflow-hidden transition-all",
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
              ref={textareaRef}
              className="w-full min-h-[60px] resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              placeholder={t("chatInput.placeholder")}
              value={localText}
              onChange={(e) => {
                setLocalText(e.target.value);
                onUpdate({ inputText: e.target.value });
                requestResize();
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
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
                "flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors",
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
                "flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
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
    {/* Skill menu portal — floats above the node to avoid overflow clipping */}
    {isSkillMenuOpen && menuPos && createPortal(
      <div
        className="fixed z-[9999] flex flex-col rounded-lg border border-border bg-popover shadow-lg"
        style={{ left: menuPos.left, bottom: menuPos.bottom, width: menuPos.width, maxHeight: 240 }}
        onPointerDown={(e) => e.preventDefault()}
      >
        <div className="shrink-0 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground border-b border-border">
          {t("chatInput.skills", { defaultValue: "技能" })}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto py-1">
          {filteredSkills.length === 0 ? (
            <div className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">
              {t("chatInput.noSkills", { defaultValue: "暂无可用技能" })}
            </div>
          ) : (
            filteredSkills.map((skill, index) => (
              <div
                key={skill.name}
                className={cn(
                  "flex flex-col gap-0.5 px-2.5 py-1.5 text-left cursor-default rounded-sm mx-1",
                  index === skillMenuIndex ? "bg-muted/70" : "hover:bg-muted/60",
                )}
                onPointerDown={(e) => {
                  e.preventDefault();
                  selectSkill(skill.name);
                }}
                onPointerMove={() => setSkillMenuIndex(index)}
              >
                <span className="text-[12px] font-medium text-foreground">{skill.name}</span>
                {skill.description && (
                  <span className="text-[11px] text-muted-foreground truncate">
                    {skill.description}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>,
      document.body,
    )}
    </>
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
