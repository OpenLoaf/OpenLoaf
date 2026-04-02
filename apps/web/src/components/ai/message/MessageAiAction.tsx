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
import { useTranslation } from "react-i18next";
import type { UIMessage } from "@ai-sdk/react";
import { SUMMARY_HISTORY_COMMAND } from "@openloaf/api/common";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Clock3,
  Download,
  Sparkles,
  Copy,
  Minimize2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useChatActions, useChatSession, useChatStatus } from "../context";
import MessageBranchNav from "./MessageBranchNav";
import { getMessageTextWithToolCalls } from "@/lib/chat/message-text";
import { messageToMarkdown } from "@/lib/chat/message-to-markdown";
import { SaveMessageDialog } from "./SaveMessageDialog";
import { MessageAction, MessageActions } from "@/components/ai-elements/message";
import { TooltipProvider } from "@openloaf/ui/tooltip";
import {
  PromptInputButton,
  PromptInputHoverCard,
  PromptInputHoverCardContent,
  PromptInputHoverCardTrigger,
} from "@/components/ai-elements/prompt-input";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";

const TOKEN_K = 1000;
const TOKEN_M = 1000 * 1000;
const MESSAGE_ACTION_CLASSNAME =
  "h-6 w-6 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105 active:scale-95";

/**
 * Format token count into a compact K/M notation.
 */
function formatTokenCount(value: unknown): string {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return "-";
  if (numberValue === 0) return "0";
  const abs = Math.abs(numberValue);
  if (abs >= TOKEN_M) {
    const next = numberValue / TOKEN_M;
    const fixed = next.toFixed(1);
    return `${fixed}M`;
  }
  if (abs >= TOKEN_K) {
    const next = numberValue / TOKEN_K;
    const fixed = next.toFixed(1);
    return `${fixed}K`;
  }
  return Number.isInteger(numberValue) ? numberValue.toFixed(1) : String(numberValue);
}

type NormalizedTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  noCacheTokens?: number;
};

/**
 * Extract token usage from message.metadata (best-effort).
 * - Compatible with totalUsage / usage / tokenUsage plus alternate field names
 * - Derive noCacheTokens from cachedInputTokens when needed
 */
function extractTokenUsage(metadata: unknown): NormalizedTokenUsage | undefined {
  const meta = metadata as any;
  const raw = meta?.totalUsage ?? meta?.usage ?? meta?.tokenUsage ?? null;
  if (!raw || typeof raw !== "object") return;

  const toNumberOrUndefined = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))
        ? Number(value)
        : undefined;

  const inputTokens = toNumberOrUndefined(raw.inputTokens ?? raw.promptTokens ?? raw.input_tokens);
  const outputTokens = toNumberOrUndefined(
    raw.outputTokens ?? raw.completionTokens ?? raw.output_tokens,
  );
  const totalTokens = toNumberOrUndefined(raw.totalTokens ?? raw.total_tokens);
  const reasoningTokens = toNumberOrUndefined(raw.reasoningTokens ?? raw.reasoning_tokens);
  const cachedInputTokens = toNumberOrUndefined(raw.cachedInputTokens ?? raw.cached_input_tokens);

  const noCacheTokens =
    toNumberOrUndefined(raw?.inputTokenDetails?.noCacheTokens) ??
    (typeof inputTokens === "number" && typeof cachedInputTokens === "number"
      ? Math.max(0, inputTokens - cachedInputTokens)
      : undefined);

  const usage: NormalizedTokenUsage = {
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    cachedInputTokens,
    noCacheTokens,
  };

  if (Object.values(usage).every((v) => v === undefined)) return;
  return usage;
}

/**
 * Extract assistant elapsed time (ms) from metadata.openloaf.
 */
function extractAssistantElapsedMs(metadata: unknown): number | undefined {
  const meta = metadata as any;
  const elapsed = meta?.openloaf?.assistantElapsedMs;
  if (typeof elapsed === "number" && Number.isFinite(elapsed)) return elapsed;
  if (typeof elapsed === "string" && elapsed.trim() !== "" && Number.isFinite(Number(elapsed))) {
    return Number(elapsed);
  }
  return;
}

/**
 * Extract credits consumed from metadata.openloaf.
 */
function extractCreditsConsumed(metadata: unknown): number | undefined {
  const meta = metadata as any;
  const credits = meta?.openloaf?.creditsConsumed;
  if (typeof credits === "number" && Number.isFinite(credits) && credits > 0) return credits;
  return;
}

/**
 * Format milliseconds into a compact duration label.
 */
function formatDurationMs(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const seconds = Math.round(value / 1000);
  return `${seconds}s`;
}

/**
 * Render action buttons and stats for a chat message.
 */
