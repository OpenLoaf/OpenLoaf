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

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useChatActions, useChatState } from "../../context";
import { CheckIcon, CopyIcon, RotateCcw } from "lucide-react";

interface MessageErrorProps {
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
    if (isRecord(error) && typeof error.message === "string") return error.message;
    const message = parsed.message;
    if (typeof message === "string") return message;
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * 直接展示原始错误信息，不做友好化映射。
 */
function resolveDisplayMessage(rawMessage: string): string {
  const trimmed = rawMessage.trim();
  if (!trimmed) return "发生未知错误";
  return trimmed;
}

function parseChatError(error: unknown): ParsedError {
  const title = "出错了";

  if (error instanceof Error) {
    const extracted = tryExtractJsonErrorMessage(error.message);
    const message = extracted ?? error.message ?? String(error);
    return { title, message, displayMessage: resolveDisplayMessage(message) };
  }

  if (typeof error === "string") {
    const message = tryExtractJsonErrorMessage(error) ?? error;
    return { title, message, displayMessage: resolveDisplayMessage(message) };
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
      "发生未知错误";
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
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const handleRetry = () => {
    clearError();
    regenerate();
  };

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(parsed.message);
      setCopied(true);
      timerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  }, [parsed.message]);

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <motion.div
      key="message-error"
      layout
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="my-0.5 px-2 pr-5"
    >
      <div className="overflow-hidden rounded-xl bg-[#fef0f0] dark:bg-red-950/25">
        {/* 第一行：红绿灯（左） + 标题（右对齐） */}
        <div className="flex items-center justify-between px-3.5 py-2">
          <div className="flex shrink-0 items-center gap-[5px]">
            <span className="size-[10px] rounded-full bg-[#d93025] dark:bg-red-500" />
            <span className="size-[10px] rounded-full bg-[#d93025]/20 dark:bg-red-500/20" />
            <span className="size-[10px] rounded-full bg-[#d93025]/20 dark:bg-red-500/20" />
          </div>
          <span className="text-[11px] font-medium text-[#d93025]/60 dark:text-red-400/60">
            {parsed.title}
          </span>
        </div>

        {/* 第二行：错误信息（始终显示） */}
        <div className="px-3.5 pb-2.5">
          <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[#d93025] dark:text-red-300">
            {parsed.message}
          </p>
        </div>

        {/* 第三行：操作按钮 */}
        <div className="flex items-center gap-1.5 border-t border-[#d93025]/10 px-3.5 py-2 dark:border-red-500/10">
          <button
            type="button"
            onClick={handleRetry}
            disabled={isBusy}
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#d93025] px-3 text-[11px] font-medium text-white transition-colors duration-150 hover:bg-[#b7271d] disabled:opacity-40 dark:bg-red-700 dark:hover:bg-red-600"
          >
            <RotateCcw className="size-3" />
            重试
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#d93025]/20 bg-white/60 px-3 text-[11px] font-medium text-[#d93025] transition-colors duration-150 hover:bg-[#fce8e6] dark:border-red-500/20 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
          >
            {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
            {copied ? "已复制" : "复制日志"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
