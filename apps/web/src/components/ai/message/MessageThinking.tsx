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
import { useTranslation } from "react-i18next";
import AssistantMessageHeader from "./AssistantMessageHeader";

export default function MessageThinking({ showHeader = true }: { showHeader?: boolean }) {
  const { t } = useTranslation("ai");
  return (
    <Message from="assistant" className="max-w-[80%] mt-2">
      {showHeader && <AssistantMessageHeader />}
      <MessageContent className="gap-0">
        <Reasoning isStreaming defaultOpen={false} className="mb-0 px-1">
          <ReasoningTrigger
            getThinkingMessage={() => <Shimmer>{t("tool.thinkingStreaming")}</Shimmer>}
          />
          <ReasoningContent className="mt-0.5 text-xs text-muted-foreground">
            {t("tool.thinkingAnalyzing")}
          </ReasoningContent>
        </Reasoning>
      </MessageContent>
    </Message>
  );
}
