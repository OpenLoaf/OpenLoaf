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

const MESSAGE_TOKEN_CHIP_BASE_CLASS = cn(
  "inline-flex items-center gap-[3px] align-middle px-1.5 py-px mx-0.5 rounded-md border border-transparent",
  "text-xs font-medium leading-[18px] cursor-pointer select-none whitespace-nowrap max-w-[200px] transition-colors",
);

const SKILL_TOKEN_CHIP_CLASS = cn(
  MESSAGE_TOKEN_CHIP_BASE_CLASS,
  "bg-[var(--ol-skill-chip-bg)] text-[var(--ol-skill-chip-text)] hover:bg-[var(--ol-skill-chip-bg-hover)]",
);

const MENTION_TOKEN_CHIP_CLASS = cn(
  MESSAGE_TOKEN_CHIP_BASE_CLASS,
  "bg-ol-blue-bg text-ol-blue hover:bg-ol-blue-bg-hover",
);

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
      const label = segment.displayName || segment.value;
      return (
        <span
          key={`skill-${index}`}
          className={SKILL_TOKEN_CHIP_CLASS}
          onClick={() => handleSkillClick(segment.value)}
        >
          <Sparkles className="size-3 shrink-0 text-current" />
          <span className="overflow-hidden text-ellipsis">{label}</span>
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
          className={MENTION_TOKEN_CHIP_CLASS}
        >
          <FileText className="size-3 shrink-0 text-current" />
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
