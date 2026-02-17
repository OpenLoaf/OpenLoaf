"use client";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Message, MessageContent } from "@/components/ai-elements/message";

export default function MessageThinking() {
  return (
    <Message from="assistant" className="max-w-[80%]">
      <MessageContent className="rounded-md border border-border/60 bg-background/80 px-3 py-2">
        <Reasoning isStreaming defaultOpen>
          <ReasoningTrigger
            getThinkingMessage={() => <Shimmer>深度思考中...</Shimmer>}
          />
          <ReasoningContent>
            {"正在分析上下文并生成计划，请稍候..."}
          </ReasoningContent>
        </Reasoning>
      </MessageContent>
    </Message>
  );
}