export default function MessageAiAction({
  message,
  className,
}: {
  message: UIMessage;
  className?: string;
}) {
  const { t } = useTranslation(["ai", "common"]);
  const { retryAssistantMessage, clearError, sendMessage, deleteMessageSubtree, readOnly } =
    useChatActions();
  const { status } = useChatStatus();
  const { leafMessageId, sessionId } = useChatSession();
  const { projectId: chatProjectId } = useChatSession();
  const [isCopying, setIsCopying] = React.useState(false);
  const [compactOpen, setCompactOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const text = getMessageTextWithToolCalls(message);
  const markdownContent = React.useMemo(() => messageToMarkdown(message), [message]);

  const handleCopy = async () => {
    if (!text) return;
    try {
      setIsCopying(true);
      await navigator.clipboard.writeText(text);
      toast.success(t("common:copied"));
    } catch (error) {
      toast.error(t("common:copyFailed"));
      console.error(error);
    } finally {
      setIsCopying(false);
    }
  };

  const handleRetry = () => {
    clearError();
    // 关键：允许对任意 assistant 消息重试（会在该节点处产生新分支）
    retryAssistantMessage(message.id);
  };

  /**
   * Delete the current message subtree.
   */
  const handleDeleteSubtree = async () => {
    const targetId = String(message?.id ?? "").trim();
    if (!targetId || isBusy || isDeleting) return;
    try {
      setIsDeleting(true);
      const ok = await deleteMessageSubtree(targetId);
      if (ok) {
        toast.success(t("common:deleted"));
      } else {
        toast.error(t("common:deleteFailed"));
      }
    } catch (error) {
      toast.error(t("common:deleteFailed"));
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  // 仅在“正在提交/流式输出”时禁用交互；error/ready 状态都允许重试
  const isBusy = status === "submitted" || status === "streaming";
  const messageId = String((message as any)?.id ?? "");
  const isLeafMessage = Boolean(messageId && leafMessageId && messageId === String(leafMessageId));
  const messageKind = (message as any)?.messageKind;
  const canCompact = message.role === "assistant" && isLeafMessage && messageKind !== "compact_summary";

  const usage = extractTokenUsage(message.metadata);
  const assistantElapsedMs = extractAssistantElapsedMs(message.metadata);
  const creditsConsumed = extractCreditsConsumed(message.metadata);

  const agentInfo = ((message as any)?.agent ?? (message.metadata as any)?.agent) as
    | { model?: { provider?: string; modelId?: string } }
    | undefined;
  const agentModel = agentInfo?.model as { provider?: string; modelId?: string } | undefined;
  const isSaasModel = agentModel?.provider === "openloaf-saas";

  const isCliMessage = agentModel?.provider?.includes("cli");

  const handleCompactConfirm = React.useCallback(() => {
    if (isBusy) return;
    setCompactOpen(false);
    if (status === "error") clearError();

    if (isCliMessage) {
      // CLI 模式：发送 /compact 到 CLI SDK（由 SDK 原生处理 compact）
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: "/compact" }],
        metadata: { directCli: true, cliCompact: true },
      } as any);
    } else {
      // 普通模式：走 /summary-history
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: SUMMARY_HISTORY_COMMAND }],
      } as any);
    }
  }, [clearError, isBusy, isCliMessage, sendMessage, status]);

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <MessageActions className={cn("group select-none justify-start gap-0.5", className)}>
      <MessageAction
        onClick={handleCopy}
        disabled={!text || isCopying}
        className={MESSAGE_ACTION_CLASSNAME}
        tooltip={t("common:copy")}
        label={t("common:copy")}
        aria-label={t("common:copy")}
        title={t("common:copy")}
      >
        <Copy className="size-3" strokeWidth={2.5} />
      </MessageAction>

      <MessageAction
        onClick={() => setSaveOpen(true)}
        disabled={!markdownContent || isBusy}
        className={MESSAGE_ACTION_CLASSNAME}
        tooltip={t("ai:message.saveAsMarkdown")}
        label={t("ai:message.saveAsMarkdown")}
        aria-label={t("ai:message.saveAsMarkdown")}
        title={t("ai:message.saveAsMarkdown")}
      >
        <Download className="size-3" />
      </MessageAction>

      {!readOnly ? (
        <MessageAction
          onClick={handleRetry}
          disabled={isBusy}
          className={MESSAGE_ACTION_CLASSNAME}
          tooltip={t("ai:message.retry")}
          label={t("ai:message.retry")}
          aria-label={t("ai:message.retry")}
          title={t("ai:message.retry")}
        >
          <RotateCcw className="size-3" />
        </MessageAction>
      ) : null}

      {!readOnly ? (
        <ModelSelector open={deleteOpen} onOpenChange={setDeleteOpen}>
          <ModelSelectorTrigger asChild>
            <MessageAction
              disabled={isBusy || isDeleting}
              className={MESSAGE_ACTION_CLASSNAME}
              label={t("ai:message.deleteNode")}
              aria-label={t("ai:message.deleteNode")}
              title={t("ai:message.deleteNode")}
            >
              <Trash2 className="size-3" />
            </MessageAction>
          </ModelSelectorTrigger>
          <ModelSelectorContent title={t("ai:message.deleteNodeTitle")} className="max-w-md">
            <div className="space-y-4 p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">{t("ai:message.deleteNodeConfirm")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("ai:message.deleteNodeDesc")}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <PromptInputButton
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteOpen(false)}
                  disabled={isDeleting || isBusy}
                >
                  {t("common:cancel")}
                </PromptInputButton>
                <PromptInputButton
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    void handleDeleteSubtree();
                    setDeleteOpen(false);
                  }}
                  disabled={isDeleting || isBusy}
                >
                  {t("ai:message.deleteNodeBtn")}
                </PromptInputButton>
              </div>
            </div>
          </ModelSelectorContent>
        </ModelSelector>
      ) : null}

      {!readOnly && canCompact ? (
        <ModelSelector open={compactOpen} onOpenChange={setCompactOpen}>
          <ModelSelectorTrigger asChild>
            <MessageAction
              disabled={isBusy}
              className={MESSAGE_ACTION_CLASSNAME}
              label={t("ai:message.compactContext")}
              aria-label={t("ai:message.compactContext")}
              title={t("ai:message.compactContext")}
            >
              <Minimize2 className="size-3" />
            </MessageAction>
          </ModelSelectorTrigger>
          <ModelSelectorContent title={t("ai:message.compactContextTitle")} className="max-w-md">
            <div className="space-y-4 p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">{t("ai:message.compactContextConfirm")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("ai:message.compactContextDesc")}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <PromptInputButton
                  type="button"
                  variant="outline"
                  onClick={() => setCompactOpen(false)}
                  disabled={isBusy}
                >
                  {t("common:cancel")}
                </PromptInputButton>
                <PromptInputButton
                  type="button"
                  onClick={handleCompactConfirm}
                  disabled={isBusy}
                >
                  {t("ai:message.compactContextBtn")}
                </PromptInputButton>
              </div>
            </div>
          </ModelSelectorContent>
        </ModelSelector>
      ) : null}

      {!isSaasModel ? (
        <PromptInputHoverCard openDelay={120} closeDelay={120}>
          <PromptInputHoverCardTrigger asChild>
            <MessageAction
              disabled={!usage}
              className={MESSAGE_ACTION_CLASSNAME}
              label={t("ai:message.tokenUsage")}
              aria-label={t("ai:message.tokenUsage")}
              title={t("ai:message.tokenUsage")}
            >
              <BarChart3 className="size-3" />
            </MessageAction>
          </PromptInputHoverCardTrigger>
          <PromptInputHoverCardContent className="max-w-[200px] p-2">
            {usage ? (
              <div className="space-y-0.5 text-xs">
                <div className="font-medium text-xs">{t("ai:message.tokenUsage")}</div>
                {agentModel?.provider || agentModel?.modelId ? (
                  <div className="text-[11px] text-muted-foreground truncate">
                    {agentModel?.provider ?? "-"} / {agentModel?.modelId ?? "-"}
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-x-2 gap-y-0 text-[11px]">
                  <div className="text-muted-foreground">{t("ai:message.tokenInput")}</div>
                  <div className="text-right tabular-nums">
                    {formatTokenCount(usage.inputTokens)}
                  </div>
                  {typeof usage.cachedInputTokens === "number" ? (
                    <>
                      <div className="text-muted-foreground">{t("ai:message.tokenCached")}</div>
                      <div className="text-right tabular-nums">
                        {formatTokenCount(usage.cachedInputTokens)}
                      </div>
                    </>
                  ) : null}
                  {typeof usage.noCacheTokens === "number" ? (
                    <>
                      <div className="text-muted-foreground">{t("ai:message.tokenNoCache")}</div>
                      <div className="text-right tabular-nums">
                        {formatTokenCount(usage.noCacheTokens)}
                      </div>
                    </>
                  ) : null}
                  {typeof usage.reasoningTokens === "number" ? (
                    <>
                      <div className="text-muted-foreground">{t("ai:message.tokenReasoning")}</div>
                      <div className="text-right tabular-nums">
                        {formatTokenCount(usage.reasoningTokens)}
                      </div>
                    </>
                  ) : null}
                  <div className="text-muted-foreground">{t("ai:message.tokenOutput")}</div>
                  <div className="text-right tabular-nums">
                    {formatTokenCount(usage.outputTokens)}
                  </div>
                  <div className="text-muted-foreground font-medium">{t("ai:message.tokenTotal")}</div>
                  <div className="text-right tabular-nums font-medium">
                    {formatTokenCount(usage.totalTokens)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">{t("ai:message.tokenNoInfo")}</div>
            )}
          </PromptInputHoverCardContent>
        </PromptInputHoverCard>
      ) : null}

      <MessageBranchNav messageId={message.id} />

      {typeof assistantElapsedMs === "number" ? (
        <span className="ml-1 inline-flex select-none items-center gap-1 text-xs text-muted-foreground/60 tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
          <Clock3 className="size-3" />
          {formatDurationMs(assistantElapsedMs)}
        </span>
      ) : null}

      {typeof creditsConsumed === "number" ? (
        <span className="ml-1 inline-flex select-none items-center gap-1 text-xs text-muted-foreground/60 tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
          <Sparkles className="size-3" />
          {Math.floor(creditsConsumed)}
        </span>
      ) : null}
        </MessageActions>
      </TooltipProvider>

      <SaveMessageDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        content={markdownContent}
        lockedProjectId={chatProjectId}
      />
    </>
  );
}
