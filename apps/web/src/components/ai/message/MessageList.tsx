/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { cn } from "@/lib/utils";
import { useChatMessages, useChatStatus, useChatTools } from "../context";
import MessageHelper from "./MessageHelper";
import * as React from "react";
import MessageItem from "./MessageItem";
import MessageThinking from "./MessageThinking";
import MessageError from "./tools/MessageError";
import PendingCloudLoginPrompt from "./PendingCloudLoginPrompt";
import { AnimatePresence, motion } from "motion/react";
import { messageHasVisibleContent } from "@/lib/chat/message-visible";
import { getMessagePlainText } from "@/lib/chat/message-text";
import { incrementChatPerf } from "@/lib/chat/chat-perf";
import { useStreamingMessageBuffer } from "../hooks/use-streaming-message-buffer";
import { isToolPart } from "@/lib/chat/message-parts";
import { isApprovalPending } from "./tools/shared/tool-utils";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";

interface MessageListProps {
  className?: string;
  projectId?: string;
}

/** Chat message list for the active session. */
export default function MessageList({ className, projectId }: MessageListProps) {
  // 中文注释：统计渲染频率，用于定位流式渲染压力。
  incrementChatPerf("render.messageList");
  const { messages, isHistoryLoading, pendingCloudMessage } = useChatMessages();
  const { status, error, stepThinking } = useChatStatus();
  const { toolParts } = useChatTools();
  const { staticMessages, streamingMessage, isStreamingActive } = useStreamingMessageBuffer({
    messages,
    status,
    isHistoryLoading,
  });

  // 中文注释：流式结束后短暂保持 instant 模式，避免 action 按钮出现等布局变化触发 smooth 滚动弹跳。
  const [useInstantResize, setUseInstantResize] = React.useState(false);
  const wasStreamingRef = React.useRef(false);
  React.useEffect(() => {
    if (isStreamingActive) {
      wasStreamingRef.current = true;
      setUseInstantResize(true);
    } else if (wasStreamingRef.current) {
      wasStreamingRef.current = false;
      // 延迟切回 smooth，让过渡期的布局变化（含 Thinking exit 动画 250ms）以 instant 方式处理
      const timer = setTimeout(() => setUseInstantResize(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isStreamingActive]);

  const hasStreamingVisibleContent = React.useMemo(
    () => (streamingMessage ? messageHasVisibleContent(streamingMessage) : false),
    [streamingMessage]
  );
  // 逻辑：当前流式消息里是否存在「工具已派发、等待执行结果」的 tool part。
  // - input-available：参数已生成、工具执行中
  // - output-streaming：工具正在增量返回
  // 这两种状态下工具调用阻塞对话，用户除了等没有可见进度，必须显示 Thinking 提示。
  const hasAwaitingTool = React.useMemo(() => {
    if (!streamingMessage) return false;
    const parts = Array.isArray(streamingMessage.parts) ? streamingMessage.parts : [];
    return parts.some((part: any) => {
      if (!isToolPart(part)) return false;
      const toolCallId = typeof part?.toolCallId === "string" ? part.toolCallId : "";
      const snapshot = toolCallId ? (toolParts as any)?.[toolCallId] : undefined;
      const state = (snapshot?.state ?? part?.state) as string | undefined;
      return state === "input-available" || state === "output-streaming";
    });
  }, [streamingMessage, toolParts]);
  // 发送消息后，在 AI 还没返回任何可见内容前显示“正在思考中”。
  const shouldShowThinking = React.useMemo(() => {
    if (error) return false;
    if (stepThinking) return true;
    if (!(status === "submitted" || status === "streaming")) return false;
    // 工具阻塞期间即使消息已有可见 tool part，也要显示 Thinking（文案会切到「等待工具结果...」）。
    if (hasAwaitingTool) return true;
    // 逻辑：流式内容已可见时隐藏 thinking。
    if (hasStreamingVisibleContent) return false;
    const last = messages[messages.length - 1] as any;
    if (!last) return false;
    if (last.role === "user") return true;
    return last.role === "assistant" && !messageHasVisibleContent(last);
  }, [messages, status, error, stepThinking, hasStreamingVisibleContent, hasAwaitingTool]);

  const displayMessages = React.useMemo(() => {
    // 关键：即使 shouldShowThinking 为 true（stepThinking 触发），如果流式消息已有可见内容，
    // 也必须保留在显示列表中，避免已渲染的文本突然消失导致闪烁。
    // thinking 指示器会在消息列表下方与内容共存显示。
    const base =
      streamingMessage && (!shouldShowThinking || hasStreamingVisibleContent)
        ? [...staticMessages, streamingMessage]
        : staticMessages;
    // 请求失败时，移除尾部空 assistant 消息或内容与错误信息重复的 assistant 消息，
    // 避免错误文本同时作为普通消息和错误卡片重复显示。
    if (error && base.length > 0) {
      const last = base[base.length - 1];
      if (last?.role === "assistant") {
        if (!messageHasVisibleContent(last)) {
          return base.slice(0, -1);
        }
        // 历史恢复时，错误文本可能已被保存为 assistant 消息内容，与错误卡片重复。
        const errorMsg = error instanceof Error ? error.message : String(error);
        const lastText = getMessagePlainText(last).trim();
        if (lastText && errorMsg && lastText === errorMsg.trim()) {
          return base.slice(0, -1);
        }
      }
    }
    return base;
  }, [staticMessages, streamingMessage, shouldShowThinking, hasStreamingVisibleContent, error]);

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

  // 预计算 tab 级别的 pending approval（避免每个 MessageItem 订阅 toolParts context）
  const hasPendingApprovalInTab = React.useMemo(() => {
    if (!toolParts) return false;
    return Object.values(toolParts).some((part) => isApprovalPending(part as any));
  }, [toolParts]);

  // 不使用 useMemo 包装 messageNodes — 让 React.memo(MessageItem) 按 key 逐项优化。
  // status / shouldHideForApproval 作为 props 传入，避免 MessageItem 内部订阅高频 Context。
  const messageNodes = (displayMessages as any[]).map((message, index) => {
    const prevRole = index > 0 ? (displayMessages[index - 1] as any)?.role : undefined;
    const isGroupStart = message?.role !== prevRole;
    const isLast = index === lastAiIndex;

    // 逐消息计算 approval 状态（从 message.parts + toolParts snapshot 合并判定）
    let shouldHideForApproval = false;
    if (message?.role !== "user") {
      const parts = Array.isArray(message?.parts) ? message.parts : [];
      const msgToolParts = parts.filter((p: any) => isToolPart(p));
      if (msgToolParts.length > 0) {
        shouldHideForApproval = msgToolParts.some((part: any) => {
          const toolCallId = typeof part?.toolCallId === "string" ? String(part.toolCallId) : "";
          const snapshot = toolCallId ? toolParts?.[toolCallId] : undefined;
          const merged = snapshot ? { ...part, ...snapshot } : part;
          return isApprovalPending(merged as any);
        });
      } else if (isLast && hasPendingApprovalInTab) {
        shouldHideForApproval = true;
      }
    }

    return (
      <MessageItem
        key={message?.id ?? `m_${index}`}
        message={message}
        isGroupStart={isGroupStart}
        isLastHumanMessage={index === lastHumanIndex}
        isLastAiMessage={isLast}
        isLastAiActionMessage={index === lastAiActionIndex}
        hideAiActions={hideAiActions && lastMessageIsAssistant && isLast}
        status={status}
        shouldHideForApproval={shouldHideForApproval}
      />
    );
  });

  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        className
      )}
    >
      <Conversation className="min-h-0 flex-1 overflow-x-hidden [&_*:not(summary)]:!select-text" {...(useInstantResize ? { resize: "instant" } : {})}>
        <ConversationContent className="flex min-h-full w-full min-w-0 flex-col gap-1 pb-4">
          {shouldShowHelper ? (
            <ConversationEmptyState
              title="开始对话"
              description="输入消息开始与 AI 交互"
              className="flex-1"
            >
              <div className="mb-2 select-none font-bold leading-none tracking-widest" style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)' }}>
                <span className="text-foreground">Open</span>
                <span className="text-te-accent">Loaf</span>
              </div>
              <MessageHelper projectId={projectId} />
            </ConversationEmptyState>
          ) : null}

          {!shouldShowHelper ? messageNodes : null}

          <AnimatePresence initial={false}>
            {shouldShowThinking ? (
              <motion.div
                key="thinking"
                className="my-0.5 px-2"
                style={{ contain: "layout" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeInOut" }}
              >
                <MessageThinking showHeader={!lastMessageIsAssistant} streamingMessage={streamingMessage} awaitingTool={hasAwaitingTool} />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {pendingCloudMessage ? <PendingCloudLoginPrompt /> : null}
          </AnimatePresence>

          {error ? <MessageError error={error} /> : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  );
}
