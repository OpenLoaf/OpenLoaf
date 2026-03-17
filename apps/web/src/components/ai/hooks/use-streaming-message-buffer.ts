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

import * as React from "react";
import type { UIMessage } from "@ai-sdk/react";
import type { ChatStatus } from "@/hooks/use-chat-runtime";

type UseStreamingMessageBufferInput = {
  /** Messages from the chat state. */
  messages: UIMessage[];
  /** Current chat status. */
  status: ChatStatus;
  /** Whether history is loading. */
  isHistoryLoading: boolean;
  /** Buffer interval in milliseconds. */
  bufferMs?: number;
};

export type StreamingMessageBufferResult = {
  /** Stable message list excluding the streaming assistant. */
  staticMessages: UIMessage[];
  /** Buffered streaming assistant message. */
  streamingMessage: UIMessage | null;
  /** Whether streaming split mode is active. */
  isStreamingActive: boolean;
};

/** Compare message arrays by reference for each item. */
function areMessagesEqualByRef(next: UIMessage[], prev: UIMessage[]) {
  if (next === prev) return true;
  if (next.length !== prev.length) return false;
  for (let i = 0; i < next.length; i += 1) {
    if (next[i] !== prev[i]) return false;
  }
  return true;
}

/** Buffer streaming assistant updates to reduce re-render pressure. */
export function useStreamingMessageBuffer(
  input: UseStreamingMessageBufferInput,
): StreamingMessageBufferResult {
  const { messages, status, isHistoryLoading } = input;
  const bufferMs = Number.isFinite(input.bufferMs) ? Math.max(0, input.bufferMs ?? 0) : 16;
  const [bufferedMessage, setBufferedMessage] = React.useState<UIMessage | null>(null);
  const latestMessageRef = React.useRef<UIMessage | null>(null);
  const lastFlushAtRef = React.useRef(0);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferedIdRef = React.useRef<string | null>(null);
  const stableStaticMessagesRef = React.useRef<UIMessage[]>(messages);
  /** Whether chat is currently streaming. */
  const isStreaming = status === "submitted" || status === "streaming";

  /** Clear the pending flush timer. */
  const clearTimer = React.useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  /** Flush the latest buffered assistant message. */
  const flushLatest = React.useCallback(() => {
    timerRef.current = null;
    const next = latestMessageRef.current;
    if (!next) return;
    latestMessageRef.current = null;
    lastFlushAtRef.current = Date.now();
    setBufferedMessage(next);
  }, []);

  React.useEffect(() => {
    if (!isStreaming || isHistoryLoading || messages.length === 0) {
      // 逻辑：非流式阶段清理缓冲，避免残留旧消息。
      latestMessageRef.current = null;
      bufferedIdRef.current = null;
      clearTimer();
      setBufferedMessage(null);
      return;
    }

    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") {
      // 逻辑：没有 assistant 在流式输出时，不启用缓冲分离。
      latestMessageRef.current = null;
      bufferedIdRef.current = null;
      clearTimer();
      setBufferedMessage(null);
      return;
    }

    const lastId = String((last as any)?.id ?? "");
    if (bufferedIdRef.current !== lastId) {
      // 逻辑：新的 assistant 流开始时立即展示首帧。
      bufferedIdRef.current = lastId;
      latestMessageRef.current = null;
      lastFlushAtRef.current = Date.now();
      clearTimer();
      setBufferedMessage(last);
      return;
    }

    latestMessageRef.current = last;
    if (!timerRef.current) {
      const elapsed = Date.now() - lastFlushAtRef.current;
      const delay = Math.max(0, bufferMs - elapsed);
      timerRef.current = setTimeout(flushLatest, delay);
    }
  }, [
    messages,
    isStreaming,
    isHistoryLoading,
    bufferMs,
    clearTimer,
    flushLatest,
  ]);

  React.useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const liveStreamingMessage = React.useMemo(() => {
    if (!isStreaming || isHistoryLoading || messages.length === 0) return null;
    const last = messages[messages.length - 1];
    return last?.role === "assistant" ? last : null;
  }, [messages, isStreaming, isHistoryLoading]);

  const liveStreamingId = React.useMemo(() => {
    if (!liveStreamingMessage) return "";
    return String((liveStreamingMessage as any)?.id ?? "");
  }, [liveStreamingMessage]);

  const currentStaticMessages = React.useMemo(() => {
    if (liveStreamingMessage) return messages.slice(0, -1);
    return messages;
  }, [messages, liveStreamingMessage]);

  const stableStaticMessages = React.useMemo(() => {
    const previous = stableStaticMessagesRef.current;
    if (areMessagesEqualByRef(currentStaticMessages, previous)) {
      return previous;
    }
    stableStaticMessagesRef.current = currentStaticMessages;
    return currentStaticMessages;
  }, [currentStaticMessages]);

  const shouldUseLiveAssistant =
    Boolean(liveStreamingMessage) &&
    (!bufferedMessage || bufferedIdRef.current !== liveStreamingId);
  const shouldRenderStreamingMessage =
    Boolean(liveStreamingMessage) && isStreaming && !isHistoryLoading;
  // 中文注释：静态消息始终以当前消息快照同步收口，只对最后一条流式 assistant 做缓冲。
  const resolvedStaticMessages = stableStaticMessages;
  const resolvedStreamingMessage = shouldUseLiveAssistant
    ? liveStreamingMessage
    : shouldRenderStreamingMessage && Boolean(bufferedMessage)
      ? bufferedMessage
      : null;
  const isStreamingActive = Boolean(resolvedStreamingMessage);

  return React.useMemo(
    () => ({
      staticMessages: resolvedStaticMessages,
      streamingMessage: resolvedStreamingMessage,
      isStreamingActive,
    }),
    [resolvedStaticMessages, resolvedStreamingMessage, isStreamingActive],
  );
}
