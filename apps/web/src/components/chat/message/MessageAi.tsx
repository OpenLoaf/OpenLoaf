"use client";

import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";
import MessageSubAgent from "./tools/MessageSubAgent";
import { renderMessageParts } from "./renderMessageParts";

interface MessageAiProps {
  message: UIMessage;
  className?: string;
}

export default function MessageAi({ message, className }: MessageAiProps) {
  const agentKind = (message.metadata as any)?.agent?.kind as string | undefined;
  if (agentKind === "sub") {
    return <MessageSubAgent message={message} className={className} />;
  }

  return (
    <div className={cn("flex justify-start min-w-0", className)}>
      <div className="min-w-0 w-full space-y-2">
        {renderMessageParts(message.parts as any[])}
      </div>
    </div>
  );
}
