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
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "motion/react";
import { useChatActions, useChatStatus, useChatMessages } from "../../context";
import { ArrowRight, CheckIcon, CopyIcon, RotateCcw } from "lucide-react";

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
function resolveDisplayMessage(rawMessage: string, unknownError: string): string {
  const trimmed = rawMessage.trim();
  if (!trimmed) return unknownError;
  return trimmed;
}

function parseChatError(error: unknown, title: string, unknownError: string): ParsedError {
  if (error instanceof Error) {
    const extracted = tryExtractJsonErrorMessage(error.message);
    const message = extracted ?? error.message ?? String(error);
    return { title, message, displayMessage: resolveDisplayMessage(message, unknownError) };
  }

  if (typeof error === "string") {
    const message = tryExtractJsonErrorMessage(error) ?? error;
    return { title, message, displayMessage: resolveDisplayMessage(message, unknownError) };
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
      unknownError;
    return { title, message, displayMessage: resolveDisplayMessage(message, unknownError) };
  }

  const message = String(error);
  return { title, message, displayMessage: resolveDisplayMessage(message, unknownError) };
}

export default function MessageError({ error }: MessageErrorProps) {
  const { t } = useTranslation('ai')
  const reduceMotion = useReducedMotion();
  const { regenerate, clearError, continueAssistantTurn } = useChatActions();
  const { status } = useChatStatus();
  const { messages } = useChatMessages();
  const parsed = parseChatError(error, t('error.title'), t('error.unknown'));
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const handleRetry = () => {
    clearError();
    regenerate();
  };

  const handleContinue = () => {
    // 找到最后一条 assistant message 的 ID，从断点继续
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant) {
      continueAssistantTurn(String(lastAssistant.id));
    } else {
      // 找不到 assistant 时回退到 regenerate
      clearError();
      regenerate();
    }
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
      <div className="overflow-hidden rounded-3xl bg-ol-red-bg dark:bg-red-950/60">
        {/* 第一行：红绿灯（左） + 标题（右对齐） */}
        <div className="flex items-center justify-between px-3.5 py-2">
          <div className="flex shrink-0 items-center gap-[5px]">
            <span className="size-[10px] rounded-full bg-[#ff5f57]" />
            <span className="size-[10px] rounded-full bg-[#febc2e]" />
            <span className="size-[10px] rounded-full bg-[#28c840]" />
          </div>
          <span className="text-[11px] font-medium text-ol-red/60 dark:text-red-400/70">
            {parsed.title}
          </span>
        </div>

        {/* 第二行：错误信息（始终显示） */}
        <div className="px-3.5 pb-2.5">
          <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ol-red dark:text-red-300">
            {parsed.message}
          </p>
        </div>

        {/* 第三行：操作按钮 */}
        <div className="flex items-center justify-end gap-1.5 border-t border-ol-red/10 dark:border-red-400/15 px-3.5 py-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-7 items-center gap-1.5 rounded-3xl border border-ol-red/20 bg-white/60 px-3 text-[11px] font-medium text-ol-red transition-colors duration-150 hover:bg-ol-red-bg dark:border-red-400/20 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
          >
            {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
            {copied ? t('error.copied') : t('error.copyLog')}
          </button>
          <button
            type="button"
            onClick={handleRetry}
            disabled={isBusy}
            className="inline-flex h-7 items-center gap-1.5 rounded-3xl border border-ol-red/20 bg-white/60 px-3 text-[11px] font-medium text-ol-red transition-colors duration-150 hover:bg-ol-red-bg disabled:opacity-40 dark:border-red-400/20 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
          >
            <RotateCcw className="size-3" />
            {t('error.retry')}
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={isBusy}
            className="inline-flex h-7 items-center gap-1.5 rounded-3xl bg-ol-red px-3 text-[11px] font-medium text-white transition-colors duration-150 hover:brightness-110 disabled:opacity-40"
          >
            <ArrowRight className="size-3" />
            {t('error.continue')}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
