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
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Snippet, SnippetAddon, SnippetText } from "@/components/ai-elements/snippet";
import {
  parseChatTextTokens,
  preprocessChatText,
  type ChatTextToken,
} from "./text-tokenizer";
import { getFileLabel } from "@/components/ai/input/chat-input-utils";
import {
  isImagePath,
  isVideoPath,
  MentionImageThumbnail,
  MentionVideoThumbnail,
} from "./MentionMediaThumbnail";

interface ChatMessageTextProps {
  value: string;
  className?: string;
}

export default function ChatMessageText({ value, className }: ChatMessageTextProps) {
  const normalizedValue = React.useMemo(() => preprocessChatText(value), [value]);
  const segments = React.useMemo(() => parseChatTextTokens(normalizedValue), [normalizedValue]);
  const hasSpecialTokens = React.useMemo(
    () => segments.some((segment) => segment.type !== "text"),
    [segments],
  );

  if (!hasSpecialTokens) {
    return (
      <div className={cn("text-[13px] leading-5 break-words whitespace-pre-wrap", className)}>
        {normalizedValue}
      </div>
    );
  }

  const renderToken = (segment: ChatTextToken, index: number) => {
    if (segment.type === "command") {
      return (
        <Snippet
          key={`command-${index}`}
          code={segment.value}
          className="inline-flex h-6 w-auto max-w-full align-middle rounded-md border border-border/60 bg-muted/60"
        >
          <SnippetAddon>
            <SnippetText className="px-2 text-[11px] font-semibold text-foreground">
              {segment.value}
            </SnippetText>
          </SnippetAddon>
        </Snippet>
      );
    }

    if (segment.type === "mention") {
      if (isImagePath(segment.value)) {
        return <MentionImageThumbnail key={`mention-${index}`} path={segment.value} />;
      }
      if (isVideoPath(segment.value)) {
        return <MentionVideoThumbnail key={`mention-${index}`} path={segment.value} />;
      }
      const label = getFileLabel(segment.value);
      return (
        <span
          key={`mention-${index}`}
          data-openloaf-mention="true"
          data-mention-value={segment.value}
          data-slate-value={segment.value}
          className="inline-flex items-center gap-[3px] align-middle py-px px-1.5 mx-0.5 rounded-md bg-ol-blue text-white text-xs font-medium leading-[18px] cursor-pointer select-none whitespace-nowrap max-w-[200px] hover:bg-ol-blue/90 transition-colors"
        >
          <FileText className="size-3 shrink-0" />
          <span className="overflow-hidden text-ellipsis">{label}</span>
        </span>
      );
    }

    return <React.Fragment key={`text-${index}`}>{segment.value}</React.Fragment>;
  };

  return (
    <div
      className={cn("text-[13px] leading-5 break-words whitespace-pre-wrap", className)}
      data-openloaf-chat-message="true"
    >
      {segments.map(renderToken)}
    </div>
  );
}
