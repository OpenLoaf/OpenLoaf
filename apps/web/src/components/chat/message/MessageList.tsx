"use client";

import { cn } from "@/lib/utils";
import { useChatState } from "../context";
import MessageHelper from "./MessageHelper";
import * as React from "react";
import MessageItem from "./MessageItem";
import MessageThinking from "./MessageThinking";
import MessageError from "./tools/MessageError";
import PendingCloudLoginPrompt from "./PendingCloudLoginPrompt";
import { AnimatePresence } from "motion/react";
import { messageHasVisibleContent } from "@/lib/chat/message-visible";
import { incrementChatPerf } from "@/lib/chat/chat-perf";
import { useStreamingMessageBuffer } from "../hooks/use-streaming-message-buffer";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@tenas-ai/ui/context-menu";
import { Copy } from "lucide-react";

interface MessageListProps {
  className?: string;
}

/** Keep a small visible area for the previous message when anchoring. */
const MESSAGE_ANCHOR_PEEK_PX = 40;

/** Resolve scroll behavior based on global animation level setting. */
function resolveAnchorScrollBehavior(): ScrollBehavior {
  const level = document.documentElement.dataset.uiAnimationLevel;
  return level === "high" ? "smooth" : "auto";
}

/** Chat message list for the active session. */
export default function MessageList({ className }: MessageListProps) {
  // 中文注释：统计渲染频率，用于定位流式渲染压力。
  incrementChatPerf("render.messageList");
  const { messages, status, error, isHistoryLoading, stepThinking, pendingCloudMessage } = useChatState();
  const { staticMessages, streamingMessage } = useStreamingMessageBuffer({
    messages,
    status,
    isHistoryLoading,
  });
  const listContainerRef = React.useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const prevUserMessageIdsRef = React.useRef<string[]>([]);
  const hasInitializedUserSnapshotRef = React.useRef(false);
  const [selectionText, setSelectionText] = React.useState("");
  const selectionTextRef = React.useRef(selectionText);

  React.useEffect(() => {
    selectionTextRef.current = selectionText;
  }, [selectionText]);

  const displayMessages = React.useMemo(
    () => (streamingMessage ? [...staticMessages, streamingMessage] : staticMessages),
    [staticMessages, streamingMessage]
  );
  const lastHumanIndex = React.useMemo(
    () => (displayMessages as any[]).findLastIndex((m) => m?.role === "user"),
    [displayMessages]
  );
  const lastAiIndex = React.useMemo(
    () => (displayMessages as any[]).findLastIndex((m) => m?.role !== "user"),
    [displayMessages]
  );
  const lastVisibleAiIndex = React.useMemo(
    () =>
      (displayMessages as any[]).findLastIndex(
        (m) => m?.role !== "user" && messageHasVisibleContent(m)
      ),
    [displayMessages]
  );
  // 中文注释：动作栏的“最后一条 assistant”以可见内容为准，避免空占位导致闪烁。
  const lastAiActionIndex = lastVisibleAiIndex >= 0 ? lastVisibleAiIndex : lastAiIndex;
  const hideAiActions = status === "submitted" || status === "streaming";
  const lastMessageIsAssistant = displayMessages[displayMessages.length - 1]?.role !== "user";
  // 空态时展示提示卡片。
  const shouldShowHelper = !isHistoryLoading && messages.length === 0 && !pendingCloudMessage;

  // 发送消息后，在 AI 还没返回任何可见内容前显示“正在思考中”
  const shouldShowThinking = React.useMemo(() => {
    if (error) return false;
    if (stepThinking) return true;
    if (!(status === "submitted" || status === "streaming")) return false;
    const last = messages[messages.length - 1] as any;
    if (!last) return false;
    if (last.role === "user") return true;
    // assistant 已创建但还没产出内容（例如刚进入 streaming）
    return last.role === "assistant" && !messageHasVisibleContent(last);
  }, [messages, status, error, stepThinking]);

  React.useEffect(() => {
    const userMessageIds = (displayMessages as any[])
      .filter((message) => message?.role === "user")
      .map((message) => String(message?.id ?? ""))
      .filter(Boolean);
    if (!hasInitializedUserSnapshotRef.current) {
      prevUserMessageIdsRef.current = userMessageIds;
      hasInitializedUserSnapshotRef.current = true;
      return;
    }
    const latestUserMessageId = userMessageIds[userMessageIds.length - 1] ?? "";
    const previousUserIds = prevUserMessageIdsRef.current;
    prevUserMessageIdsRef.current = userMessageIds;
    if (!latestUserMessageId) return;
    const hasNewUserMessage = !previousUserIds.includes(latestUserMessageId);
    if (!hasNewUserMessage) return;
    if (isHistoryLoading) return;
    if (!(status === "submitted" || status === "streaming")) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const messageNodes = container.querySelectorAll<HTMLElement>("[data-message-id]");
    const targetNode = Array.from(messageNodes).find(
      (node) => node.dataset.messageId === latestUserMessageId
    );
    if (!targetNode) return;
    const frameId = window.requestAnimationFrame(() => {
      // 中文注释：仅在新增 user 消息时做一次锚定，避免流式阶段持续自动滚动导致卡顿。
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetNode.getBoundingClientRect();
      const targetTop = targetRect.top - containerRect.top + container.scrollTop;
      const nextTop = Math.max(0, targetTop - MESSAGE_ANCHOR_PEEK_PX);
      container.scrollTo({ top: nextTop, behavior: resolveAnchorScrollBehavior() });
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [displayMessages, isHistoryLoading, status]);

  if (shouldShowHelper) {
    return (
      <div
        className={cn(
          "flex-1 relative min-w-0 flex flex-col min-h-0 overflow-x-hidden overflow-y-auto",
          className
        )}
      >
        <MessageHelper />
      </div>
    );
  }

  const staticNodes = React.useMemo(
    () =>
      (staticMessages as any[]).map((message, index) => (
        <MessageItem
          key={message?.id ?? `m_${index}`}
          message={message}
          isLastHumanMessage={index === lastHumanIndex}
          isLastAiMessage={index === lastAiIndex}
          isLastAiActionMessage={index === lastAiActionIndex}
          // 中文注释：流式/提交中仅隐藏“当前最后一条 assistant”的操作，不影响历史消息。
          hideAiActions={hideAiActions && lastMessageIsAssistant && index === lastAiIndex}
        />
      )),
    [
      staticMessages,
      lastHumanIndex,
      lastAiIndex,
      lastAiActionIndex,
      hideAiActions,
      lastMessageIsAssistant,
    ]
  );

  const streamingNode = streamingMessage ? (
    <MessageItem
      key={streamingMessage?.id ?? "m_streaming"}
      message={streamingMessage as any}
      isLastHumanMessage={staticMessages.length === lastHumanIndex}
      isLastAiMessage={staticMessages.length === lastAiIndex}
      isLastAiActionMessage={staticMessages.length === lastAiActionIndex}
      // 中文注释：流式态的最后一条 assistant 需要隐藏动作。
      hideAiActions={hideAiActions && lastMessageIsAssistant}
    />
  ) : null;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={listContainerRef}
          data-allow-context-menu
          className={cn(
            "flex-1 relative min-w-0 flex flex-col min-h-0 overflow-hidden",
            className
          )}
          onContextMenuCapture={(event) => {
            const selection = window.getSelection();
            const text = selection?.toString().trim() ?? "";
            const container = listContainerRef.current;
            const anchorNode = selection?.anchorNode;
            const focusNode = selection?.focusNode;
            const isInside =
              Boolean(container && anchorNode && container.contains(anchorNode)) ||
              Boolean(container && focusNode && container.contains(focusNode));

            if (!text || !isInside) {
              setSelectionText("");
              event.preventDefault();
              return;
            }

            setSelectionText(text);
          }}
        >
          <div
            ref={scrollContainerRef}
            className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden !select-text [&_*:not(summary)]:!select-text"
          >
            <div className="min-h-full w-full min-w-0 space-y-4 pb-4 flex flex-col">
              {staticNodes}
              {streamingNode}

              <AnimatePresence initial={false}>
                {shouldShowThinking ? <MessageThinking /> : null}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {pendingCloudMessage ? <PendingCloudLoginPrompt /> : null}
              </AnimatePresence>

              {error && <MessageError error={error} />}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <ContextMenuItem
          icon={Copy}
          onClick={async () => {
            const text = selectionTextRef.current;
            if (!text) return;
            try {
              await navigator.clipboard.writeText(text);
            } catch {
              // 中文注释：剪贴板不可用时，降级使用隐藏输入框拷贝。
              const textarea = document.createElement("textarea");
              textarea.value = text;
              textarea.setAttribute("readonly", "");
              textarea.style.position = "fixed";
              textarea.style.opacity = "0";
              document.body.appendChild(textarea);
              textarea.select();
              document.execCommand("copy");
              document.body.removeChild(textarea);
            }
          }}
        >
          复制
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
