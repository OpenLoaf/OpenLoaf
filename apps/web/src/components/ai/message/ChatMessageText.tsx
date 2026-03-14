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
import { FileText, Sparkles } from "lucide-react";
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
import { openSkillInStack } from "@/components/setting/skills/skill-utils";

interface ChatMessageTextProps {
  value: string;
  className?: string;
  projectId?: string;
}

export default function ChatMessageText({ value, className, projectId }: ChatMessageTextProps) {
  const normalizedValue = React.useMemo(() => preprocessChatText(value), [value]);
  const segments = React.useMemo(() => parseChatTextTokens(normalizedValue), [normalizedValue]);
  const hasSpecialTokens = React.useMemo(
    () => segments.some((segment) => segment.type !== "text"),
    [segments],
  );

  const handleSkillClick = React.useCallback(
    (skillName: string) => {
      openSkillInStack(skillName, projectId);
    },
    [projectId],
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

    if (segment.type === "skill") {
      return (
        <span
          key={`skill-${index}`}
          className="inline-flex items-center gap-[3px] align-middle py-px px-1.5 mx-0.5 rounded-md bg-purple-200/80 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-xs font-medium leading-[18px] cursor-pointer select-none whitespace-nowrap max-w-[200px] hover:bg-purple-300 dark:hover:bg-purple-900/60 transition-colors"
          onClick={() => handleSkillClick(segment.value)}
        >
          <Sparkles className="size-3 shrink-0" />
          <span className="overflow-hidden text-ellipsis">{segment.value}</span>
        </span>
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
          className="inline-flex items-center gap-[3px] align-middle py-px px-1.5 mx-0.5 rounded-md bg-blue-200/80 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs font-medium leading-[18px] cursor-pointer select-none whitespace-nowrap max-w-[200px] hover:bg-blue-300 dark:hover:bg-blue-900/60 transition-colors"
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
