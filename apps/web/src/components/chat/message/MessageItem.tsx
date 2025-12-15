"use client";

import type { UIMessage } from "@ai-sdk/react";
import * as React from "react";
import MessageAction from "./MessageAction";
import MessageAi from "./MessageAi";
import MessageHuman from "./MessageHuman";

interface MessageItemProps {
  message: UIMessage;
  isLastHumanMessage?: boolean;
}

function MessageItem({ message, isLastHumanMessage }: MessageItemProps) {
  return (
    <div>
      {message.role === "user" ? (
        <MessageHuman
          message={message}
          isLastHumanMessage={isLastHumanMessage}
        />
      ) : (
        <>
          <MessageAi message={message} />

          <MessageAction className="mt-1" message={message} canRetry={false} />
        </>
      )}
    </div>
  );
}

export default React.memo(MessageItem);
