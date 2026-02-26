"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { markdownComponents } from "./markdown/MarkdownComponents";
import { MessageResponse } from "@/components/ai-elements/message";
import { Snippet, SnippetAddon, SnippetText } from "@/components/ai-elements/snippet";
import {
  parseChatTextTokens,
  preprocessChatText,
  type ChatTextToken,
} from "./text-tokenizer";

interface ChatMessageTextProps {
  value: string;
  className?: string;
}

/** Split edge whitespace to avoid markdown renderer trimming. */
function splitEdgeWhitespace(value: string): {
  leading: string;
  core: string;
  trailing: string;
} {
  if (!value) {
    return { leading: "", core: "", trailing: "" };
  }
  const leadingMatch = value.match(/^\s+/);
  const trailingMatch = value.match(/\s+$/);
  const leading = leadingMatch?.[0] ?? "";
  const trailing = trailingMatch?.[0] ?? "";
  const coreStart = leading.length;
  const coreEnd = value.length - trailing.length;
  const core = coreEnd > coreStart ? value.slice(coreStart, coreEnd) : "";
  return { leading, core, trailing };
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
      <MessageResponse
        className={cn("text-[13px] leading-5 break-words", className)}
        components={markdownComponents}
        parseIncompleteMarkdown
      >
        {normalizedValue}
      </MessageResponse>
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
      const mentionValue = `@${segment.value}`;
      return (
        <span
          key={`mention-${index}`}
          data-openloaf-mention="true"
          data-mention-value={segment.value}
          data-slate-value={segment.value}
          className="inline-flex align-middle"
        >
          <Snippet
            code={mentionValue}
            className="inline-flex h-6 w-auto max-w-full rounded-md border border-primary/40 bg-primary/10"
          >
            <SnippetAddon>
              <SnippetText className="px-2 text-[11px] font-semibold text-foreground">
                {mentionValue}
              </SnippetText>
            </SnippetAddon>
          </Snippet>
        </span>
      );
    }

    const { leading, core, trailing } = splitEdgeWhitespace(segment.value);
    return (
      <React.Fragment key={`text-${index}`}>
        {leading ? <span>{leading}</span> : null}
        {core ? (
          <MessageResponse
            className={cn(
              "inline align-baseline [&_p]:inline [&_p]:m-0",
              "[&_em]:align-baseline [&_strong]:align-baseline",
              "[&_code]:align-baseline",
            )}
            components={markdownComponents}
            parseIncompleteMarkdown
          >
            {core}
          </MessageResponse>
        ) : null}
        {trailing ? <span>{trailing}</span> : null}
      </React.Fragment>
    );
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
