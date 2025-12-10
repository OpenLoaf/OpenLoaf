"use client";

import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";

interface MessageItemProps {
  message: UIMessage;
  className?: string;
}

export default function MessageItem({ message, className }: MessageItemProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        `flex ${isUser ? "justify-end" : "justify-start"}`,
        className
      )}
    >
      <div
        className={`max-w-[80%] p-3 rounded-lg ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground"
        }`}
      >
        {message.parts.map((part: any, index: number) => (
          <div key={index} className="whitespace-pre-wrap text-sm">
            {part.type === "text" && part.text}
          </div>
        ))}
      </div>
    </div>
  );
}
