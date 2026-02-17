"use client";

import { motion, useReducedMotion } from "motion/react";
import { useChatActions, useChatState } from "../../context";
import { RotateCcw } from "lucide-react";
import {
  StackTrace,
  StackTraceActions,
  StackTraceContent,
  StackTraceCopyButton,
  StackTraceError,
  StackTraceErrorMessage,
  StackTraceErrorType,
  StackTraceExpandButton,
  StackTraceFrames,
  StackTraceHeader,
} from "@/components/ai-elements/stack-trace";
import { MessageAction } from "@/components/ai-elements/message";

interface MessageErrorProps {
  /**
   * AI SDK v6 的 chat 在异常时不一定保证抛出的是 `Error` 实例（可能是 string / object）。
   * 这里用 unknown 做兜底，并在 UI 层做一层“可读化”解析。
   */
  error: unknown;
  canRetry?: boolean;
}

type ParsedError = {
  title: string;
  message: string;
  displayMessage: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

/**
 * 尝试从字符串里解析 JSON 错误（例如后端返回 400 时，Error.message 可能是 `{"error":"..."}`）。
 */
function tryExtractJsonErrorMessage(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return undefined;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string") return parsed;
    if (!isRecord(parsed)) return undefined;
    const error = parsed.error;
    if (typeof error === "string") return error;
    const message = parsed.message;
    if (typeof message === "string") return message;
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Map raw error text to a unified display message.
 */
function resolveDisplayMessage(rawMessage: string): string {
  const trimmed = rawMessage.trim();
  const normalized = trimmed.toLowerCase();
  if (normalized.includes("upstream error: do request failed")) {
    return "模型配置存在问题，请检查配置。";
  }
  if (normalized.includes("not implemented")) {
    return "不支持的接口，请检查模型接口配置。";
  }
  return trimmed ? "请求失败，请稍后重试。" : "请求失败，请稍后重试。";
}

/**
 * Parse unknown error into display-friendly info.
 */
function parseChatError(error: unknown): ParsedError {
  const title = "出错了";

  if (error instanceof Error) {
    const extracted = tryExtractJsonErrorMessage(error.message);
    const message = extracted ?? error.message ?? String(error);
    return { title, message, displayMessage: resolveDisplayMessage(message) };
  }

  if (typeof error === "string") {
    const message = tryExtractJsonErrorMessage(error) ?? error;
    return {
      title,
      message,
      displayMessage: resolveDisplayMessage(message),
    };
  }

  if (isRecord(error)) {
    const rawMessage =
      typeof error.error === "string"
        ? error.error
        : typeof error.message === "string"
          ? error.message
          : undefined;

    const message =
      (rawMessage ? tryExtractJsonErrorMessage(rawMessage) ?? rawMessage : undefined) ??
      "发生未知错误（error 不是标准 Error 实例）。";
    return { title, message, displayMessage: resolveDisplayMessage(message) };
  }

  const message = String(error);
  return { title, message, displayMessage: resolveDisplayMessage(message) };
}

export default function MessageError({ error }: MessageErrorProps) {
  const reduceMotion = useReducedMotion();
  const { regenerate, clearError } = useChatActions();
  const { status } = useChatState();
  const parsed = parseChatError(error);

  const handleRetry = () => {
    clearError();
    regenerate();
  };

  // 仅在“正在提交/流式输出”时禁用重试；error 状态需要允许用户重试
  const isBusy = status === "submitted" || status === "streaming";

  return (
    <motion.div
      key="message-error"
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{
        duration: 0.16,
        ease: "easeOut",
      }}
      className="px-2 pb-2"
    >
      <StackTrace
        trace={parsed.message}
        defaultOpen={false}
        className="border-destructive/20 bg-destructive/5"
      >
        <StackTraceHeader>
          <StackTraceError>
            <StackTraceErrorType>{parsed.title}</StackTraceErrorType>
            <StackTraceErrorMessage>{parsed.displayMessage}</StackTraceErrorMessage>
          </StackTraceError>
          <StackTraceActions>
            <StackTraceCopyButton aria-label="复制错误日志" title="复制错误日志" />
            <MessageAction
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7"
              onClick={handleRetry}
              disabled={isBusy}
              aria-label="重试"
              title="重试"
              label="重试"
              tooltip="重试"
            >
              <RotateCcw className="size-3.5" />
            </MessageAction>
            <StackTraceExpandButton />
          </StackTraceActions>
        </StackTraceHeader>
        <StackTraceContent maxHeight={240}>
          <StackTraceFrames />
        </StackTraceContent>
      </StackTrace>
    </motion.div>
  );
}
