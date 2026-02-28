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

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Message, MessageContent } from "@/components/ai-elements/message";

export default function MessageThinking() {
  return (
    <Message from="assistant" className="max-w-[80%] mt-2">
      <MessageContent className="gap-0">
        <Reasoning isStreaming defaultOpen={false} className="mb-0">
          <ReasoningTrigger
            getThinkingMessage={() => <Shimmer>深度思考中...</Shimmer>}
          />
          <ReasoningContent className="mt-0.5 text-xs text-muted-foreground">
            {"正在分析上下文并生成计划，请稍候..."}
          </ReasoningContent>
        </Reasoning>
      </MessageContent>
    </Message>
  );
}
