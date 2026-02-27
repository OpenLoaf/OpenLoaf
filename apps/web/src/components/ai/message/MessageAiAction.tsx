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
import { SUMMARY_HISTORY_COMMAND } from "@openloaf/api/common";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Clock3,
  Copy,
  Minimize2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useChatActions, useChatSession, useChatState } from "../context";
import MessageBranchNav from "./MessageBranchNav";
import { getMessageTextWithToolCalls } from "@/lib/chat/message-text";
import { MessageAction, MessageActions } from "@/components/ai-elements/message";
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
 * Format milliseconds into a compact duration label.
 */
function formatDurationMs(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const seconds = value / 1000;
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const restSeconds = seconds - minutes * 60;
    return `${minutes}m ${restSeconds.toFixed(1)}s`;
  }
  return `${seconds.toFixed(1)}s`;
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
  const { retryAssistantMessage, clearError, sendMessage, deleteMessageSubtree } =
    useChatActions();
  const { status } = useChatState();
  const { leafMessageId, sessionId } = useChatSession();
  const [isCopying, setIsCopying] = React.useState(false);
  const [compactOpen, setCompactOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const text = getMessageTextWithToolCalls(message);

  const handleCopy = async () => {
    if (!text) return;
    try {
      setIsCopying(true);
      await navigator.clipboard.writeText(text);
      toast.success("已复制");
    } catch (error) {
      toast.error("复制失败");
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
        toast.success("已删除");
      } else {
        toast.error("删除失败");
      }
    } catch (error) {
      toast.error("删除失败");
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

  const agentInfo = ((message as any)?.agent ?? (message.metadata as any)?.agent) as
    | { model?: { provider?: string; modelId?: string } }
    | undefined;
  const agentModel = agentInfo?.model as { provider?: string; modelId?: string } | undefined;

  const handleCompactConfirm = React.useCallback(() => {
    if (isBusy) return;
    setCompactOpen(false);
    if (status === "error") clearError();
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: SUMMARY_HISTORY_COMMAND }],
    } as any);
  }, [clearError, isBusy, sendMessage, status]);

  return (
    <MessageActions className={cn("group select-none justify-start gap-0.5", className)}>
      <MessageAction
        onClick={handleCopy}
        disabled={!text || isCopying}
        className={MESSAGE_ACTION_CLASSNAME}
        tooltip="复制"
        label="复制"
        aria-label="复制"
        title="复制"
      >
        <Copy className="size-3" strokeWidth={2.5} />
      </MessageAction>

      <MessageAction
        onClick={handleRetry}
        disabled={isBusy}
        className={MESSAGE_ACTION_CLASSNAME}
        tooltip="重试"
        label="重试"
        aria-label="重试"
        title="重试"
      >
        <RotateCcw className="size-3" />
      </MessageAction>

      <ModelSelector open={deleteOpen} onOpenChange={setDeleteOpen}>
        <ModelSelectorTrigger asChild>
          <MessageAction
            disabled={isBusy || isDeleting}
            className={MESSAGE_ACTION_CLASSNAME}
            label="删除节点"
            aria-label="删除节点"
            title="删除节点"
          >
            <Trash2 className="size-3" />
          </MessageAction>
        </ModelSelectorTrigger>
        <ModelSelectorContent title="确认删除节点" className="max-w-md">
          <div className="space-y-4 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">确认删除该节点及其子节点？</h3>
              <p className="text-sm text-muted-foreground">
                删除后将无法恢复该节点及其所有后代消息。
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <PromptInputButton
                type="button"
                variant="outline"
                onClick={() => setDeleteOpen(false)}
                disabled={isDeleting || isBusy}
              >
                取消
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
                确认删除
              </PromptInputButton>
            </div>
          </div>
        </ModelSelectorContent>
      </ModelSelector>

      {canCompact ? (
        <ModelSelector open={compactOpen} onOpenChange={setCompactOpen}>
          <ModelSelectorTrigger asChild>
            <MessageAction
              disabled={isBusy}
              className={MESSAGE_ACTION_CLASSNAME}
              label="压缩上下文"
              aria-label="压缩上下文"
              title="压缩上下文"
            >
              <Minimize2 className="size-3" />
            </MessageAction>
          </ModelSelectorTrigger>
          <ModelSelectorContent title="确认压缩上下文" className="max-w-md">
            <div className="space-y-4 p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">确认压缩上下文？</h3>
                <p className="text-sm text-muted-foreground">
                  该操作会生成一条压缩摘要，并用于后续对话上下文。
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <PromptInputButton
                  type="button"
                  variant="outline"
                  onClick={() => setCompactOpen(false)}
                  disabled={isBusy}
                >
                  取消
                </PromptInputButton>
                <PromptInputButton
                  type="button"
                  onClick={handleCompactConfirm}
                  disabled={isBusy}
                >
                  确认压缩
                </PromptInputButton>
              </div>
            </div>
          </ModelSelectorContent>
        </ModelSelector>
      ) : null}

      <PromptInputHoverCard openDelay={120} closeDelay={120}>
        <PromptInputHoverCardTrigger asChild>
          <MessageAction
            disabled={!usage}
            className={MESSAGE_ACTION_CLASSNAME}
            label="Token 用量"
            aria-label="查看 token 用量"
            title="Token 用量"
          >
            <BarChart3 className="size-3" />
          </MessageAction>
        </PromptInputHoverCardTrigger>
        <PromptInputHoverCardContent className="max-w-[200px] p-2">
          {usage ? (
            <div className="space-y-0.5 text-xs">
              <div className="font-medium text-xs">Token 用量</div>
              {agentModel?.provider || agentModel?.modelId ? (
                <div className="text-[11px] text-muted-foreground truncate">
                  {agentModel?.provider ?? "-"} / {agentModel?.modelId ?? "-"}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-x-2 gap-y-0 text-[11px]">
                <div className="text-muted-foreground">输入</div>
                <div className="text-right tabular-nums">
                  {formatTokenCount(usage.inputTokens)}
                </div>
                {typeof usage.cachedInputTokens === "number" ? (
                  <>
                    <div className="text-muted-foreground">缓存</div>
                    <div className="text-right tabular-nums">
                      {formatTokenCount(usage.cachedInputTokens)}
                    </div>
                  </>
                ) : null}
                {typeof usage.noCacheTokens === "number" ? (
                  <>
                    <div className="text-muted-foreground">非缓存</div>
                    <div className="text-right tabular-nums">
                      {formatTokenCount(usage.noCacheTokens)}
                    </div>
                  </>
                ) : null}
                {typeof usage.reasoningTokens === "number" ? (
                  <>
                    <div className="text-muted-foreground">推理</div>
                    <div className="text-right tabular-nums">
                      {formatTokenCount(usage.reasoningTokens)}
                    </div>
                  </>
                ) : null}
                <div className="text-muted-foreground">输出</div>
                <div className="text-right tabular-nums">
                  {formatTokenCount(usage.outputTokens)}
                </div>
                <div className="text-muted-foreground font-medium">总计</div>
                <div className="text-right tabular-nums font-medium">
                  {formatTokenCount(usage.totalTokens)}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">暂无 token 信息</div>
          )}
        </PromptInputHoverCardContent>
      </PromptInputHoverCard>

      <MessageBranchNav messageId={message.id} />

      {typeof assistantElapsedMs === "number" ? (
        <span className="ml-1 inline-flex select-none items-center gap-1 text-xs text-muted-foreground/60 tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
          <Clock3 className="size-3" />
          {formatDurationMs(assistantElapsedMs)}
        </span>
      ) : null}
    </MessageActions>
  );
}
