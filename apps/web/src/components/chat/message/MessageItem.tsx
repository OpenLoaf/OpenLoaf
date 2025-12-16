"use client";

import type { UIMessage } from "@ai-sdk/react";
import * as React from "react";
import { cn } from "@/lib/utils";
import MessageAiAction from "./MessageAiAction";
import MessageAi from "./MessageAi";
import MessageHuman from "./MessageHuman";
import MessageHumanAction from "./MessageHumanAction";

interface MessageItemProps {
  message: UIMessage;
  isLastHumanMessage?: boolean;
  isLastAiMessage?: boolean;
}

function MessageItem({
  message,
  isLastHumanMessage,
  isLastAiMessage,
}: MessageItemProps) {
  const actionVisibility = (showAlways?: boolean) =>
    cn(
      "transition-opacity duration-200",
      showAlways
        ? "opacity-100"
        : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
    );

  return (
    <div className={cn("group my-0.5", message.role === "user" && "mr-4")}>
      {message.role === "user" ? (
        <>
          <MessageHuman message={message} />
          <MessageHumanAction
            message={message}
            actionsClassName={actionVisibility(isLastHumanMessage)}
          />
        </>
      ) : (
        <>
          <MessageAi message={message} />
          <div className={cn("mt-1", actionVisibility(isLastAiMessage))}>
            <MessageAiAction
              message={message}
              canRetry={Boolean(isLastAiMessage)}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default React.memo(MessageItem);
