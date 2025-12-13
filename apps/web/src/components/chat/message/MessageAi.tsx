"use client";

import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MarkdownCode from "./markdown/MarkdownCode";
import MarkdownPre from "./markdown/MarkdownPre";
import MarkdownTable from "./markdown/MarkdownTable";

interface MessageAiProps {
  message: UIMessage;
  className?: string;
}

export default function MessageAi({ message, className }: MessageAiProps) {
  return (
    <div className={cn("flex justify-start min-w-0", className)}>
      <div className="min-w-0 w-full">
        {message.parts.map((part: any, index: number) => {
          if (part.type !== "text") return null;
          return (
            <div
              key={index}
              className={cn(
                "min-w-0 w-full max-w-none font-sans prose prose-sm dark:prose-invert break-words [overflow-wrap:anywhere]",
                "text-[12px] leading-5",
                "prose-p:text-[12px] prose-li:text-[12px] prose-strong:text-[12px] prose-em:text-[12px] prose-blockquote:text-[12px]",
                "prose-code:text-[11px] prose-pre:text-[11px]",
                "prose-pre:max-w-full prose-pre:overflow-x-auto prose-pre:rounded prose-pre:bg-muted prose-pre:p-3",
                "prose-pre:font-mono prose-code:font-mono",
                "prose-a:break-all",
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
        })}
      </div>
    </div>
  );
}
