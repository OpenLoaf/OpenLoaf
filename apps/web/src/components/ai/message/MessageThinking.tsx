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
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { useTranslation } from "react-i18next";
import AssistantMessageHeader from "./AssistantMessageHeader";

/** Extract reasoning text from a streaming message's parts. */
function useStreamingReasoningText(message: UIMessage | null | undefined): string {
  return React.useMemo(() => {
    if (!message) return "";
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const chunks: string[] = [];
    for (const part of parts) {
      if ((part as any)?.type === "reasoning") {
        const text = String((part as any)?.text ?? "").trim();
        if (text) chunks.push(text);
      }
    }
    return chunks.join("\n\n");
  }, [message]);
}

export default function MessageThinking({
  showHeader = true,
  streamingMessage,
}: {
  showHeader?: boolean;
  streamingMessage?: UIMessage | null;
}) {
  const { t } = useTranslation("ai");
  const reasoningText = useStreamingReasoningText(streamingMessage);

  return (
    <Message from="assistant" className="max-w-[80%] mt-2">
      {showHeader && <AssistantMessageHeader />}
      <MessageContent className="gap-0">
        <Reasoning isStreaming className="mb-0 px-1">
          <ReasoningTrigger
            getThinkingMessage={() => <Shimmer>{t("tool.thinkingStreaming")}</Shimmer>}
          />
          <ReasoningContent className="mt-0.5 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-xs text-muted-foreground">
            {reasoningText || t("tool.thinkingAnalyzing")}
          </ReasoningContent>
        </Reasoning>
      </MessageContent>
    </Message>
  );
}
