"use client";

import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";

interface MessageHumanProps {
  message: UIMessage;
  className?: string;
}

export default function MessageHuman({
  message,
  className,
}: MessageHumanProps) {
  return (
    <div className={cn("flex justify-end my-0.5", className)}>
      <div className="max-w-[80%] p-3 rounded-lg bg-primary text-primary-foreground">
        {message.parts.map((part: any, index: number) => (
          <div key={index} className="whitespace-pre-wrap text-sm">
            {part.type === "text" && part.text}
          </div>
        ))}
      </div>
    </div>
  );
}
