"use client";

import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MarkdownCode from "./markdown/MarkdownCodeInline";
import MarkdownPre from "./markdown/MarkdownPre";
import MarkdownTable from "./markdown/MarkdownTable";
import MessageTool from "./MessageTool";

interface MessageAiProps {
  message: UIMessage;
  className?: string;
}

export default function MessageAi({ message, className }: MessageAiProps) {
  return (
    <div className={cn("flex justify-start min-w-0", className)}>
      <div className="min-w-0 w-full space-y-2">
        {message.parts.map((part: any, index: number) => {
          if (part?.type === "text") {
            return (
              <div
                key={index}
                className={cn(
                  "min-w-0 w-full max-w-none font-sans prose prose-neutral dark:prose-invert break-words [overflow-wrap:anywhere]",
                  // Base text settings
                  "text-sm leading-relaxed",
                  // Element spacing adjustments
                  "prose-p:my-2 prose-p:leading-relaxed prose-p:first:mt-0 prose-p:last:mb-0",
                  "prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:first:mt-0",
                  "prose-h1:text-base prose-h2:text-[15px] prose-h3:text-sm prose-h4:text-sm",
                  "prose-ul:my-2 prose-ul:pl-5 prose-ol:my-2 prose-ol:pl-5 prose-li:my-0.5 prose-li:marker:text-muted-foreground",
                  // Code block styling (handled by components but resetting some defaults)
                  "prose-pre:p-0 prose-pre:bg-transparent prose-pre:m-0",
                  // Inline code styling
                  "prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.9em] prose-code:font-normal prose-code:bg-muted/50 prose-code:rounded-sm prose-code:before:content-none prose-code:after:content-none",
                  // Other elements
                  "prose-blockquote:not-italic prose-blockquote:border-l-primary/50 prose-blockquote:text-muted-foreground",
                  "prose-a:break-all prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
                  "prose-table:block prose-table:max-w-full prose-table:overflow-x-auto"
                )}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    pre: MarkdownPre as any,
                    code: MarkdownCode as any,
                    table: MarkdownTable as any,
                  }}
                >
                  {part.text}
                </ReactMarkdown>
              </div>
            );
          }

          if (
            typeof part?.type === "string" &&
            (part.type === "dynamic-tool" || part.type.startsWith("tool-"))
          ) {
            return (
              <MessageTool
                key={part.toolCallId ?? `${part.type}-${index}`}
                part={part}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
