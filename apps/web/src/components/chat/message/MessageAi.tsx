"use client";

import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageAiProps {
  message: UIMessage;
  className?: string;
}

export default function MessageAi({ message, className }: MessageAiProps) {
  return (
    <div className={cn("flex justify-start", className)}>
      <div className="max-w-[80%] p-3 rounded-lg bg-secondary text-secondary-foreground overflow-hidden">
        {message.parts.map((part: any, index: number) => {
          if (part.type === "text") {
            return (
              <div
                key={index}
                className="prose prose-sm dark:prose-invert max-w-none break-words"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {part.text}
                </ReactMarkdown>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}