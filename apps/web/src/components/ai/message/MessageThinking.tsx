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
import {
  Reasoning,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { CollapsibleContent } from "@openloaf/ui/collapsible";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { useTranslation } from "react-i18next";
import { BrainIcon } from "lucide-react";
import AssistantMessageHeader, { AssistantAvatar } from "./AssistantMessageHeader";

/**
 * Extract the currently-streaming reasoning text.
 * - Only show text from reasoning parts that are still streaming (state !== "done").
 * - Once reasoning-end fires (state="done"), clear — the next block starts fresh.
 * - Collapse multi-line breaks and cap at 3 lines.
 */
function useStreamingReasoningText(message: UIMessage | null | undefined): string {
  return React.useMemo(() => {
    if (!message) return "";
    const parts = Array.isArray(message.parts) ? message.parts : [];
    let activeText = "";
    let lastDoneText = "";
    for (const part of parts) {
      if ((part as any)?.type === "reasoning") {
        const text = String((part as any)?.text ?? "").trim();
        if ((part as any)?.state === "done") {
          // 记住最后一个已完成的 reasoning 文本，用于新 step 开始时的过渡
          if (text) lastDoneText = text;
        } else {
          // Currently streaming — show its text.
          activeText = text;
        }
      }
    }
    // 新 step 的 streaming reasoning 还没收到文本时，显示上一个已完成的内容，避免闪回 fallback
    if (!activeText && lastDoneText) {
      activeText = lastDoneText;
    }
    if (!activeText) return "";
    // Collapse consecutive blank lines into a single newline.
    activeText = activeText.replace(/\n{2,}/g, "\n");
    // Keep only the last 3 lines so the indicator stays compact.
    const lines = activeText.split("\n");
    if (lines.length > 3) {
      activeText = lines.slice(-3).join("\n");
    }
    return activeText;
  }, [message]);
}

export default function MessageThinking({
  showHeader = true,
  streamingMessage,
  awaitingTool = false,
}: {
  showHeader?: boolean;
  streamingMessage?: UIMessage | null;
  /** 是否处于「工具已派发、等待执行结果」阶段；由 MessageList 通过 parts + toolParts snapshot 计算。 */
  awaitingTool?: boolean;
}) {
  const { t } = useTranslation("ai");
  const reasoningText = useStreamingReasoningText(streamingMessage);

  return (
    <Message from="assistant" className="min-w-0 w-full mt-2">
      {showHeader && (
        <div className="flex items-center gap-2">
          <AssistantAvatar />
          <AssistantMessageHeader />
        </div>
      )}
      <MessageContent className="min-w-0 w-full gap-0">
        {awaitingTool ? (
          <div className="flex w-full items-center gap-2 text-muted-foreground text-sm">
            <div className="flex size-6 shrink-0 items-center justify-center">
              <BrainIcon className="size-4" />
            </div>
            <Shimmer>{t("tool.thinkingAwaitingTool")}</Shimmer>
          </div>
        ) : (
          <Reasoning isStreaming className="mb-0">
            <ReasoningTrigger
              getThinkingMessage={() => (
                <Shimmer>{t("tool.thinkingStreaming")}</Shimmer>
              )}
            />
            <CollapsibleContent className="mt-0.5 pl-8 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-xs leading-5 text-muted-foreground line-clamp-3">
              {reasoningText || t("tool.thinkingAnalyzing")}
            </CollapsibleContent>
          </Reasoning>
        )}
      </MessageContent>
    </Message>
  );
}
