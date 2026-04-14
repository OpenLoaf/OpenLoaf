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

import { createElement } from "react";
import { EyeOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useChatStatus, useChatTools } from "../../context";
import { getToolKind, type AnyToolPart, type ToolVariant } from "./shared/tool-utils";
import { findToolEntry, CliThinkingTool, UnifiedTool } from "./tool-registry";
import { useBasicConfig } from "@/hooks/use-basic-config";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@openloaf/ui/tooltip";

/**
 * 工具调用消息组件
 * 通过 tool-registry 查找对应组件渲染。
 */
export default function MessageTool({
  part,
  className,
  variant = "default",
  messageId,
}: {
  part: AnyToolPart;
  className?: string;
  variant?: ToolVariant;
  messageId?: string;
}) {
  const { t } = useTranslation("ai");
  const { status } = useChatStatus();
  const { toolParts } = useChatTools();
  const { basic } = useBasicConfig();
  if (!part) return null;
  const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
  const toolSnapshot = toolCallId ? toolParts[toolCallId] : undefined;
  const safeSnapshot = toolSnapshot
    ? ({
        ...toolSnapshot,
        errorText: toolSnapshot.errorText ?? undefined,
      } as Partial<AnyToolPart>)
    : undefined;
  // 逻辑：tool streaming 状态以 toolParts 为准，覆盖 message part。
  let resolvedPart: AnyToolPart = safeSnapshot ? { ...part, ...safeSnapshot } : part;
  if (
    status === "ready" &&
    (resolvedPart.state === "input-streaming" || resolvedPart.state === "output-streaming")
  ) {
    // 逻辑：会话已结束但数据库残留 streaming 状态时，强制终止流式显示。
    resolvedPart = {
      ...resolvedPart,
      state: resolvedPart.state === "input-streaming" ? "input-available" : "output-available",
    };
  }

  if (resolvedPart.variant === "cli-thinking") {
    return <CliThinkingTool part={resolvedPart} />;
  }

  const toolKind = getToolKind(resolvedPart).toLowerCase();
  const providerExecuted = !!resolvedPart.providerExecuted;

  // Registry lookup
  const entry = findToolEntry(toolKind, providerExecuted, resolvedPart);
  if (entry) {
    return (
      <div>
        {createElement(entry.component, {
          part: resolvedPart,
          className,
          variant,
          messageId,
          ...entry.extraProps,
        })}
      </div>
    );
  }

  // providerExecuted 但 registry 没匹配到的 CLI 工具，不 fallback
  // 非 providerExecuted 且 registry 没匹配到的：也尝试 non-provider registry
  if (providerExecuted) {
    const nonProviderEntry = findToolEntry(toolKind, false, resolvedPart);
    if (nonProviderEntry) {
      return (
        <div>
          {createElement(nonProviderEntry.component, {
            part: resolvedPart,
            className,
            variant,
            messageId,
            ...nonProviderEntry.extraProps,
          })}
        </div>
      );
    }
  }

  // 没有专用 UI 的工具：成功后隐藏，出错/拒绝时保留显示。
  // 当用户开启"显示所有工具调用结果"时，成功的工具也保持显示。
  const isCompleted = resolvedPart.state === 'output-available'
    || resolvedPart.state === 'output-error'
    || resolvedPart.state === 'output-denied'
  const hasError = resolvedPart.state === 'output-error' || resolvedPart.state === 'output-denied'
  if (isCompleted && !hasError && !basic.chatShowAllToolResults) return null

  // 只有在"因为开关打开才被显示"的情况下才标记：成功完成 + 无错误。
  // 关掉开关后这些工具会消失，用 EyeOff badge 提示用户。
  const isVerboseOnly = isCompleted && !hasError;

  return (
    <div className="relative">
      <UnifiedTool part={resolvedPart} className={className} variant={variant} messageId={messageId} />
      {isVerboseOnly ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="pointer-events-auto absolute right-1 top-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/60"
              aria-label={t("tool.verboseOnlyHint", "关闭「显示所有工具调用结果」后此工具将被隐藏")}
            >
              <EyeOffIcon className="size-2.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {t("tool.verboseOnlyHint", "关闭「显示所有工具调用结果」后此工具将被隐藏")}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
