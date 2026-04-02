"use client";

import type { CSSProperties, ForwardedRef } from "react";
import * as React from "react";
import { Streamdown, type StreamdownProps } from "streamdown";
import { code } from "@streamdown/code";
import { cn } from "@/lib/utils";
import { preprocessChatText } from "../text-tokenizer";
import { markdownComponents } from "./MarkdownComponents";
/** Shared typography preset for chat-style streaming markdown content. */
export const MESSAGE_STREAM_MARKDOWN_CLASSNAME = cn(
  // Avoid `w-full` + horizontal margins causing width overflow.
  "min-w-0 w-full max-w-full px-1 font-sans prose prose-neutral dark:prose-invert break-words [overflow-wrap:anywhere]",
  // Base text settings
  "text-sm leading-relaxed",
  // Element spacing adjustments
  "prose-p:my-2 prose-p:leading-relaxed prose-p:first:mt-0 prose-p:last:mb-0",
  "prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:first:mt-0",
  "prose-h1:text-base prose-h2:text-[15px] prose-h3:text-sm prose-h4:text-sm",
  "prose-ul:my-2 prose-ul:pl-5 prose-ol:my-2 prose-ol:pl-5 prose-li:my-0.5 prose-li:marker:text-muted-foreground",
  // Code block styling (handled by @streamdown/code plugin)
  "prose-pre:p-0 prose-pre:bg-transparent prose-pre:m-0 prose-pre:overflow-x-auto",
  // Inline code styling
  "prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.9em] prose-code:font-normal prose-code:bg-muted/50 prose-code:rounded-3xl prose-code:before:content-none prose-code:after:content-none",
  // Other elements
  "prose-blockquote:not-italic prose-blockquote:border-l-primary/50 prose-blockquote:text-muted-foreground",
  "prose-a:break-all prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
  "prose-table:block prose-table:max-w-full prose-table:overflow-x-auto",
  // Ensure media never overflows the chat width.
  "prose-img:max-w-full prose-img:h-auto",
);

/** Streamdown plugins — code highlighting via Shiki. */
const streamdownPlugins = { code } as const;

type MessageStreamMarkdownProps = Omit<
  StreamdownProps,
  "children" | "components" | "className" | "plugins"
> & {
  /** Raw markdown text coming from chat-like message parts. */
  markdown: string;
  /** Wrapper class names used for typography and layout. */
  className?: string;
  /** Optional inline styles for caller-controlled sizing/colors. */
  style?: CSSProperties;
  /** Extra class names applied to the inner Streamdown root. */
  contentClassName?: string;
};

/** Render chat-style streaming markdown with shared tokenizer and component mapping. */
function MessageStreamMarkdownInner(
  {
    markdown,
    className,
    style,
    contentClassName,
    parseIncompleteMarkdown = true,
    ...streamdownProps
  }: MessageStreamMarkdownProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const normalizedMarkdown = React.useMemo(
    () => preprocessChatText(markdown),
    [markdown],
  );

  return (
    <div ref={ref} className={className} style={style}>
      <Streamdown
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          contentClassName,
        )}
        components={markdownComponents}
        plugins={streamdownPlugins}
        parseIncompleteMarkdown={parseIncompleteMarkdown}
        {...streamdownProps}
      >
        {normalizedMarkdown}
      </Streamdown>
    </div>
  );
}

export const MessageStreamMarkdown = React.forwardRef(MessageStreamMarkdownInner);

MessageStreamMarkdown.displayName = "MessageStreamMarkdown";
