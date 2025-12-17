"use client";

import { motion, useReducedMotion } from "motion/react";
import { useChatContext } from "../ChatProvider";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

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
  details?: string;
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
 * 把 unknown 异常对象转成用户可读的结构，并保留可展开的详情信息。
 */
function parseChatError(error: unknown): ParsedError {
  const title = "出错了";

  if (error instanceof Error) {
    const extracted = tryExtractJsonErrorMessage(error.message);
    const message = extracted ?? error.message ?? String(error);

    const cause = (error as any).cause as unknown;
    const causeText =
      cause instanceof Error
        ? `${cause.name}: ${cause.message}`
        : typeof cause === "string"
          ? cause
          : isRecord(cause) && typeof cause.message === "string"
            ? cause.message
            : undefined;

    const details = [
      error.name ? `name: ${error.name}` : null,
      causeText ? `cause: ${causeText}` : null,
      error.stack ? `stack:\n${error.stack}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    return { title, message, details: details || undefined };
  }

  if (typeof error === "string") {
    return {
      title,
      message: tryExtractJsonErrorMessage(error) ?? error,
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

    let details: string | undefined;
    try {
      details = JSON.stringify(error, null, 2);
    } catch {
      details = String(error);
    }

    return { title, message, details };
  }

  return { title, message: String(error) };
}

export default function MessageError({ error }: MessageErrorProps) {
  const reduceMotion = useReducedMotion();
  const { regenerate, clearError, status } = useChatContext();
  const parsed = parseChatError(error);

  const handleRetry = () => {
    clearError();
    regenerate();
  };

  const isBusy = status !== "ready";

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
      className="flex justify-start"
    >
      <div className="w-full min-w-0 max-w-full p-3 rounded-lg bg-destructive/10 text-destructive">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{parsed.title}</span>
        </div>
        <p className="text-xs mt-1 break-words">{parsed.message}</p>

        {parsed.details ? (
          <details className="mt-2">
            <summary className="cursor-pointer select-none text-xs text-destructive/80">
              详情
            </summary>
            <pre
              className={cn(
                "mt-2 max-h-48 overflow-auto rounded bg-background/60 p-2 text-[11px] leading-4 text-foreground/80",
              )}
            >
              {parsed.details}
            </pre>
          </details>
        ) : null}

        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/20"
            onClick={handleRetry}
            disabled={isBusy}
            aria-label="重试"
            title="重试"
          >
            <RotateCcw className="size-3 mr-1" />
            重试
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
