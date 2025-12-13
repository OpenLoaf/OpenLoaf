"use client";

import type { UIMessage } from "@ai-sdk/react";
import * as React from "react";
import MessageAction from "./MessageAction";
import MessageAi from "./MessageAi";
import MessageHuman from "./MessageHuman";
import MessageTool from "./MessageTool";

interface MessageItemProps {
  message: UIMessage;
  isLast?: boolean;
}

function MessageItem({ message, isLast }: MessageItemProps) {
  const toolParts = React.useMemo(() => {
    // AI SDK v6：工具调用 part.type 通常是 `tool-${name}` 或 `dynamic-tool`
    return (message.parts ?? []).filter((part: any) => {
      if (typeof part?.type !== "string") return false;
      return part.type === "dynamic-tool" || part.type.startsWith("tool-");
    });
  }, [message.parts]);

  return (
    <div>
      {message.role === "user" ? (
        <MessageHuman message={message} />
      ) : (
        <>
          <MessageAi message={message} />

          {/* 工具调用展示（MVP）：只显示工具名 + 返回结果 */}
          {toolParts.length > 0 ? (
            <div className="mt-2 space-y-2">
              {toolParts.map((part: any, partIndex: number) => (
                <MessageTool
                  key={`${message.id}-tool-${partIndex}`}
                  part={part}
                />
              ))}
            </div>
          ) : null}

          <MessageAction className="mt-1" message={message} canRetry={isLast} />
        </>
      )}
    </div>
  );
}

export default React.memo(MessageItem);
