"use client";

import * as React from "react";
import type { UIMessage } from "@ai-sdk/react";
import { estimateModelPrice, resolvePriceTier, type ModelDefinition } from "@tenas-ai/api/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BarChart3, Clock3, Copy, RotateCcw, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { useChatContext } from "../ChatProvider";
import { trpc } from "@/utils/trpc";
import { useMutation } from "@tanstack/react-query";
import MessageBranchNav from "./MessageBranchNav";
import { getMessageTextWithToolCalls } from "@/lib/chat/message-text";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { messageActionIconButtonClassName } from "./message-action-styles";

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

type UsageCost = {
  inputCost?: number;
  outputCost?: number;
  cachedInputCost?: number;
  noCacheCost?: number;
  reasoningCost?: number;
  totalCost?: number;
  currencySymbol?: string;
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
 * Calculate usage cost from token usage and model pricing.
 */
function calculateUsageCost(
  usage: NormalizedTokenUsage | undefined,
  modelDefinition: ModelDefinition | undefined,
): UsageCost | undefined {
  if (!usage || !modelDefinition) return;
  const priceTiers = modelDefinition.priceTiers ?? [];
  const hasPricing =
    priceTiers.length > 0 &&
    priceTiers.some((tier) =>
      [tier.input, tier.inputCache, tier.output].some(
        (value) => typeof value === "number" && value > 0,
      ),
    );
  // 中文注释：没有可用单价或单价全为 0 时，不显示费用。
  if (!hasPricing) return;

  const { inputTokens, outputTokens, cachedInputTokens, noCacheTokens } = usage;
  const reasoningTokens = usage.reasoningTokens;
  const inputTokensValue =
    typeof noCacheTokens === "number" && Number.isFinite(noCacheTokens)
      ? noCacheTokens
      : typeof inputTokens === "number" && Number.isFinite(inputTokens)
        ? inputTokens
        : 0;
  const cacheTokensValue =
    typeof cachedInputTokens === "number" && Number.isFinite(cachedInputTokens)
      ? cachedInputTokens
      : 0;
  const outputTokensValue =
    typeof outputTokens === "number" && Number.isFinite(outputTokens)
      ? outputTokens
      : 0;
  const totalTokensValue =
    typeof usage.totalTokens === "number" && Number.isFinite(usage.totalTokens)
      ? usage.totalTokens
      : inputTokensValue + outputTokensValue;
  const contextK = Math.max(0, Math.ceil(totalTokensValue / 1000));

  const priceResult = estimateModelPrice(modelDefinition, {
    contextK,
    inputTokens: inputTokensValue,
    inputCacheTokens: cacheTokensValue,
    outputTokens: outputTokensValue,
  });
  if (!priceResult) return;

  const cachedInputCost =
    typeof cachedInputTokens === "number" && Number.isFinite(cachedInputTokens)
      ? priceResult.inputCacheCost
      : undefined;
  const noCacheCost =
    typeof noCacheTokens === "number" && Number.isFinite(noCacheTokens)
      ? priceResult.inputCost
      : undefined;

  const tier = resolvePriceTier(modelDefinition, contextK);
  // 中文注释：推理 token 暂按输出单价估算，避免遗漏成本显示。
  const reasoningCost =
    typeof reasoningTokens === "number" && Number.isFinite(reasoningTokens) && tier
      ? (reasoningTokens * tier.output) / 1_000_000
      : undefined;

  return {
    inputCost: priceResult.inputCost + priceResult.inputCacheCost,
    outputCost: priceResult.outputCost,
    cachedInputCost,
    noCacheCost,
    reasoningCost,
    totalCost: priceResult.total,
    currencySymbol: "",
  };
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
 * Format currency amount with a compact precision.
 */
function formatCurrencyAmount(value: number | undefined, currencySymbol = ""): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  const decimals = abs >= 1 ? 2 : abs >= 0.1 ? 3 : abs >= 0.01 ? 4 : 6;
  const formatted = value.toFixed(decimals);
  return currencySymbol ? `${currencySymbol}${formatted}` : formatted;
}

/**
 * Format token count with optional cost suffix.
 */
function formatTokenWithCost(
  tokenValue: unknown,
  costValue: number | undefined,
  currencySymbol = "",
): string {
  const tokenText = formatTokenCount(tokenValue);
  if (typeof costValue !== "number" || !Number.isFinite(costValue)) return tokenText;
  const costText = formatCurrencyAmount(costValue, currencySymbol);
  return `${tokenText} (${costText})`;
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
  const { retryAssistantMessage, clearError, status, updateMessage } = useChatContext();
  const [isCopying, setIsCopying] = React.useState(false);
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

  // 仅在“正在提交/流式输出”时禁用交互；error/ready 状态都允许重试
  const isBusy = status === "submitted" || status === "streaming";

  const ratingValue = (message.metadata as any)?.isGood ?? null;

  // 使用 TanStack React Query 调用接口更新评价
  const updateRatingMutation = useMutation({
    ...trpc.chatmessage.updateOneChatMessage.mutationOptions(),
    onSuccess: (result) => {
      // 成功后，用服务端返回的 metadata 更新到 useChatContext（可能为 null）
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
    | { model?: { provider?: string; modelId?: string }; modelDefinition?: ModelDefinition }
    | undefined;
  const agentModel = agentInfo?.model as { provider?: string; modelId?: string } | undefined;
  const agentModelDefinition = agentInfo?.modelDefinition;
  const usageCost = calculateUsageCost(usage, agentModelDefinition);
  const usageCurrency = usageCost?.currencySymbol ?? "";

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
      where: { id: message.id },
      data: {
        metadata: buildNextMetadata(ratingValue === true ? null : true),
      },
    });
  };

  // 处理差评点击
  const handleBadRating = () => {
    if (!message.id) return;

    updateRatingMutation.mutate({
      where: { id: message.id },
      data: {
        metadata: buildNextMetadata(ratingValue === false ? null : false),
      },
    });
  };

  return (
    <div className={cn("group flex ml-1 select-none items-center justify-start gap-0.5", className)}>
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

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={messageActionIconButtonClassName}
            disabled={!usage}
            aria-label="查看 token 用量与费用"
            title="Token 用量与费用"
          >
            <BarChart3 className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-xs">
          {usage ? (
            <div className="space-y-1">
              <div className="font-medium">Token 用量与费用</div>
              {agentModel?.provider || agentModel?.modelId ? (
                <div className="opacity-90">
                  {agentModel?.provider ?? "-"} / {agentModel?.modelId ?? "-"}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 opacity-95">
                <div>输入</div>
                <div className="text-right tabular-nums">
                  {formatTokenWithCost(usage.inputTokens, usageCost?.inputCost, usageCurrency)}
                </div>
                {typeof usage.cachedInputTokens === "number" ? (
                  <>
                    <div>缓存输入</div>
                    <div className="text-right tabular-nums">
                      {formatTokenWithCost(
                        usage.cachedInputTokens,
                        usageCost?.cachedInputCost,
                        usageCurrency,
                      )}
                    </div>
                  </>
                ) : null}
                {typeof usage.noCacheTokens === "number" ? (
                  <>
                    <div>非缓存</div>
                    <div className="text-right tabular-nums">
                      {formatTokenWithCost(
                        usage.noCacheTokens,
                        usageCost?.noCacheCost,
                        usageCurrency,
                      )}
                    </div>
                  </>
                ) : null}
                {typeof usage.reasoningTokens === "number" ? (
                  <>
                    <div>推理</div>
                    <div className="text-right tabular-nums">
                      {formatTokenWithCost(
                        usage.reasoningTokens,
                        usageCost?.reasoningCost,
                        usageCurrency,
                      )}
                    </div>
                  </>
                ) : null}
                <div>输出</div>
                <div className="text-right tabular-nums">
                  {formatTokenWithCost(usage.outputTokens, usageCost?.outputCost, usageCurrency)}
                </div>
                <div>总计</div>
                <div className="text-right tabular-nums">
                  {formatTokenWithCost(usage.totalTokens, usageCost?.totalCost, usageCurrency)}
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
