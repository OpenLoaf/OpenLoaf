"use client";

import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";

interface MessageAiProps {
  message: UIMessage;
  className?: string;
}

export default function MessageAi({ message, className }: MessageAiProps) {
  return (
    <div className={cn("flex justify-start", className)}>
      <div className="max-w-[80%] p-3 rounded-lg bg-secondary text-secondary-foreground">
        {message.parts.map((part: any, index: number) => (
          <div key={index} className="whitespace-pre-wrap text-sm">
            {part.type === "text" && part.text}
          </div>
        ))}
      </div>
    </div>
  );
}
