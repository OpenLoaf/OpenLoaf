"use client";

import * as React from "react";
import type { UIMessage } from "@ai-sdk/react";
import { SUMMARY_HISTORY_COMMAND } from "@tenas-ai/api/common";
import { Button } from "@tenas-ai/ui/button";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Clock3,
  Copy,
  Minimize2,
  RotateCcw,
  Trash2,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { toast } from "sonner";
import { useChatActions, useChatSession, useChatState } from "../context";
import { trpc } from "@/utils/trpc";
import { useMutation } from "@tanstack/react-query";
import MessageBranchNav from "./MessageBranchNav";
import { getMessageTextWithToolCalls } from "@/lib/chat/message-text";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tenas-ai/ui/tooltip";
import { messageActionIconButtonClassName } from "./message-action-styles";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@tenas-ai/ui/alert-dialog";

const TOKEN_K = 1000;
const TOKEN_M = 1000 * 1000;

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
 * Extract assistant elapsed time (ms) from metadata.tenas.
 */
function extractAssistantElapsedMs(metadata: unknown): number | undefined {
  const meta = metadata as any;
  const elapsed = meta?.tenas?.assistantElapsedMs;
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
  const { retryAssistantMessage, clearError, updateMessage, sendMessage, deleteMessageSubtree } =
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

  const ratingValue = (message.metadata as any)?.isGood ?? null;

  // 使用 TanStack React Query 调用接口更新评价
  const updateRatingMutation = useMutation({
    ...trpc.chat.updateMessageMetadata.mutationOptions(),
    onSuccess: (result) => {
      // 逻辑：成功后用服务端返回的 metadata 回写到本地消息。
      updateMessage(message.id, { metadata: (result as any).metadata ?? null });
      toast.success("评价成功");
    },
    onError: () => {
      toast.error("评价失败，请稍后重试");
    },
  });

  const isRating = updateRatingMutation.isPending;

  const usage = extractTokenUsage(message.metadata);
  const assistantElapsedMs = extractAssistantElapsedMs(message.metadata);

  const agentInfo = ((message as any)?.agent ?? (message.metadata as any)?.agent) as
    | { model?: { provider?: string; modelId?: string } }
    | undefined;
  const agentModel = agentInfo?.model as { provider?: string; modelId?: string } | undefined;

  const buildNextMetadata = (nextIsGood: boolean | null) => {
    // 点赞/点踩为“单选”状态；重复点击同一选项则取消（回到 null）
    const nextMetadata = { ...((message.metadata as any) ?? {}) } as Record<string, unknown>;
    if (nextIsGood === null) {
      delete nextMetadata.isGood;
    } else {
      nextMetadata.isGood = nextIsGood;
    }
    return Object.keys(nextMetadata).length > 0 ? nextMetadata : null;
  };

  // 处理好评点击
  const handleGoodRating = () => {
    if (!message.id) return;

    updateRatingMutation.mutate({
      sessionId,
      messageId: message.id,
      metadata: buildNextMetadata(ratingValue === true ? null : true),
    });
  };

  // 处理差评点击
  const handleBadRating = () => {
    if (!message.id) return;

    updateRatingMutation.mutate({
      sessionId,
      messageId: message.id,
      metadata: buildNextMetadata(ratingValue === false ? null : false),
    });
  };

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
    <div className={cn("group flex select-none items-center justify-start gap-0.5", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={messageActionIconButtonClassName}
        onClick={handleCopy}
        disabled={!text || isCopying}
        aria-label="复制"
        title="复制"
      >
        <Copy className="size-3" strokeWidth={2.5} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={messageActionIconButtonClassName}
        onClick={handleRetry}
        disabled={isBusy}
        aria-label="重试"
        title="重试"
      >
        <RotateCcw className="size-3" />
      </Button>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={messageActionIconButtonClassName}
            disabled={isBusy || isDeleting}
            aria-label="删除节点"
            title="删除节点"
          >
            <Trash2 className="size-3" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除该节点及其子节点？</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            删除后将无法恢复该节点及其所有后代消息。
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSubtree} disabled={isDeleting || isBusy}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={messageActionIconButtonClassName}
        onClick={handleGoodRating}
        disabled={isRating}
        aria-label="好评"
        title="好评"
      >
        <ThumbsUp
          className={cn(
            "size-3 transition-all",
            ratingValue === true && "fill-primary  text-primary"
          )}
        />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={messageActionIconButtonClassName}
        onClick={handleBadRating}
        disabled={isRating}
        aria-label="差评"
        title="差评"
      >
        <ThumbsDown
          className={cn(
            "size-3 transition-all",
            ratingValue === false && "fill-primary  text-primary"
          )}
        />
      </Button>

      {canCompact ? (
        <AlertDialog open={compactOpen} onOpenChange={setCompactOpen}>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={messageActionIconButtonClassName}
              disabled={isBusy}
              aria-label="压缩上下文"
              title="压缩上下文"
            >
              <Minimize2 className="size-3" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认压缩上下文？</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              该操作会生成一条压缩摘要，并用于后续对话上下文。
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleCompactConfirm} disabled={isBusy}>
                确认压缩
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={messageActionIconButtonClassName}
            disabled={!usage}
            aria-label="查看 token 用量"
            title="Token 用量"
          >
            <BarChart3 className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-xs">
          {usage ? (
            <div className="space-y-1">
              <div className="font-medium">Token 用量</div>
              {agentModel?.provider || agentModel?.modelId ? (
                <div className="opacity-90">
                  {agentModel?.provider ?? "-"} / {agentModel?.modelId ?? "-"}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 opacity-95">
                <div>输入</div>
                <div className="text-right tabular-nums">
                  {formatTokenCount(usage.inputTokens)}
                </div>
                {typeof usage.cachedInputTokens === "number" ? (
                  <>
                    <div>缓存输入</div>
                    <div className="text-right tabular-nums">
                      {formatTokenCount(usage.cachedInputTokens)}
                    </div>
                  </>
                ) : null}
                {typeof usage.noCacheTokens === "number" ? (
                  <>
                    <div>非缓存</div>
                    <div className="text-right tabular-nums">
                      {formatTokenCount(usage.noCacheTokens)}
                    </div>
                  </>
                ) : null}
                {typeof usage.reasoningTokens === "number" ? (
                  <>
                    <div>推理</div>
                    <div className="text-right tabular-nums">
                      {formatTokenCount(usage.reasoningTokens)}
                    </div>
                  </>
                ) : null}
                <div>输出</div>
                <div className="text-right tabular-nums">
                  {formatTokenCount(usage.outputTokens)}
                </div>
                <div>总计</div>
                <div className="text-right tabular-nums">
                  {formatTokenCount(usage.totalTokens)}
                </div>
              </div>
            </div>
          ) : (
            <div>暂无 token 信息</div>
          )}
        </TooltipContent>
      </Tooltip>

      <MessageBranchNav messageId={message.id} />

      {typeof assistantElapsedMs === "number" ? (
        <span className="ml-1 inline-flex select-none items-center gap-1 text-xs text-muted-foreground/60 tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
          <Clock3 className="size-3" />
          {formatDurationMs(assistantElapsedMs)}
        </span>
      ) : null}
    </div>
  );
}
