"use client";

import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";
import { renderMessageParts } from "./renderMessageParts";
import MessageToolSubAgent from "./tools/MessageToolSubAgent";

interface MessageAiProps {
  message: UIMessage;
  className?: string;
  subAgentMessages?: UIMessage[];
}

export default function MessageAi({ message, className, subAgentMessages }: MessageAiProps) {
  return (
    <div className={cn("flex justify-start min-w-0", className)}>
      <div className="min-w-0 w-full space-y-2">
        {renderMessageParts(message.parts as any[], {
          renderSubAgentTool: (part, index) => (
            <MessageToolSubAgent
              key={(part as any)?.toolCallId ?? `sub-agent-${index}`}
              part={part as any}
              subMessages={subAgentMessages ?? []}
            />
          ),
        })}
      </div>
    </div>
  );
}
